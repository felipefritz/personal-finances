import ast
import json
import os
import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, and_

from app.core.database import get_session, engine
from app.models.bank_connection import BankConnection
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.category import Category
from app.core.config import settings
from app.schemas.bank_connection import (
    BankConnectionCreate,
    BankConnectionRead,
    FintocCredentialsRead,
    FintocConnectRequest,
    FintocSyncRequest,
    FintocUpdateCredentialsRequest,
)
from app.services.bank_providers.fintoc import FintocProvider
from app.services.categorization_service import suggest_category

router = APIRouter(prefix="/bank-connections", tags=["Bank Connections"])
fintoc = FintocProvider()


def _mask_sensitive(value: Optional[str], start: int = 6, end: int = 4) -> Optional[str]:
    if not value:
        return None
    if len(value) <= (start + end):
        return "*" * len(value)
    return f"{value[:start]}...{value[-end:]}"


def _set_runtime_secret_from_connection(conn: BankConnection) -> None:
    """Load persisted secret key into provider runtime when available."""
    metadata = _load_connection_metadata(conn)
    saved_secret = metadata.get("fintoc_secret_key") if isinstance(metadata, dict) else None
    if isinstance(saved_secret, str) and saved_secret.strip():
        fintoc.secret_key = saved_secret.strip()


def _request_refresh_intent_if_due(conn: BankConnection) -> Dict[str, Any]:
    """Trigger refresh_intents when enough time has passed since last request."""
    if not settings.FINTOC_REFRESH_INTENT_ENABLED:
        return {"requested": False, "reason": "disabled"}

    metadata = _load_connection_metadata(conn)
    last_requested_raw = metadata.get("last_refresh_intent_requested_at") if isinstance(metadata, dict) else None
    now = datetime.utcnow()

    if isinstance(last_requested_raw, str):
        try:
            last_requested_at = datetime.fromisoformat(last_requested_raw)
            elapsed = (now - last_requested_at).total_seconds()
            if elapsed < float(settings.FINTOC_REFRESH_INTENT_INTERVAL_SECONDS):
                return {"requested": False, "reason": "interval-not-reached", "seconds_since_last": elapsed}
        except ValueError:
            pass

    try:
        refresh_response = fintoc.create_refresh_intent(conn.access_token or "")
        metadata["last_refresh_intent_requested_at"] = now.isoformat()
        metadata["last_refresh_intent_response"] = refresh_response
        metadata.pop("last_refresh_intent_error", None)
        _save_connection_metadata(conn, metadata)
        conn.updated_at = now
        return {"requested": bool(refresh_response.get("requested", True)), "response": refresh_response}
    except Exception as exc:
        metadata["last_refresh_intent_requested_at"] = now.isoformat()
        metadata["last_refresh_intent_error"] = str(exc)
        _save_connection_metadata(conn, metadata)
        conn.updated_at = now
        # Non-blocking: continue sync even if refresh intent fails.
        return {"requested": False, "reason": "error", "error": str(exc)}


def _enrich_connection_read(conn: BankConnection) -> BankConnectionRead:
    metadata = _load_connection_metadata(conn)
    saved_secret = metadata.get("fintoc_secret_key") if isinstance(metadata, dict) else None
    has_secret = bool(isinstance(saved_secret, str) and saved_secret.strip())
    token = conn.access_token or ""

    return BankConnectionRead(
        id=conn.id,
        provider=conn.provider,
        display_name=conn.display_name,
        status=conn.status,
        last_sync=conn.last_sync,
        account_id=conn.account_id,
        has_access_token=bool(token),
        access_token_masked=_mask_sensitive(token),
        has_fintoc_secret_key=has_secret,
        fintoc_secret_key_masked=_mask_sensitive(saved_secret if has_secret else None),
        created_at=conn.created_at,
        updated_at=conn.updated_at,
    )


def _load_connection_metadata(conn: BankConnection) -> Dict[str, Any]:
    raw_metadata = conn.connection_metadata
    if not raw_metadata:
        return {}

    try:
        parsed = json.loads(raw_metadata)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    try:
        parsed = ast.literal_eval(raw_metadata)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _save_connection_metadata(conn: BankConnection, metadata: Dict[str, Any]) -> None:
    conn.connection_metadata = json.dumps(metadata, ensure_ascii=True)


def _get_linked_account_id(conn: BankConnection, provider_account_id: str) -> Optional[int]:
    metadata = _load_connection_metadata(conn)
    linked_accounts = metadata.get("linked_accounts")
    if not isinstance(linked_accounts, dict):
        return None
    linked_id = linked_accounts.get(provider_account_id)
    return int(linked_id) if linked_id is not None else None


def _is_sync_enabled(conn: BankConnection, provider_account_id: str) -> bool:
    metadata = _load_connection_metadata(conn)
    selected_accounts = metadata.get("selected_provider_accounts")
    if not isinstance(selected_accounts, list):
        return False
    return provider_account_id in {str(item) for item in selected_accounts}


def _set_linked_account(
    conn: BankConnection,
    provider_account_id: str,
    local_account_id: Optional[int],
    enabled: bool,
) -> Dict[str, Any]:
    metadata = _load_connection_metadata(conn)
    linked_accounts = metadata.get("linked_accounts")
    if not isinstance(linked_accounts, dict):
        linked_accounts = {}

    if local_account_id is None:
        linked_accounts.pop(provider_account_id, None)
    else:
        linked_accounts[provider_account_id] = local_account_id

    selected_accounts_raw = metadata.get("selected_provider_accounts")
    selected_accounts = [str(item) for item in selected_accounts_raw] if isinstance(selected_accounts_raw, list) else []
    selected_set = set(selected_accounts)
    if enabled:
        selected_set.add(provider_account_id)
    else:
        selected_set.discard(provider_account_id)

    metadata["linked_accounts"] = linked_accounts
    metadata["selected_provider_accounts"] = sorted(selected_set)
    return metadata


def _validate_fintoc_connection(access_token: str) -> Dict[str, Any]:
    """Run a connectivity test against Fintoc before persisting a connected status."""
    accounts = fintoc.get_accounts(access_token)
    if not accounts:
        raise HTTPException(
            status_code=400,
            detail="Conexión creada pero sin cuentas disponibles. Verifica permisos de Fintoc.",
        )

    first_account_id = str(accounts[0].get("id", ""))
    sample_movements = []
    if first_account_id:
        sample_movements = fintoc.get_movements(access_token, first_account_id)

    return {
        "accounts_count": len(accounts),
        "sample_account_id": first_account_id or None,
        "sample_movements_count": len(sample_movements),
    }


@router.get("/", response_model=List[BankConnectionRead])
def list_connections(session: Session = Depends(get_session)):
    conns = session.exec(select(BankConnection).order_by(BankConnection.display_name)).all()
    return [_enrich_connection_read(conn) for conn in conns]


@router.post("/", response_model=BankConnectionRead, status_code=status.HTTP_201_CREATED)
def create_connection(data: BankConnectionCreate, session: Session = Depends(get_session)):
    conn = BankConnection(**data.model_dump())
    session.add(conn)
    session.commit()
    session.refresh(conn)
    return _enrich_connection_read(conn)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(connection_id: int, session: Session = Depends(get_session)):
    conn = session.get(BankConnection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    session.delete(conn)
    session.commit()


# ---- Fintoc specific endpoints ----

@router.post("/fintoc/connect")
def fintoc_connect(data: FintocConnectRequest, session: Session = Depends(get_session)):
    """Initialize Fintoc connection using link token from widget and validate connectivity."""
    if data.secret_key and data.secret_key.strip():
        # Allow configuring the key from UI to avoid manual .env edits.
        fintoc.secret_key = data.secret_key.strip()
        os.environ["FINTOC_SECRET_KEY"] = data.secret_key.strip()

    result = fintoc.connect({"link_token": data.link_token})
    access_token = result.get("access_token") or data.link_token

    test_result: Dict[str, Any] = {}
    try:
        test_result = _validate_fintoc_connection(access_token)
        status_value = "connected"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo validar la conexión con Fintoc: {str(exc)}",
        )

    metadata: Dict[str, Any] = {"connect_result": result}
    if data.secret_key and data.secret_key.strip():
        metadata["fintoc_secret_key"] = data.secret_key.strip()

    conn = BankConnection(
        provider="fintoc",
        display_name="Fintoc - Cuenta bancaria",
        status=status_value,
        account_id=data.account_id,
        access_token=access_token,
        connection_metadata=json.dumps(metadata, ensure_ascii=True),
    )
    session.add(conn)
    session.commit()
    session.refresh(conn)
    return {
        "connection_id": conn.id,
        "status": conn.status,
        "mock": result.get("mock", False),
        "validation": {
            "tested": True,
            **test_result,
        },
    }


@router.get("/fintoc/accounts/{connection_id}")
def fintoc_get_accounts(connection_id: int, session: Session = Depends(get_session)):
    """Get accounts from Fintoc for a given connection."""
    conn = session.get(BankConnection, connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")
    _set_runtime_secret_from_connection(conn)
    accounts = fintoc.get_accounts(conn.access_token or "")
    enriched_accounts = []
    for account in accounts:
        provider_account_id = str(account.get("id", ""))
        linked_account_id = _get_linked_account_id(conn, provider_account_id)
        local_account = session.get(Account, linked_account_id) if linked_account_id else _find_local_account_for_fintoc_account(session, provider_account_id)
        enriched_accounts.append({
            **account,
            "balance_amount": _extract_fintoc_balance(account),
            "local_account_id": local_account.id if local_account else None,
            "local_account_name": local_account.name if local_account else None,
            "sync_enabled": _is_sync_enabled(conn, provider_account_id),
        })
    return {"accounts": enriched_accounts}


@router.post("/fintoc/link-account")
def fintoc_link_account(payload: Dict[str, Any], session: Session = Depends(get_session)):
    connection_id = int(payload.get("connection_id") or 0)
    provider_account_id = str(payload.get("provider_account_id") or "").strip()
    local_account_id = payload.get("local_account_id")
    enabled = bool(payload.get("enabled", True))

    conn = session.get(BankConnection, connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")
    if not provider_account_id:
        raise HTTPException(status_code=400, detail="provider_account_id es requerido")

    local_account: Optional[Account] = None
    if local_account_id is not None:
        local_account = session.get(Account, int(local_account_id))
        if not local_account:
            raise HTTPException(status_code=404, detail="Cuenta local no encontrada")

    metadata = _set_linked_account(conn, provider_account_id, int(local_account_id) if local_account_id is not None else None, enabled)
    _save_connection_metadata(conn, metadata)
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()
    session.refresh(conn)

    return {
        "connection_id": conn.id,
        "provider_account_id": provider_account_id,
        "local_account_id": local_account.id if local_account else None,
        "local_account_name": local_account.name if local_account else None,
        "sync_enabled": enabled,
    }


@router.post("/fintoc/sync")
def fintoc_sync(data: FintocSyncRequest, session: Session = Depends(get_session)):
    """Sync movements from Fintoc for a given connection."""
    conn = session.get(BankConnection, data.connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")

    result = _sync_connection(
        session=session,
        conn=conn,
        provider_account_ids=data.provider_account_ids,
        provider_account_id=data.provider_account_id,
        strict=True,
    )
    return result


@router.get("/fintoc/credentials/{connection_id}", response_model=FintocCredentialsRead)
def fintoc_get_credentials(connection_id: int, session: Session = Depends(get_session)):
    """Get currently stored credentials for a Fintoc connection.

    This is intended for pre-filling the edit dialog in trusted local environments.
    """
    conn = session.get(BankConnection, connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")

    metadata = _load_connection_metadata(conn)
    saved_secret = metadata.get("fintoc_secret_key") if isinstance(metadata, dict) else None
    token = conn.access_token if isinstance(conn.access_token, str) and conn.access_token.strip() else None
    secret = saved_secret if isinstance(saved_secret, str) and saved_secret.strip() else None

    return FintocCredentialsRead(
        connection_id=conn.id,
        has_access_token=bool(token),
        access_token=token,
        has_fintoc_secret_key=bool(secret),
        fintoc_secret_key=secret,
    )


@router.patch("/fintoc/credentials")
def fintoc_update_credentials(
    data: FintocUpdateCredentialsRequest,
    session: Session = Depends(get_session),
):
    """Update credentials for an existing Fintoc connection."""
    conn = session.get(BankConnection, data.connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")

    metadata = _load_connection_metadata(conn)

    if data.secret_key is not None and data.secret_key.strip():
        metadata["fintoc_secret_key"] = data.secret_key.strip()
        fintoc.secret_key = data.secret_key.strip()
        os.environ["FINTOC_SECRET_KEY"] = data.secret_key.strip()

    if data.link_token is not None and data.link_token.strip():
        conn.access_token = data.link_token.strip()

    _save_connection_metadata(conn, metadata)
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()
    session.refresh(conn)

    return {
        "connection_id": conn.id,
        "status": conn.status,
        "has_access_token": bool(conn.access_token),
        "has_fintoc_secret_key": bool(metadata.get("fintoc_secret_key")),
    }


def _sync_connection(
    session: Session,
    conn: BankConnection,
    provider_account_ids: Optional[List[str]] = None,
    provider_account_id: Optional[str] = None,
    strict: bool = True,
) -> Dict[str, Any]:
    """Sync a single Fintoc connection.

    strict=True raises errors when no accounts are selected/found.
    strict=False returns a skipped result so background jobs can continue.
    """

    _set_runtime_secret_from_connection(conn)
    refresh_intent_result = _request_refresh_intent_if_due(conn)

    provider_accounts = fintoc.get_accounts(conn.access_token or "")
    if provider_account_ids:
        selected_ids = {str(account_id) for account_id in provider_account_ids if str(account_id).strip()}
        provider_accounts = [a for a in provider_accounts if str(a.get("id")) in selected_ids]
    elif provider_account_id:
        provider_accounts = [a for a in provider_accounts if str(a.get("id")) == provider_account_id]
    else:
        metadata_selected_ids = {
            str(account_id)
            for account_id in (_load_connection_metadata(conn).get("selected_provider_accounts") or [])
            if str(account_id).strip()
        }
        if metadata_selected_ids:
            provider_accounts = [a for a in provider_accounts if str(a.get("id")) in metadata_selected_ids]

    if not provider_accounts:
        if strict:
            raise HTTPException(status_code=404, detail="No se encontraron cuentas Fintoc para sincronizar")
        return {
            "synced_count": 0,
            "saved_count": 0,
            "skipped_count": 0,
            "mock_mode": (not bool(fintoc.secret_key)) or (conn.access_token or "").startswith("fintoc_mock"),
            "connection_id": conn.id,
            "note": "Sin cuentas seleccionadas para sincronizar.",
            "accounts": [],
        }

    total_synced = 0
    total_saved = 0
    total_skipped = 0
    synced_accounts: List[Dict[str, Any]] = []

    for provider_account in provider_accounts:
        provider_account_id = str(provider_account.get("id", ""))
        local_account = _get_or_create_local_account(session, conn, provider_account)
        movements = fintoc.get_movements(conn.access_token or "", provider_account_id)
        save_result = _save_fintoc_movements(
            session,
            movements,
            local_account.id or 0,
            provider_account_id,
            connection_id=conn.id,
        )
        total_synced += len(movements)
        total_saved += save_result["saved"]
        total_skipped += save_result["skipped"]

        synced_accounts.append(
            {
                "provider_account_id": provider_account_id,
                "provider_account_name": provider_account.get("name"),
                "local_account_id": local_account.id,
                "local_account_name": local_account.name,
                "synced_count": len(movements),
                "saved_count": save_result["saved"],
                "skipped_count": save_result["skipped"],
            }
        )

    conn.last_sync = datetime.utcnow()
    conn.status = "connected"
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()

    return {
        "synced_count": total_synced,
        "saved_count": total_saved,
        "skipped_count": total_skipped,
        "refresh_intent": refresh_intent_result,
        "mock_mode": (not bool(fintoc.secret_key)) or (conn.access_token or "").startswith("fintoc_mock"),
        "connection_id": conn.id,
        "note": "Movimientos sincronizados y guardados en la base local.",
        "accounts": synced_accounts,
    }


def auto_sync_fintoc_connections_once() -> Dict[str, int]:
    """Run one background synchronization cycle for all active Fintoc connections."""
    if not settings.FINTOC_AUTO_SYNC_ENABLED:
        return {"connections_total": 0, "connections_synced": 0, "saved_total": 0, "failed": 0}

    with Session(engine) as session:
        connections = session.exec(
            select(BankConnection).where(
                and_(
                    BankConnection.provider == "fintoc",
                    BankConnection.status == "connected",
                )
            )
        ).all()

        connections_synced = 0
        saved_total = 0
        failed = 0

        for conn in connections:
            try:
                result = _sync_connection(session=session, conn=conn, strict=False)
                connections_synced += 1
                saved_total += int(result.get("saved_count") or 0)
            except Exception:
                failed += 1
                conn.status = "error"
                conn.updated_at = datetime.utcnow()
                session.add(conn)
                session.commit()

        return {
            "connections_total": len(connections),
            "connections_synced": connections_synced,
            "saved_total": saved_total,
            "failed": failed,
        }


def _find_local_account_for_fintoc_account(session: Session, provider_account_id: str) -> Optional[Account]:
    if not provider_account_id:
        return None
    return session.exec(
        select(Account).where(
            and_(
                Account.source == "fintoc",
                Account.notes.is_not(None),
                Account.notes.contains(f"fintoc_account_id:{provider_account_id}"),
            )
        )
    ).first()


def _map_fintoc_account_type(provider_type: Optional[str]) -> str:
    normalized = (provider_type or "").lower()
    mapping = {
        "checking_account": "corriente",
        "current_account": "corriente",
        "sight_account": "vista",
        "vista_account": "vista",
        "savings_account": "ahorro",
        "credit_card": "tarjeta_credito",
        "investment_account": "inversion",
    }
    return mapping.get(normalized, "corriente")


def _extract_fintoc_balance(provider_account: Dict[str, Any]) -> Optional[float]:
    """Normalize Fintoc balance field, which can be either a number or an object.

    Returns None when the provider account carries no balance data at all,
    so the caller can decide whether to keep the existing local balance.
    """
    raw_balance = provider_account.get("balance")

    if isinstance(raw_balance, (int, float)):
        return float(raw_balance)

    if isinstance(raw_balance, dict):
        for key in ("available", "current", "limit"):
            value = raw_balance.get(key)
            if isinstance(value, (int, float)):
                return float(value)

    return None


def _get_or_create_local_account(session: Session, conn: BankConnection, provider_account: Dict[str, Any]) -> Account:
    provider_account_id = str(provider_account.get("id", ""))
    linked_account_id = _get_linked_account_id(conn, provider_account_id)
    existing = session.get(Account, linked_account_id) if linked_account_id else _find_local_account_for_fintoc_account(session, provider_account_id)
    bank_name = "Fintoc"

    if existing:
        if not linked_account_id or existing.source == "fintoc":
            existing.name = str(provider_account.get("name") or existing.name)
        provider_balance = _extract_fintoc_balance(provider_account)
        if provider_balance is not None:
            existing.balance = provider_balance
        existing.currency = str(provider_account.get("currency") or existing.currency or "CLP")
        if not linked_account_id or existing.source == "fintoc":
            existing.account_type = _map_fintoc_account_type(provider_account.get("type"))
        existing.bank = str(existing.bank or provider_account.get("institution_name") or bank_name)
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    account = Account(
        name=str(provider_account.get("name") or f"Cuenta Fintoc {provider_account_id}"),
        bank=str(provider_account.get("institution_name") or bank_name),
        account_type=_map_fintoc_account_type(provider_account.get("type")),
        balance=_extract_fintoc_balance(provider_account),
        currency=str(provider_account.get("currency") or "CLP"),
        is_active=True,
        source="fintoc",
        notes=f"fintoc_account_id:{provider_account_id};connection_id:{conn.id}",
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


def _save_fintoc_movements(
    session: Session,
    movements: List[Dict[str, Any]],
    local_account_id: int,
    provider_account_id: str,
    connection_id: Optional[int] = None,
) -> Dict[str, int]:
    saved = 0
    skipped = 0

    sorted_movements = sorted(
        movements,
        key=lambda movement: (_extract_fintoc_movement_date(movement), str(movement.get("id") or "")),
    )

    for movement in sorted_movements:
        movement_id = str(movement.get("id", ""))
        external_tag = f"fintoc_movement_id:{movement_id}"
        account_tag = f"fintoc_account_id:{provider_account_id}"

        existing = session.exec(
            select(Transaction).where(
                and_(
                    Transaction.source == "fintoc",
                    Transaction.account_id == local_account_id,
                    Transaction.tags.is_not(None),
                    Transaction.tags.contains(external_tag),
                )
            )
        ).first()
        if existing:
            skipped += 1
            continue

        amount = float(movement.get("amount") or 0)
        tx_type = _map_fintoc_transaction_type(movement)
        suggestion = suggest_category(str(movement.get("description") or ""), amount)
        category_id = None
        if suggestion.get("category"):
            cat = session.exec(select(Category).where(Category.name == suggestion["category"])).first()
            if cat:
                category_id = cat.id

        tx_date = _extract_fintoc_movement_date(movement)
        transaction = Transaction(
            date=tx_date,
            description=str(movement.get("description") or "Movimiento Fintoc"),
            amount=abs(amount) if tx_type in {"income", "transfer"} else -abs(amount),
            transaction_type=tx_type,
            category_id=category_id,
            account_id=local_account_id,
            source="fintoc",
            is_ant_expense=bool(suggestion.get("is_ant_expense", False)),
            is_fixed_expense=bool(suggestion.get("is_fixed_expense", False)),
            is_debt=bool(suggestion.get("is_debt", False)),
            is_transfer=tx_type == "transfer",
            status="confirmed",
            tags=f"{external_tag},{account_tag}",
        )
        session.add(transaction)
        saved += 1

        # If this movement is a card payment from checking account, mirror it as income in the credit card account.
        mirrored = _mirror_credit_card_payment_if_needed(
            session=session,
            movement=movement,
            source_transaction=transaction,
            source_account_id=local_account_id,
            provider_account_id=provider_account_id,
            connection_id=connection_id,
        )
        saved += mirrored

    return {"saved": saved, "skipped": skipped}


def _looks_like_credit_card_payment(description: str, tx_type: str, amount: float) -> bool:
    if not description:
        return False
    desc = description.lower()

    # Typical bank movement labels for card payments.
    payment_keywords = [
        "pago tc",
        "pago tarjeta",
        "abono tc",
        "abono tarjeta",
        "pago t/c",
        "pago tarjeta de credito",
        "pago tarjeta de crédito",
    ]

    if not any(keyword in desc for keyword in payment_keywords):
        return False

    # From the source account perspective this is usually transfer/expense with negative sign.
    if tx_type not in {"transfer", "expense"}:
        return False
    return amount < 0


def _extract_last_four(description: str) -> Optional[str]:
    matches = re.findall(r"(?:\b|\D)(\d{4})(?:\b|\D)", description or "")
    if not matches:
        return None
    return matches[-1]


def _find_credit_card_target_account(
    session: Session,
    source_account_id: int,
    connection_id: Optional[int],
    description: str,
) -> Optional[Account]:
    conditions = [
        Account.is_active == True,
        Account.account_type == "tarjeta_credito",
        Account.id != source_account_id,
    ]

    if connection_id:
        conditions.extend(
            [
                Account.notes.is_not(None),
                Account.notes.contains(f"connection_id:{connection_id}"),
            ]
        )

    candidates = session.exec(select(Account).where(and_(*conditions))).all()
    if not candidates:
        return None

    # Try matching by last 4 digits found in description.
    last_four = _extract_last_four(description)
    if last_four:
        for account in candidates:
            if (account.card_last_four or "") == last_four:
                return account

    # If there's only one credit card candidate, use it.
    if len(candidates) == 1:
        return candidates[0]

    return None


def _mirror_credit_card_payment_if_needed(
    session: Session,
    movement: Dict[str, Any],
    source_transaction: Transaction,
    source_account_id: int,
    provider_account_id: str,
    connection_id: Optional[int],
) -> int:
    description = str(movement.get("description") or "")
    tx_type = source_transaction.transaction_type
    amount = float(source_transaction.amount or 0)

    if not _looks_like_credit_card_payment(description, tx_type, amount):
        return 0

    target_account = _find_credit_card_target_account(
        session=session,
        source_account_id=source_account_id,
        connection_id=connection_id,
        description=description,
    )
    if not target_account or not target_account.id:
        return 0

    movement_id = str(movement.get("id", ""))
    mirror_tag = f"fintoc_mirror_payment_to_cc:{movement_id}:{target_account.id}"
    source_tag = f"fintoc_account_id:{provider_account_id}"

    existing_mirror = session.exec(
        select(Transaction).where(
            and_(
                Transaction.source == "fintoc",
                Transaction.account_id == target_account.id,
                Transaction.tags.is_not(None),
                Transaction.tags.contains(mirror_tag),
            )
        )
    ).first()
    if existing_mirror:
        return 0

    mirror_tx = Transaction(
        date=source_transaction.date,
        description=f"Abono TC espejo: {description}",
        amount=abs(amount),
        transaction_type="income",
        category_id=source_transaction.category_id,
        account_id=target_account.id,
        source="fintoc",
        is_ant_expense=False,
        is_fixed_expense=False,
        is_debt=True,
        is_transfer=True,
        status="confirmed",
        tags=f"{mirror_tag},{source_tag}",
    )
    session.add(mirror_tx)
    return 1


def _map_fintoc_transaction_type(movement: Dict[str, Any]) -> str:
    movement_type = str(movement.get("type") or "").lower()
    description = str(movement.get("description") or "").lower()
    amount = float(movement.get("amount") or 0)

    internal_transfer_keywords = [
        "entre cuentas propias",
        "cuenta propia",
        "traspaso fondos cuenta propia",
        "traspaso de fondos entre cuentas propias",
    ]

    if movement_type == "transfer" or any(keyword in description for keyword in internal_transfer_keywords):
        return "transfer"
    if movement_type == "income" or amount > 0:
        return "income"
    return "expense"


def _extract_fintoc_movement_date(movement: Dict[str, Any]) -> date:
    for key in ("post_date", "transaction_date", "date"):
        raw_value = movement.get(key)
        if not raw_value:
            continue
        try:
            return date.fromisoformat(str(raw_value)[:10])
        except ValueError:
            continue
    return date.today()

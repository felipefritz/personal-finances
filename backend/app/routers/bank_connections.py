"""Conexiones bancarias vía scraping propio (BCI, Banco de Chile, Santander, BancoEstado).

Las credenciales del banco se guardan cifradas (Fernet) en la BD local y los
movimientos/saldos se obtienen con Playwright. Las conexiones "fintoc" legadas
quedan deshabilitadas pero sus transacciones históricas se conservan; el dedupe
por contenido evita duplicarlas al reconectar las mismas cuentas.
"""
import ast
import json
import os
import re
import time
import logging
from dataclasses import asdict
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, and_

from app.core.database import get_session, engine
from app.core.config import settings
from app.core.crypto import encrypt_credentials, decrypt_credentials
from app.models.bank_connection import BankConnection
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.category import Category
from app.schemas.bank_connection import (
    BankConnectionCreate,
    BankConnectionRead,
    BankConnectionSyncRequest,
    BankConnectionUpdateCredentials,
    LinkAccountRequest,
)
from app.services.bank_scrapers import (
    PROVIDER_LABELS,
    ScrapedAccount,
    ScrapedMovement,
    ScraperActionRequired,
    ScraperAuthError,
    ScraperError,
    available_providers,
    get_scraper,
)
from app.services.bank_scrapers.common import is_valid_rut, normalize_description, normalize_rut
from app.services.categorization_service import suggest_category

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bank-connections", tags=["Bank Connections"])

FIRST_SYNC_DAYS = 90
INCREMENTAL_OVERLAP_DAYS = 7


# ── Helpers de metadata / lectura ─────────────────────────────────────────────

def _mask_rut(rut: Optional[str]) -> Optional[str]:
    if not rut:
        return None
    try:
        body, dv = normalize_rut(rut).split("-")
    except ValueError:
        return "***"
    if len(body) <= 3:
        return f"***-{dv}"
    return f"{'*' * (len(body) - 3)}{body[-3:]}-{dv}"


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


def _get_credentials(conn: BankConnection) -> Dict[str, str]:
    if not conn.encrypted_credentials:
        raise HTTPException(status_code=400, detail="La conexión no tiene credenciales guardadas")
    try:
        return decrypt_credentials(conn.encrypted_credentials)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _enrich_connection_read(conn: BankConnection) -> BankConnectionRead:
    metadata = _load_connection_metadata(conn)
    rut = metadata.get("rut") if isinstance(metadata, dict) else None
    return BankConnectionRead(
        id=conn.id,
        provider=conn.provider,
        provider_label=PROVIDER_LABELS.get(conn.provider, conn.provider),
        display_name=conn.display_name,
        status=conn.status,
        last_sync=conn.last_sync,
        last_error=conn.last_error,
        last_error_at=conn.last_error_at,
        rut_masked=_mask_rut(rut),
        has_credentials=bool(conn.encrypted_credentials),
        created_at=conn.created_at,
        updated_at=conn.updated_at,
    )


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


def _make_scraper(conn: BankConnection):
    scraper_cls = get_scraper(conn.provider)
    profile_dir = os.path.join(settings.SCRAPER_PROFILES_DIR, f"connection_{conn.id or 'new'}")
    return scraper_cls(
        headless=settings.SCRAPER_HEADLESS,
        user_data_dir=profile_dir,
        debug_dir=settings.SCRAPER_DEBUG_DIR,
        channel=settings.SCRAPER_BROWSER_CHANNEL,
    )


def _store_discovered_accounts(conn: BankConnection, accounts: List[ScrapedAccount]) -> None:
    metadata = _load_connection_metadata(conn)
    metadata["discovered_accounts"] = [asdict(acc) for acc in accounts]
    metadata["discovered_at"] = datetime.utcnow().isoformat()
    _save_connection_metadata(conn, metadata)


def _get_discovered_accounts(conn: BankConnection) -> List[Dict[str, Any]]:
    metadata = _load_connection_metadata(conn)
    raw = metadata.get("discovered_accounts")
    return raw if isinstance(raw, list) else []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/providers")
def list_providers():
    """Bancos disponibles para conectar."""
    return {"providers": available_providers()}


@router.get("/", response_model=List[BankConnectionRead])
def list_connections(session: Session = Depends(get_session)):
    conns = session.exec(select(BankConnection).order_by(BankConnection.display_name)).all()
    return [_enrich_connection_read(conn) for conn in conns]


@router.post("/", response_model=BankConnectionRead, status_code=status.HTTP_201_CREATED)
def create_connection(data: BankConnectionCreate, session: Session = Depends(get_session)):
    """Crea una conexión: valida RUT, prueba login real y guarda credenciales cifradas."""
    try:
        get_scraper(data.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if data.provider != "fake" and not is_valid_rut(data.rut):
        raise HTTPException(status_code=400, detail="RUT inválido")

    rut = normalize_rut(data.rut)
    label = PROVIDER_LABELS.get(data.provider, data.provider)
    conn = BankConnection(
        provider=data.provider,
        display_name=data.display_name or f"{label} — {_mask_rut(rut)}",
        status="disconnected",
        encrypted_credentials=encrypt_credentials({"rut": rut, "password": data.password}),
    )
    _save_connection_metadata(conn, {"rut": rut})
    session.add(conn)
    session.commit()
    session.refresh(conn)

    # Validación en vivo: login + descubrimiento de cuentas.
    try:
        with _make_scraper(conn) as scraper:
            scraper.login(rut, data.password)
            accounts = scraper.list_accounts()
        _store_discovered_accounts(conn, accounts)
        conn.status = "connected"
        conn.last_error = None
        conn.last_error_at = None
    except ScraperAuthError as exc:
        conn.status = "error"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()
    except ScraperActionRequired as exc:
        conn.status = "action_required"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()
    except (ScraperError, RuntimeError) as exc:
        conn.status = "error"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()

    conn.updated_at = datetime.utcnow()
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


@router.patch("/{connection_id}/credentials", response_model=BankConnectionRead)
def update_credentials(
    connection_id: int,
    data: BankConnectionUpdateCredentials,
    session: Session = Depends(get_session),
):
    """Actualiza credenciales, las re-cifra y re-valida el login."""
    conn = session.get(BankConnection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")

    current = {}
    if conn.encrypted_credentials:
        try:
            current = decrypt_credentials(conn.encrypted_credentials)
        except RuntimeError:
            current = {}

    rut = data.rut or current.get("rut") or ""
    password = data.password or current.get("password") or ""
    if not rut or not password:
        raise HTTPException(status_code=400, detail="Debes entregar RUT y clave")
    if conn.provider != "fake" and not is_valid_rut(rut):
        raise HTTPException(status_code=400, detail="RUT inválido")

    rut = normalize_rut(rut)
    conn.encrypted_credentials = encrypt_credentials({"rut": rut, "password": password})
    metadata = _load_connection_metadata(conn)
    metadata["rut"] = rut
    _save_connection_metadata(conn, metadata)

    try:
        with _make_scraper(conn) as scraper:
            scraper.login(rut, password)
            accounts = scraper.list_accounts()
        _store_discovered_accounts(conn, accounts)
        conn.status = "connected"
        conn.last_error = None
        conn.last_error_at = None
    except ScraperAuthError as exc:
        conn.status = "error"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()
    except ScraperActionRequired as exc:
        conn.status = "action_required"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()
    except (ScraperError, RuntimeError) as exc:
        conn.status = "error"
        conn.last_error = str(exc)
        conn.last_error_at = datetime.utcnow()

    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()
    session.refresh(conn)
    return _enrich_connection_read(conn)


@router.get("/{connection_id}/accounts")
def get_connection_accounts(connection_id: int, session: Session = Depends(get_session)):
    """Cuentas descubiertas en el último scrape (cacheadas en metadata)."""
    conn = session.get(BankConnection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")

    enriched_accounts = []
    for account in _get_discovered_accounts(conn):
        provider_account_id = str(account.get("external_id", ""))
        linked_account_id = _get_linked_account_id(conn, provider_account_id)
        local_account = (
            session.get(Account, linked_account_id)
            if linked_account_id
            else _find_local_account_for_provider_account(session, conn.provider, provider_account_id)
        )
        enriched_accounts.append({
            **account,
            "local_account_id": local_account.id if local_account else None,
            "local_account_name": local_account.name if local_account else None,
            "sync_enabled": _is_sync_enabled(conn, provider_account_id),
        })
    return {"accounts": enriched_accounts}


@router.post("/{connection_id}/link-account")
def link_account(connection_id: int, data: LinkAccountRequest, session: Session = Depends(get_session)):
    conn = session.get(BankConnection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    if not data.provider_account_id:
        raise HTTPException(status_code=400, detail="provider_account_id es requerido")

    local_account: Optional[Account] = None
    if data.local_account_id is not None:
        local_account = session.get(Account, data.local_account_id)
        if not local_account:
            raise HTTPException(status_code=404, detail="Cuenta local no encontrada")

    metadata = _set_linked_account(conn, data.provider_account_id, data.local_account_id, data.enabled)
    _save_connection_metadata(conn, metadata)
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()
    session.refresh(conn)

    return {
        "connection_id": conn.id,
        "provider_account_id": data.provider_account_id,
        "local_account_id": local_account.id if local_account else None,
        "local_account_name": local_account.name if local_account else None,
        "sync_enabled": data.enabled,
    }


@router.post("/{connection_id}/sync")
def sync_connection(
    connection_id: int,
    data: Optional[BankConnectionSyncRequest] = None,
    session: Session = Depends(get_session),
):
    conn = session.get(BankConnection, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    if conn.provider == "fintoc":
        raise HTTPException(
            status_code=400,
            detail="Conexión Fintoc legada: crea una conexión nueva con tu banco. El histórico se conserva.",
        )
    payload = data or BankConnectionSyncRequest()
    return _sync_connection(
        session=session,
        conn=conn,
        provider_account_ids=payload.provider_account_ids,
        provider_account_id=payload.provider_account_id,
        strict=True,
    )


# ── Sync core ─────────────────────────────────────────────────────────────────

def _sync_connection(
    session: Session,
    conn: BankConnection,
    provider_account_ids: Optional[List[str]] = None,
    provider_account_id: Optional[str] = None,
    strict: bool = True,
) -> Dict[str, Any]:
    """Sincroniza una conexión: login → cuentas/saldos → movimientos → dedupe.

    strict=True lanza errores HTTP; strict=False retorna resultado parcial para
    que el ciclo background continúe con las demás conexiones.
    """
    credentials = _get_credentials(conn)
    since = _compute_since(conn)

    try:
        with _make_scraper(conn) as scraper:
            scraper.login(credentials.get("rut", ""), credentials.get("password", ""))
            scraped_accounts = scraper.list_accounts()
            _store_discovered_accounts(conn, scraped_accounts)

            selected = _filter_selected_accounts(
                conn, scraped_accounts, provider_account_ids, provider_account_id
            )
            if not selected:
                _mark_sync_ok(session, conn)
                result = _empty_sync_result(conn, note="Sin cuentas seleccionadas para sincronizar.")
                if strict:
                    raise HTTPException(
                        status_code=404,
                        detail="No hay cuentas vinculadas para sincronizar. Vincula cuentas primero.",
                    )
                return result

            total_synced = 0
            total_saved = 0
            total_skipped = 0
            synced_accounts: List[Dict[str, Any]] = []

            # Crear/actualizar todas las cuentas locales ANTES de procesar
            # movimientos: así el espejo de pago de TC encuentra la tarjeta
            # destino aunque el cargo aparezca en la cuenta corriente, que se
            # procesa primero.
            local_accounts = {
                a.external_id: _get_or_create_local_account(session, conn, a) for a in selected
            }

            for scraped_account in selected:
                local_account = local_accounts[scraped_account.external_id]
                movements = scraper.get_movements(scraped_account, since=since)
                save_result = _save_scraped_movements(
                    session,
                    movements,
                    conn.provider,
                    local_account.id or 0,
                    scraped_account.external_id,
                    connection_id=conn.id,
                )
                total_synced += len(movements)
                total_saved += save_result["saved"]
                total_skipped += save_result["skipped"]
                synced_accounts.append({
                    "provider_account_id": scraped_account.external_id,
                    "provider_account_name": scraped_account.name,
                    "local_account_id": local_account.id,
                    "local_account_name": local_account.name,
                    "synced_count": len(movements),
                    "saved_count": save_result["saved"],
                    "skipped_count": save_result["skipped"],
                })

        _mark_sync_ok(session, conn)
        return {
            "synced_count": total_synced,
            "saved_count": total_saved,
            "skipped_count": total_skipped,
            "connection_id": conn.id,
            "note": "Movimientos sincronizados y guardados en la base local.",
            "accounts": synced_accounts,
        }

    except HTTPException:
        raise
    except ScraperAuthError as exc:
        _mark_sync_error(session, conn, "error", str(exc))
        if strict:
            raise HTTPException(status_code=401, detail=str(exc))
        return _empty_sync_result(conn, note=str(exc))
    except ScraperActionRequired as exc:
        _mark_sync_error(session, conn, "action_required", str(exc))
        if strict:
            raise HTTPException(status_code=409, detail=str(exc))
        return _empty_sync_result(conn, note=str(exc))
    except (ScraperError, RuntimeError) as exc:
        _mark_sync_error(session, conn, "error", str(exc))
        if strict:
            raise HTTPException(status_code=502, detail=str(exc))
        return _empty_sync_result(conn, note=str(exc))


def _compute_since(conn: BankConnection) -> date:
    if conn.last_sync:
        return (conn.last_sync - timedelta(days=INCREMENTAL_OVERLAP_DAYS)).date()
    return date.today() - timedelta(days=FIRST_SYNC_DAYS)


def _filter_selected_accounts(
    conn: BankConnection,
    scraped_accounts: List[ScrapedAccount],
    provider_account_ids: Optional[List[str]],
    provider_account_id: Optional[str],
) -> List[ScrapedAccount]:
    if provider_account_ids:
        wanted = {str(item) for item in provider_account_ids if str(item).strip()}
        return [a for a in scraped_accounts if a.external_id in wanted]
    if provider_account_id:
        return [a for a in scraped_accounts if a.external_id == provider_account_id]
    metadata_selected = {
        str(item)
        for item in (_load_connection_metadata(conn).get("selected_provider_accounts") or [])
        if str(item).strip()
    }
    if metadata_selected:
        return [a for a in scraped_accounts if a.external_id in metadata_selected]
    return []


def _mark_sync_ok(session: Session, conn: BankConnection) -> None:
    conn.last_sync = datetime.utcnow()
    conn.status = "connected"
    conn.last_error = None
    conn.last_error_at = None
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()


def _mark_sync_error(session: Session, conn: BankConnection, status_value: str, message: str) -> None:
    conn.status = status_value
    conn.last_error = message
    conn.last_error_at = datetime.utcnow()
    conn.updated_at = datetime.utcnow()
    session.add(conn)
    session.commit()


def _empty_sync_result(conn: BankConnection, note: str) -> Dict[str, Any]:
    return {
        "synced_count": 0,
        "saved_count": 0,
        "skipped_count": 0,
        "connection_id": conn.id,
        "note": note,
        "accounts": [],
    }


def auto_sync_connections_once() -> Dict[str, int]:
    """Un ciclo de sincronización background para todas las conexiones activas.

    Solo toca conexiones en estado "connected": las que quedaron en "error" o
    "action_required" se saltan hasta que el usuario corrija credenciales,
    evitando bloqueos de clave por reintentos de login.
    """
    if not settings.BANK_AUTO_SYNC_ENABLED:
        return {"connections_total": 0, "connections_synced": 0, "saved_total": 0, "failed": 0}

    with Session(engine) as session:
        connections = session.exec(
            select(BankConnection).where(
                and_(
                    BankConnection.provider != "fintoc",
                    BankConnection.status == "connected",
                )
            )
        ).all()

        connections_synced = 0
        saved_total = 0
        failed = 0

        for index, conn in enumerate(connections):
            if index > 0:
                time.sleep(max(0, int(settings.BANK_SYNC_STAGGER_SECONDS)))
            try:
                result = _sync_connection(session=session, conn=conn, strict=False)
                connections_synced += 1
                saved_total += int(result.get("saved_count") or 0)
            except Exception as exc:
                logger.exception("Sync background falló para conexión %s: %s", conn.id, exc)
                failed += 1
                _mark_sync_error(session, conn, "error", str(exc))

        return {
            "connections_total": len(connections),
            "connections_synced": connections_synced,
            "saved_total": saved_total,
            "failed": failed,
        }


# ── Cuentas locales ───────────────────────────────────────────────────────────

def _account_tag(provider: str, provider_account_id: str) -> str:
    return f"bank_account_id:{provider}:{provider_account_id}"


def _find_local_account_for_provider_account(
    session: Session, provider: str, provider_account_id: str
) -> Optional[Account]:
    if not provider_account_id:
        return None
    return session.exec(
        select(Account).where(
            and_(
                Account.notes.is_not(None),
                Account.notes.contains(_account_tag(provider, provider_account_id)),
            )
        )
    ).first()


def _get_or_create_local_account(
    session: Session, conn: BankConnection, scraped_account: ScrapedAccount
) -> Account:
    provider_account_id = scraped_account.external_id
    linked_account_id = _get_linked_account_id(conn, provider_account_id)
    existing = (
        session.get(Account, linked_account_id)
        if linked_account_id
        else _find_local_account_for_provider_account(session, conn.provider, provider_account_id)
    )
    bank_name = scraped_account.bank_name or PROVIDER_LABELS.get(conn.provider, conn.provider)

    if existing:
        if not linked_account_id or existing.source == conn.provider:
            existing.name = scraped_account.name or existing.name
            existing.account_type = scraped_account.account_type or existing.account_type
        if scraped_account.balance is not None:
            existing.balance = scraped_account.balance
        existing.currency = scraped_account.currency or existing.currency or "CLP"
        existing.bank = existing.bank or bank_name
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    account = Account(
        name=scraped_account.name or f"Cuenta {bank_name} {provider_account_id}",
        bank=bank_name,
        account_type=scraped_account.account_type or "corriente",
        balance=scraped_account.balance,
        currency=scraped_account.currency or "CLP",
        is_active=True,
        source=conn.provider,
        notes=f"{_account_tag(conn.provider, provider_account_id)};connection_id:{conn.id}",
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


# ── Movimientos + dedupe ──────────────────────────────────────────────────────

def _movement_exists(
    session: Session,
    provider: str,
    local_account_id: int,
    movement: ScrapedMovement,
) -> bool:
    """Dedupe doble llave.

    1) Por id externo del banco (tag) cuando existe.
    2) Siempre por contenido (cuenta, fecha, |monto|, descripción normalizada)
       contra transacciones de CUALQUIER source — incluye el histórico Fintoc
       e importaciones de cartolas, evitando duplicados al reconectar.
    """
    if movement.external_id:
        tag = f"mov_id:{provider}:{movement.external_id}"
        existing = session.exec(
            select(Transaction).where(
                and_(
                    Transaction.account_id == local_account_id,
                    Transaction.tags.is_not(None),
                    Transaction.tags.contains(tag),
                )
            )
        ).first()
        if existing:
            return True

    normalized_desc = normalize_description(movement.description)
    candidates = session.exec(
        select(Transaction).where(
            and_(
                Transaction.account_id == local_account_id,
                Transaction.date == movement.date,
            )
        )
    ).all()
    target_amount = round(abs(movement.amount), 2)
    for candidate in candidates:
        if round(abs(candidate.amount or 0), 2) != target_amount:
            continue
        if normalize_description(candidate.description) == normalized_desc:
            return True
    return False


def _save_scraped_movements(
    session: Session,
    movements: List[ScrapedMovement],
    provider: str,
    local_account_id: int,
    provider_account_id: str,
    connection_id: Optional[int] = None,
) -> Dict[str, int]:
    saved = 0
    skipped = 0

    sorted_movements = sorted(movements, key=lambda m: (m.date, m.external_id or ""))

    for movement in sorted_movements:
        if _movement_exists(session, provider, local_account_id, movement):
            skipped += 1
            continue

        amount = float(movement.amount or 0)
        tx_type = _map_transaction_type(movement)
        suggestion = suggest_category(movement.description or "", amount)
        category_id = None
        if suggestion.get("category"):
            cat = session.exec(select(Category).where(Category.name == suggestion["category"])).first()
            if cat:
                category_id = cat.id

        tags = [_account_tag(provider, provider_account_id)]
        if movement.external_id:
            tags.insert(0, f"mov_id:{provider}:{movement.external_id}")

        transaction = Transaction(
            date=movement.date,
            description=movement.description or "Movimiento bancario",
            amount=abs(amount) if tx_type in {"income", "transfer"} else -abs(amount),
            transaction_type=tx_type,
            category_id=category_id,
            account_id=local_account_id,
            source=provider,
            is_ant_expense=bool(suggestion.get("is_ant_expense", False)),
            is_fixed_expense=bool(suggestion.get("is_fixed_expense", False)),
            is_debt=bool(suggestion.get("is_debt", False)),
            is_transfer=tx_type == "transfer",
            status="confirmed",
            tags=",".join(tags),
        )
        session.add(transaction)
        saved += 1

        # Pago de TC desde cuenta corriente: espejar como abono en la tarjeta.
        saved += _mirror_credit_card_payment_if_needed(
            session=session,
            movement=movement,
            provider=provider,
            source_transaction=transaction,
            source_account_id=local_account_id,
            provider_account_id=provider_account_id,
            connection_id=connection_id,
        )

    session.commit()
    return {"saved": saved, "skipped": skipped}


def _looks_like_credit_card_payment(description: str, tx_type: str, amount: float) -> bool:
    if not description:
        return False
    desc = description.lower()
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
        Account.is_active == True,  # noqa: E712
        Account.account_type == "tarjeta_credito",
        Account.id != source_account_id,
    ]
    if connection_id:
        conditions.extend([
            Account.notes.is_not(None),
            Account.notes.contains(f"connection_id:{connection_id}"),
        ])

    candidates = session.exec(select(Account).where(and_(*conditions))).all()
    if not candidates:
        return None

    last_four = _extract_last_four(description)
    if last_four:
        for account in candidates:
            if (account.card_last_four or "") == last_four:
                return account

    if len(candidates) == 1:
        return candidates[0]
    return None


def _mirror_credit_card_payment_if_needed(
    session: Session,
    movement: ScrapedMovement,
    provider: str,
    source_transaction: Transaction,
    source_account_id: int,
    provider_account_id: str,
    connection_id: Optional[int],
) -> int:
    description = movement.description or ""
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

    movement_key = movement.external_id or f"{movement.date.isoformat()}:{abs(amount):.0f}"
    mirror_tag = f"mirror_payment_to_cc:{provider}:{movement_key}:{target_account.id}"

    existing_mirror = session.exec(
        select(Transaction).where(
            and_(
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
        source=provider,
        is_ant_expense=False,
        is_fixed_expense=False,
        is_debt=True,
        is_transfer=True,
        status="confirmed",
        tags=f"{mirror_tag},{_account_tag(provider, provider_account_id)}",
    )
    session.add(mirror_tx)
    return 1


def _map_transaction_type(movement: ScrapedMovement) -> str:
    description = (movement.description or "").lower()
    amount = float(movement.amount or 0)

    internal_transfer_keywords = [
        "entre cuentas propias",
        "cuenta propia",
        "traspaso fondos cuenta propia",
        "traspaso de fondos entre cuentas propias",
    ]
    if any(keyword in description for keyword in internal_transfer_keywords):
        return "transfer"
    if amount > 0:
        return "income"
    return "expense"

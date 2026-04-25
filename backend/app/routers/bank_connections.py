from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.bank_connection import BankConnection
from app.schemas.bank_connection import (
    BankConnectionCreate,
    BankConnectionRead,
    FintocConnectRequest,
    FintocSyncRequest,
)
from app.services.bank_providers.fintoc import FintocProvider

router = APIRouter(prefix="/bank-connections", tags=["Bank Connections"])
fintoc = FintocProvider()


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
    return session.exec(select(BankConnection).order_by(BankConnection.display_name)).all()


@router.post("/", response_model=BankConnectionRead, status_code=status.HTTP_201_CREATED)
def create_connection(data: BankConnectionCreate, session: Session = Depends(get_session)):
    conn = BankConnection(**data.model_dump())
    session.add(conn)
    session.commit()
    session.refresh(conn)
    return conn


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

    conn = BankConnection(
        provider="fintoc",
        display_name="Fintoc - Cuenta bancaria",
        status=status_value,
        account_id=data.account_id,
        access_token=access_token,
        connection_metadata=str(result),
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
    accounts = fintoc.get_accounts(conn.access_token or "")
    return {"accounts": accounts}


@router.post("/fintoc/sync")
def fintoc_sync(data: FintocSyncRequest, session: Session = Depends(get_session)):
    """Sync movements from Fintoc for a given connection."""
    conn = session.get(BankConnection, data.connection_id)
    if not conn or conn.provider != "fintoc":
        raise HTTPException(status_code=404, detail="Conexión Fintoc no encontrada")

    result = fintoc.sync(conn.access_token or "", str(data.account_id))
    conn.last_sync = datetime.utcnow()
    conn.status = "connected"
    session.add(conn)
    session.commit()

    return {
        "synced_count": result.get("synced_count", 0),
        "connection_id": data.connection_id,
        "note": "Movimientos obtenidos (mock en desarrollo). Usa /imports para guardarlos.",
        "movements": result.get("movements", []),
    }

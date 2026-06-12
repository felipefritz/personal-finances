from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountRead, AccountUpdate
from app.services.credit_card_service import compute_credit_card_metrics

router = APIRouter(prefix="/accounts", tags=["Accounts"])


def _enrich_account(account: Account, session: Session) -> AccountRead:
    data = account.model_dump()
    if account.account_type == "tarjeta_credito":
        metrics = compute_credit_card_metrics(session, account.id)
        computed_balance = float(metrics.get("computed_balance") or 0.0)
        credit_limit = float(metrics.get("statement_credit_limit") or account.balance or 0.0)
        statement_available = metrics.get("statement_available_credit")
        data["computed_balance"] = computed_balance
        data["credit_limit"] = credit_limit
        data["available_credit"] = float(statement_available) if statement_available is not None else (credit_limit + computed_balance)
        data["future_installments_commitment"] = float(metrics.get("future_installments_commitment") or 0.0)
    return AccountRead(**data)


@router.get("/", response_model=List[AccountRead])
def list_accounts(session: Session = Depends(get_session)):
    accounts = session.exec(select(Account).order_by(Account.name)).all()
    return [_enrich_account(a, session) for a in accounts]


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return _enrich_account(account, session)


@router.post("/", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(data: AccountCreate, session: Session = Depends(get_session)):
    account = Account(**data.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(account_id: int, data: AccountUpdate, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    for key, value in update_data.items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    session.delete(account)
    session.commit()

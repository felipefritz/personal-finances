from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountRead, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("/", response_model=List[AccountRead])
def list_accounts(session: Session = Depends(get_session)):
    return session.exec(select(Account).order_by(Account.name)).all()


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return account


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

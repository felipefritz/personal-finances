from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.fixed_expense import FixedExpense
from app.models.category import Category
from app.models.account import Account
from app.schemas.fixed_expense import FixedExpenseCreate, FixedExpenseRead, FixedExpenseUpdate

router = APIRouter(prefix="/fixed-expenses", tags=["Fixed Expenses"])


def _enrich(fe: FixedExpense, session: Session) -> FixedExpenseRead:
    cat = session.get(Category, fe.category_id) if fe.category_id else None
    acc = session.get(Account, fe.account_id) if fe.account_id else None
    data = fe.model_dump()
    data["category_name"] = cat.name if cat else None
    data["account_name"] = acc.name if acc else None
    return FixedExpenseRead(**data)


@router.get("/", response_model=List[FixedExpenseRead])
def list_fixed_expenses(session: Session = Depends(get_session)):
    items = session.exec(select(FixedExpense).order_by(FixedExpense.name)).all()
    return [_enrich(fe, session) for fe in items]


@router.get("/{fe_id}", response_model=FixedExpenseRead)
def get_fixed_expense(fe_id: int, session: Session = Depends(get_session)):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")
    return _enrich(fe, session)


@router.post("/", response_model=FixedExpenseRead, status_code=status.HTTP_201_CREATED)
def create_fixed_expense(data: FixedExpenseCreate, session: Session = Depends(get_session)):
    fe = FixedExpense(**data.model_dump())
    session.add(fe)
    session.commit()
    session.refresh(fe)
    return _enrich(fe, session)


@router.patch("/{fe_id}", response_model=FixedExpenseRead)
def update_fixed_expense(fe_id: int, data: FixedExpenseUpdate, session: Session = Depends(get_session)):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    for key, value in update_data.items():
        setattr(fe, key, value)
    session.add(fe)
    session.commit()
    session.refresh(fe)
    return _enrich(fe, session)


@router.delete("/{fe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fixed_expense(fe_id: int, session: Session = Depends(get_session)):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")
    session.delete(fe)
    session.commit()

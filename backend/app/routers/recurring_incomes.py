from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.recurring_income import RecurringIncome
from app.models.category import Category
from app.models.account import Account
from app.schemas.recurring_income import RecurringIncomeCreate, RecurringIncomeRead, RecurringIncomeUpdate

router = APIRouter(prefix="/recurring-incomes", tags=["Recurring Incomes"])


def _enrich(ri: RecurringIncome, session: Session) -> RecurringIncomeRead:
    cat = session.get(Category, ri.category_id) if ri.category_id else None
    acc = session.get(Account, ri.account_id) if ri.account_id else None
    data = ri.model_dump()
    data["category_name"] = cat.name if cat else None
    data["account_name"] = acc.name if acc else None
    return RecurringIncomeRead(**data)


@router.get("/", response_model=List[RecurringIncomeRead])
def list_recurring_incomes(session: Session = Depends(get_session)):
    items = session.exec(select(RecurringIncome).order_by(RecurringIncome.name)).all()
    return [_enrich(ri, session) for ri in items]


@router.get("/{ri_id}", response_model=RecurringIncomeRead)
def get_recurring_income(ri_id: int, session: Session = Depends(get_session)):
    ri = session.get(RecurringIncome, ri_id)
    if not ri:
        raise HTTPException(status_code=404, detail="Ingreso recurrente no encontrado")
    return _enrich(ri, session)


@router.post("/", response_model=RecurringIncomeRead, status_code=status.HTTP_201_CREATED)
def create_recurring_income(data: RecurringIncomeCreate, session: Session = Depends(get_session)):
    ri = RecurringIncome(**data.model_dump())
    session.add(ri)
    session.commit()
    session.refresh(ri)
    return _enrich(ri, session)


@router.patch("/{ri_id}", response_model=RecurringIncomeRead)
def update_recurring_income(ri_id: int, data: RecurringIncomeUpdate, session: Session = Depends(get_session)):
    ri = session.get(RecurringIncome, ri_id)
    if not ri:
        raise HTTPException(status_code=404, detail="Ingreso recurrente no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    for key, value in update_data.items():
        setattr(ri, key, value)
    session.add(ri)
    session.commit()
    session.refresh(ri)
    return _enrich(ri, session)


@router.delete("/{ri_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_income(ri_id: int, session: Session = Depends(get_session)):
    ri = session.get(RecurringIncome, ri_id)
    if not ri:
        raise HTTPException(status_code=404, detail="Ingreso recurrente no encontrado")
    session.delete(ri)
    session.commit()

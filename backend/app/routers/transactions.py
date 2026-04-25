import math
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, and_, or_, func

from app.core.database import get_session
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from app.schemas.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransactionListResponse,
)
from app.services.categorization_service import suggest_category

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def _normalize_transaction_payload(payload: dict) -> dict:
    normalized = dict(payload)
    amount = normalized.get("amount")
    tx_type = normalized.get("transaction_type")

    if amount is not None and tx_type == "income":
        normalized["amount"] = abs(amount)
        normalized["is_transfer"] = False
    elif amount is not None and tx_type == "expense":
        normalized["amount"] = -abs(amount)
        normalized["is_transfer"] = False
    elif tx_type == "transfer":
        normalized["is_transfer"] = True

    return normalized


def _enrich(t: Transaction, session: Session) -> TransactionRead:
    cat = session.get(Category, t.category_id) if t.category_id else None
    acc = session.get(Account, t.account_id) if t.account_id else None
    data = t.model_dump()
    data["category_name"] = cat.name if cat else None
    data["account_name"] = acc.name if acc else None
    return TransactionRead(**data)


@router.get("/", response_model=TransactionListResponse)
def list_transactions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    account_id: Optional[int] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    transaction_type: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    min_amount: Optional[float] = Query(default=None),
    max_amount: Optional[float] = Query(default=None),
    search: Optional[str] = Query(default=None),
    is_fixed_expense: Optional[bool] = Query(default=None),
    is_ant_expense: Optional[bool] = Query(default=None),
    status: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
):
    filters = []
    if date_from:
        from datetime import date as date_type
        filters.append(Transaction.date >= date_type.fromisoformat(date_from))
    if date_to:
        from datetime import date as date_type
        filters.append(Transaction.date <= date_type.fromisoformat(date_to))
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category_id:
        filters.append(Transaction.category_id == category_id)
    if transaction_type:
        filters.append(Transaction.transaction_type == transaction_type)
    if source:
        filters.append(Transaction.source == source)
    if min_amount is not None:
        filters.append(Transaction.amount >= min_amount)
    if max_amount is not None:
        filters.append(Transaction.amount <= max_amount)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if is_fixed_expense is not None:
        filters.append(Transaction.is_fixed_expense == is_fixed_expense)
    if is_ant_expense is not None:
        filters.append(Transaction.is_ant_expense == is_ant_expense)
    if status:
        filters.append(Transaction.status == status)

    query = select(Transaction)
    if filters:
        query = query.where(and_(*filters))
    query = query.order_by(Transaction.date.desc(), Transaction.id.desc())

    total = len(session.exec(query).all())
    offset = (page - 1) * page_size
    items = session.exec(query.offset(offset).limit(page_size)).all()

    enriched = [_enrich(t, session) for t in items]
    return TransactionListResponse(
        items=enriched,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.get("/{transaction_id}", response_model=TransactionRead)
def get_transaction(transaction_id: int, session: Session = Depends(get_session)):
    t = session.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return _enrich(t, session)


@router.post("/", response_model=TransactionRead, status_code=201)
def create_transaction(data: TransactionCreate, session: Session = Depends(get_session)):
    # Auto-suggest category if not provided
    if not data.category_id:
        suggestion = suggest_category(data.description, data.amount)
        updates = {
            "is_ant_expense": suggestion["is_ant_expense"],
            "is_debt": suggestion.get("is_debt", False),
            "is_fixed_expense": suggestion.get("is_fixed_expense", False),
        }
        if suggestion["category"]:
            cat = session.exec(select(Category).where(Category.name == suggestion["category"])).first()
            if cat:
                updates["category_id"] = cat.id
        data = data.model_copy(update=updates)

    t = Transaction(**_normalize_transaction_payload(data.model_dump()))
    session.add(t)
    session.commit()
    session.refresh(t)
    return _enrich(t, session)


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(transaction_id: int, data: TransactionUpdate, session: Session = Depends(get_session)):
    t = session.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    update_data = _normalize_transaction_payload(update_data)
    for key, value in update_data.items():
        setattr(t, key, value)
    session.add(t)
    session.commit()
    session.refresh(t)
    return _enrich(t, session)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, session: Session = Depends(get_session)):
    t = session.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    session.delete(t)
    session.commit()


@router.post("/{transaction_id}/categorize")
def auto_categorize(transaction_id: int, session: Session = Depends(get_session)):
    t = session.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    suggestion = suggest_category(t.description, t.amount)
    if suggestion["category"]:
        cat = session.exec(select(Category).where(Category.name == suggestion["category"])).first()
        if cat:
            t.category_id = cat.id
            t.is_ant_expense = suggestion["is_ant_expense"]
            t.updated_at = datetime.utcnow()
            session.add(t)
            session.commit()
            session.refresh(t)
    return _enrich(t, session)

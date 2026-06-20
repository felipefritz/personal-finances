from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.fixed_expense import FixedExpense
from app.models.category import Category
from app.models.account import Account
from app.schemas.fixed_expense import (
    FixedExpenseCreate,
    FixedExpenseRead,
    FixedExpenseUpdate,
    FixedExpensePrepayRequest,
    FixedExpensePrepayResponse,
    FixedExpensePrepayRevertRequest,
    FixedExpensePrepayRevertResponse,
)
from app.services.currency_service import convert_fixed_amount_to_clp

router = APIRouter(prefix="/fixed-expenses", tags=["Fixed Expenses"])


def _category_color(cat: Category | None, session: Session) -> str | None:
    if not cat:
        return None
    if cat.color:
        return cat.color
    parent = session.get(Category, cat.parent_id) if cat.parent_id else None
    return parent.color if parent else None


def _enrich(fe: FixedExpense, session: Session) -> FixedExpenseRead:
    cat = session.get(Category, fe.category_id) if fe.category_id else None
    acc = session.get(Account, fe.account_id) if fe.account_id else None
    data = fe.model_dump()
    amount_clp = convert_fixed_amount_to_clp(fe.expected_amount, fe.currency)
    data["category_name"] = cat.name if cat else None
    data["category_color"] = _category_color(cat, session)
    data["account_name"] = acc.name if acc else None
    data["expected_amount_clp"] = amount_clp
    data["total_debt_clp"] = (
        round(amount_clp * max(fe.total_installments or 0, 0), 0)
        if amount_clp is not None and fe.total_installments
        else None
    )
    data["remaining_debt_clp"] = (
        round(amount_clp * max(fe.remaining_installments or 0, 0), 0)
        if amount_clp is not None and fe.remaining_installments
        else None
    )
    return FixedExpenseRead(**data)


def _normalize_fixed_expense_payload(data: dict, existing: FixedExpense | None = None) -> dict:
    normalized = dict(data)
    amount_mode = normalized.pop("amount_mode", None)
    expense_type = normalized.get("expense_type", existing.expense_type if existing else None)
    currency = (normalized.get("currency") or (existing.currency if existing else "CLP")).upper()
    normalized["currency"] = "UF" if expense_type == "dividendo" else currency

    if amount_mode == "total" and normalized.get("expected_amount") is not None:
        total_installments = normalized.get("total_installments")
        if total_installments is None and existing is not None:
            total_installments = existing.total_installments
        if not total_installments or int(total_installments) <= 0:
            raise HTTPException(
                status_code=400,
                detail="Para ingresar monto total debes indicar cuotas totales",
            )

        precision = 4 if normalized["currency"] == "UF" else 2
        normalized["expected_amount"] = round(
            float(normalized["expected_amount"]) / int(total_installments),
            precision,
        )
    return normalized


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
    fe = FixedExpense(**_normalize_fixed_expense_payload(data.model_dump()))
    session.add(fe)
    session.commit()
    session.refresh(fe)
    return _enrich(fe, session)


@router.patch("/{fe_id}", response_model=FixedExpenseRead)
def update_fixed_expense(fe_id: int, data: FixedExpenseUpdate, session: Session = Depends(get_session)):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")
    update_data = _normalize_fixed_expense_payload(data.model_dump(exclude_unset=True), existing=fe)
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


@router.post("/{fe_id}/prepay", response_model=FixedExpensePrepayResponse)
def prepay_fixed_expense(
    fe_id: int,
    payload: FixedExpensePrepayRequest,
    session: Session = Depends(get_session),
):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")

    if fe.remaining_installments is None:
        raise HTTPException(status_code=400, detail="Este gasto fijo no tiene cuotas para prepagar")

    if fe.remaining_installments <= 0:
        raise HTTPException(status_code=400, detail="La deuda ya esta pagada")

    previous_remaining = int(fe.remaining_installments)
    prepaid = min(int(payload.installments), previous_remaining)
    new_remaining = max(previous_remaining - prepaid, 0)

    fe.remaining_installments = new_remaining
    if new_remaining == 0:
        # Close debt so it stops contributing to forward projections.
        fe.is_active = False
    fe.updated_at = datetime.utcnow()

    session.add(fe)
    session.commit()
    session.refresh(fe)

    return FixedExpensePrepayResponse(
        fixed_expense=_enrich(fe, session),
        prepaid_installments=prepaid,
        previous_remaining_installments=previous_remaining,
        remaining_installments=new_remaining,
        closed_debt=new_remaining == 0,
    )


@router.post("/{fe_id}/prepay/revert", response_model=FixedExpensePrepayRevertResponse)
def revert_fixed_expense_prepay(
    fe_id: int,
    payload: FixedExpensePrepayRevertRequest,
    session: Session = Depends(get_session),
):
    fe = session.get(FixedExpense, fe_id)
    if not fe:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado")

    if fe.remaining_installments is None:
        raise HTTPException(status_code=400, detail="Este gasto fijo no maneja cuotas")

    previous_remaining = max(int(fe.remaining_installments), 0)
    requested_revert = int(payload.installments)

    if fe.total_installments and fe.total_installments > 0:
        max_recoverable = max(int(fe.total_installments) - previous_remaining, 0)
        if max_recoverable <= 0:
            raise HTTPException(status_code=400, detail="No hay cuotas disponibles para revertir")
        reverted = min(requested_revert, max_recoverable)
    else:
        reverted = requested_revert

    new_remaining = previous_remaining + reverted
    fe.remaining_installments = new_remaining
    if new_remaining > 0:
        fe.is_active = True
    fe.updated_at = datetime.utcnow()

    session.add(fe)
    session.commit()
    session.refresh(fe)

    return FixedExpensePrepayRevertResponse(
        fixed_expense=_enrich(fe, session),
        reverted_installments=reverted,
        previous_remaining_installments=previous_remaining,
        remaining_installments=new_remaining,
        reopened_debt=previous_remaining == 0 and new_remaining > 0,
    )

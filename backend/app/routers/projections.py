from datetime import datetime, date
from typing import Optional, Dict

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import Session, select, and_

from app.core.database import get_session
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.fixed_expense import FixedExpense
from app.schemas.transaction import (
    InstallmentPrepayRequest,
    InstallmentPrepayResponse,
    InstallmentPrepayRevertRequest,
    InstallmentPrepayRevertResponse,
)
from app.services.currency_service import convert_fixed_amount_to_clp
from app.models.recurring_income import RecurringIncome
from app.services.projection_service import (
    project_annual_balance,
    _calc_fixed_expenses_for_month,
    _build_installment_statement_month_map,
    _calc_pending_installments_for_month,
    _get_installment_anchor_month,
    _get_installment_due_count_from_anchor,
    _is_fintoc_internal_transfer,
    _projection_amount,
)
from app.services.financial_policy import max_suggested_savings_from_available

router = APIRouter(prefix="/projections", tags=["Projections"])

MONTH_NAMES = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]


def _build_active_installment_row(
    tx: Transaction,
    statement_month_by_import_id: Dict[int, str],
) -> Optional[dict]:
    cur = tx.installment_current
    tot = tx.installment_total
    if cur is None or tot is None:
        return None

    due_count = _get_installment_due_count_from_anchor(tx)
    if due_count <= 0:
        return None

    if tx.installment_base_amount and tx.installment_base_amount > 0:
        monthly = tx.installment_base_amount
        if tx.is_international and tx.local_amount is not None:
            monthly = abs(tx.local_amount)
    elif cur == 0:
        monthly = abs(_projection_amount(tx))
    elif tot > 0:
        monthly = abs(_projection_amount(tx))
    else:
        return None

    anchor = _get_installment_anchor_month(tx, statement_month_by_import_id)
    start_m = anchor.month
    start_y = anchor.year

    schedule = []
    for i in range(due_count):
        m = start_m + i
        y = start_y + (m - 1) // 12
        m = (m - 1) % 12 + 1
        schedule.append(f"{MONTH_NAMES[m - 1]} {y}")

    total_remaining = round(due_count * monthly, 0)

    return {
        "id": tx.id,
        "date": tx.date.isoformat(),
        "description": tx.description,
        "installment_current": cur,
        "installment_total": tot,
        "monthly_amount": round(monthly, 0),
        "remaining_installments": due_count,
        "total_remaining": total_remaining,
        "schedule": schedule,
        "is_new_debt": cur == 0,
    }


@router.get("/annual")
def annual_projection(
    year: int = Query(default=None, ge=2000, le=2100),
    account_id: int = Query(default=None),
    include_fintoc_internal_transfers: bool = Query(default=False),
    session: Session = Depends(get_session),
):
    """
    Returns a 12-month balance projection for the requested year.
    Past/current months use real transaction data; future months use templates
    (recurring incomes, fixed expenses, installment forecasts, variable avg).
    """
    if year is None:
        year = datetime.now().year
    return {
        "year": year,
        "months": project_annual_balance(
            session,
            year,
            account_id=account_id,
            include_fintoc_internal_transfers=include_fintoc_internal_transfers,
        ),
    }


@router.get("/month-breakdown")
def month_breakdown(
    year: int = Query(default=None, ge=2000, le=2100),
    month: int = Query(default=None, ge=1, le=12),
    include_fintoc_internal_transfers: bool = Query(default=False),
    session: Session = Depends(get_session),
):
    """
    Returns a breakdown of transactions for a specific month grouped by account and type.
    Shows: income, fixed_expenses, variable_expenses, and installments per account.
    Useful for drilling down from the annual projection.
    """
    if year is None:
        year = datetime.now().year
    if month is None:
        month = datetime.now().month

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    conditions = [
        Transaction.date >= start,
        Transaction.date < end,
        Transaction.status != "ignored",
    ]

    txs = session.exec(select(Transaction).where(and_(*conditions))).all()
    
    # Filter out Fintoc internal transfers if requested
    if not include_fintoc_internal_transfers:
        txs = [t for t in txs if not _is_fintoc_internal_transfer(t)]

    # Group by account
    breakdown: Dict[Optional[int], dict] = {}
    for tx in txs:
        acc_id = tx.account_id
        if acc_id not in breakdown:
            acc = session.get(Account, acc_id) if acc_id else None
            breakdown[acc_id] = {
                "account_id": acc_id,
                "account_name": acc.name if acc else "Sin cuenta",
                "income": 0,
                "fixed_expenses": 0,
                "variable_expenses": 0,
                "installments": 0,
                "transactions": [],
            }

        projection_amount = _projection_amount(tx)

        if tx.transaction_type == "income":
            breakdown[acc_id]["income"] += projection_amount
        elif tx.is_debt or (tx.installment_current is not None and tx.installment_current > 0):
            breakdown[acc_id]["installments"] += abs(projection_amount)
        elif tx.is_fixed_expense:
            breakdown[acc_id]["fixed_expenses"] += abs(projection_amount)
        elif tx.transaction_type == "expense":
            breakdown[acc_id]["variable_expenses"] += abs(projection_amount)

        breakdown[acc_id]["transactions"].append({
            "date": tx.date.isoformat(),
            "description": tx.description,
            "amount": projection_amount,
            "type": tx.transaction_type,
            "category": tx.category_id,
            "is_fixed": tx.is_fixed_expense,
            "is_debt": tx.is_debt,
            "original_amount": tx.original_amount,
            "original_currency": tx.original_currency,
        })

    return {
        "year": year,
        "month": month,
        "breakdown": list(breakdown.values()),
    }


@router.get("/installments")
def active_installments(
    account_id: int = Query(default=None),
    session: Session = Depends(get_session),
):
    """Returns all active installment transactions with their monthly schedule."""
    q = select(Transaction).where(
        Transaction.installment_total.is_not(None),
        Transaction.status != "ignored",
    )
    if account_id:
        q = q.where(Transaction.account_id == account_id)
    txs = session.exec(q).all()
    statement_month_by_import_id = _build_installment_statement_month_map(session, txs)

    result = []
    for tx in txs:
        row = _build_active_installment_row(tx, statement_month_by_import_id)
        if row:
            result.append(row)

    result.sort(key=lambda x: (-x["remaining_installments"]))
    return result


@router.post("/installments/{transaction_id}/prepay", response_model=InstallmentPrepayResponse)
def prepay_installment_debt(
    transaction_id: int,
    payload: InstallmentPrepayRequest,
    session: Session = Depends(get_session),
):
    tx = session.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    if tx.installment_total is None or tx.installment_current is None:
        raise HTTPException(status_code=400, detail="El movimiento no tiene cuotas activas")

    previous_remaining = _get_installment_due_count_from_anchor(tx)
    if previous_remaining <= 0:
        raise HTTPException(status_code=400, detail="La deuda en cuotas ya esta cerrada")

    prepaid = min(int(payload.installments), previous_remaining)
    remaining_after = max(previous_remaining - prepaid, 0)

    current = int(tx.installment_current)
    if current == 0:
        tx.installment_total = remaining_after
    else:
        tx.installment_total = current + remaining_after - 1

    tx.updated_at = datetime.utcnow()
    session.add(tx)
    session.commit()

    return InstallmentPrepayResponse(
        transaction_id=transaction_id,
        prepaid_installments=prepaid,
        previous_remaining_installments=previous_remaining,
        remaining_installments=remaining_after,
        closed_debt=remaining_after == 0,
    )


@router.post("/installments/{transaction_id}/prepay/revert", response_model=InstallmentPrepayRevertResponse)
def revert_installment_prepay(
    transaction_id: int,
    payload: InstallmentPrepayRevertRequest,
    session: Session = Depends(get_session),
):
    tx = session.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    if tx.installment_total is None or tx.installment_current is None:
        raise HTTPException(status_code=400, detail="El movimiento no tiene cuotas")

    previous_remaining = _get_installment_due_count_from_anchor(tx)
    reverted = int(payload.installments)

    tx.installment_total = int(tx.installment_total) + reverted
    tx.updated_at = datetime.utcnow()
    session.add(tx)
    session.commit()

    return InstallmentPrepayRevertResponse(
        transaction_id=transaction_id,
        reverted_installments=reverted,
        previous_remaining_installments=previous_remaining,
        remaining_installments=previous_remaining + reverted,
        reopened_debt=previous_remaining == 0,
    )


@router.get("/budget-rules")
def budget_rules(
    account_id: int = Query(default=None),
    year: int = Query(default=None, ge=2000, le=2100),
    month: int = Query(default=None, ge=1, le=12),
    include_fintoc_internal_transfers: bool = Query(default=False),
    session: Session = Depends(get_session),
):
    """
    Returns a 50/30/20 budget analysis adapted to the user's real spending.

    Buckets:
      needs   (50%) – fixed expenses + installment payments (committed obligations)
      wants   (30%) – variable / discretionary spending
      savings (20%) – savings goals + free remainder

    Also returns a "debt-adjusted" variant: if cuotas already exceed the needs
    budget, the percentages are recalculated showing the actual constraint.
    """
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    # Preferred path: align budget-rules with the exact projection month so
    # chart/table/distribution all use the same source of truth.
    projection_month = next(
        (
            m for m in project_annual_balance(
                session,
                target_year,
                account_id=account_id,
                include_fintoc_internal_transfers=include_fintoc_internal_transfers,
            )
            if int(m.get("month", 0)) == target_month
        ),
        None,
    )

    if projection_month is not None:
        monthly_income = round(float(projection_month.get("total_income", 0) or 0), 0)
        actual_needs = round(
            float(projection_month.get("fixed_expenses", 0) or 0)
            + float(projection_month.get("pending_installments", 0) or 0),
            0,
        )
        actual_wants = round(float(projection_month.get("variable_expenses", 0) or 0), 0)
        actual_savings = round(float(projection_month.get("total_suggested_savings", 0) or 0), 0)

        target_needs = round(monthly_income * 0.50, 0)
        target_wants = round(monthly_income * 0.30, 0)
        target_savings = round(monthly_income * 0.20, 0)

        debt_ratio = (
            float(projection_month.get("pending_installments", 0) or 0) / monthly_income * 100
        ) if monthly_income > 0 else 0

        warnings = []
        if debt_ratio > 30:
            warnings.append(f"Cuotas representan {debt_ratio:.0f}% del ingreso mensual (recomendado <30%).")
        if (actual_needs / monthly_income > 0.60) if monthly_income > 0 else False:
            warnings.append("Gastos de necesidades superan el 60% del ingreso.")
        if actual_savings < target_savings * 0.5:
            warnings.append("Capacidad de ahorro actual es menor al 10% del ingreso.")

        return {
            "year": target_year,
            "month": target_month,
            "monthly_income": monthly_income,
            "income_source": "projection",
            "samples_months": 1,
            "rules_5030_20": {
                "target_needs": target_needs,
                "target_wants": target_wants,
                "target_savings": target_savings,
                "actual_needs": actual_needs,
                "actual_wants": actual_wants,
                "actual_savings": actual_savings,
                "needs_pct": round(actual_needs / monthly_income * 100, 1) if monthly_income > 0 else 0,
                "wants_pct": round(actual_wants / monthly_income * 100, 1) if monthly_income > 0 else 0,
                "savings_pct": round(actual_savings / monthly_income * 100, 1) if monthly_income > 0 else 0,
            },
            "debt_pressure": {
                "future_monthly_installments": round(float(projection_month.get("pending_installments", 0) or 0), 0),
                "debt_ratio_pct": round(debt_ratio, 1),
            },
            "suggested_allocation": {
                "fixed_expenses": round(float(projection_month.get("fixed_expenses", 0) or 0), 0),
                "installments": round(float(projection_month.get("pending_installments", 0) or 0), 0),
                "wants": round(max(float(projection_month.get("net_balance", 0) or 0), 0), 0),
                "savings": actual_savings,
            },
            "warnings": warnings,
        }

    # ── Templates (authoritative source, same as projection_service) ─────
    recurring_incomes = session.exec(
        select(RecurringIncome).where(RecurringIncome.is_active == True)
    ).all()
    total_recurring_income = sum(r.amount for r in recurring_incomes)

    fixed_exp_q = select(FixedExpense).where(FixedExpense.is_active == True)
    if account_id:
        fixed_exp_q = fixed_exp_q.where(FixedExpense.account_id == account_id)
    fixed_expenses_list = session.exec(fixed_exp_q).all()
    total_fixed_template = _calc_fixed_expenses_for_month(
        fixed_expenses_list,
        target_year,
        target_month,
    )

    # ── All installment transactions ─────────────────────────────────────
    inst_q = select(Transaction).where(
        Transaction.installment_total.is_not(None),
        Transaction.status != "ignored",
    )
    if account_id:
        inst_q = inst_q.where(Transaction.account_id == account_id)
    inst_txs = session.exec(inst_q).all()
    statement_month_by_import_id = _build_installment_statement_month_map(session, inst_txs)

    # ── Real income: average of last 3 complete months ───────────────────
    # Use last 3 complete months for averages
    income_samples = []
    variable_samples = []
    for delta in range(1, 4):
        m = today.month - delta
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        start = date(y, m, 1)
        end_m = m + 1 if m < 12 else 1
        end_y = y if m < 12 else y + 1
        end = date(end_y, end_m, 1)

        inc_conds = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status != "ignored",
            Transaction.transaction_type == "income",
        ]
        if account_id:
            inc_conds.append(Transaction.account_id == account_id)
        inc_txs = session.exec(select(Transaction).where(and_(*inc_conds))).all()
        income_samples.append(sum(t.amount for t in inc_txs))

        # Variable = non-fixed, non-installment expenses
        exp_conds = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status != "ignored",
            Transaction.transaction_type == "expense",
            Transaction.is_paid == True,
        ]
        if account_id:
            exp_conds.append(Transaction.account_id == account_id)
        exp_txs = session.exec(select(Transaction).where(and_(*exp_conds))).all()
        variable = sum(
            abs(t.amount) for t in exp_txs
            if not t.is_fixed_expense
            and not (t.is_debt or t.installment_current is not None)
        )
        variable_samples.append(variable)

    avg_income_real = sum(income_samples) / len(income_samples) if income_samples else 0
    avg_variable = sum(variable_samples) / len(variable_samples) if variable_samples else 0

    # Monthly income: prefer real avg, fall back to recurring income template
    monthly_income = avg_income_real if avg_income_real > 100_000 else total_recurring_income

    # Fixed expenses: use template (transactions are not tagged is_fixed_expense reliably)
    avg_fixed = total_fixed_template

    # Installments for current month using the same schedule projection as the main table
    avg_installments = _calc_pending_installments_for_month(
        inst_txs,
        today.year,
        today.month,
        statement_month_by_import_id,
    )

    # Forward installment pressure (all remaining installments active right now)
    future_monthly_installments = avg_installments

    # Standard 50/30/20 targets
    target_needs = round(monthly_income * 0.50, 0)
    target_wants = round(monthly_income * 0.30, 0)
    target_savings = round(monthly_income * 0.20, 0)

    # Actual committed needs = fixed + installments
    actual_needs = round(avg_fixed + avg_installments, 0)
    actual_wants = round(avg_variable, 0)
    actual_savings = round(max(monthly_income - actual_needs - actual_wants, 0), 0)

    # Debt pressure: how much of income is committed to cuotas
    debt_ratio = (future_monthly_installments / monthly_income * 100) if monthly_income > 0 else 0

    # Suggested reallocation: respects locked cuotas, tries to hit 20% savings
    locked_installments = round(future_monthly_installments, 0)
    remaining_after_inst = monthly_income - locked_installments
    suggested_fixed = round(avg_fixed, 0)  # can't easily cut fixed
    desired_savings = round(monthly_income * 0.20, 0)
    savings_cap_by_availability = max_suggested_savings_from_available(
        monthly_income - locked_installments - suggested_fixed
    )
    suggested_savings = round(min(desired_savings, savings_cap_by_availability), 0)
    suggested_wants = round(max(remaining_after_inst - suggested_fixed - suggested_savings, 0), 0)

    # Warning flags
    warnings = []
    if debt_ratio > 30:
        warnings.append(f"Cuotas representan {debt_ratio:.0f}% del ingreso mensual (recomendado <30%).")
    if actual_needs / monthly_income > 0.60 if monthly_income > 0 else False:
        warnings.append("Gastos de necesidades superan el 60% del ingreso.")
    if actual_savings < target_savings * 0.5:
        warnings.append("Capacidad de ahorro actual es menor al 10% del ingreso.")

    return {
        "monthly_income": round(monthly_income, 0),
        "income_source": "real" if avg_income_real > 100_000 else "template",
        "samples_months": len(income_samples),
        "rules_5030_20": {
            "target_needs": target_needs,
            "target_wants": target_wants,
            "target_savings": target_savings,
            "actual_needs": actual_needs,
            "actual_wants": actual_wants,
            "actual_savings": actual_savings,
            "needs_pct": round(actual_needs / monthly_income * 100, 1) if monthly_income > 0 else 0,
            "wants_pct": round(actual_wants / monthly_income * 100, 1) if monthly_income > 0 else 0,
            "savings_pct": round(actual_savings / monthly_income * 100, 1) if monthly_income > 0 else 0,
        },
        "debt_pressure": {
            "future_monthly_installments": round(future_monthly_installments, 0),
            "debt_ratio_pct": round(debt_ratio, 1),
        },
        "suggested_allocation": {
            "fixed_expenses": suggested_fixed,
            "installments": locked_installments,
            "wants": suggested_wants,
            "savings": suggested_savings,
        },
        "warnings": warnings,
    }

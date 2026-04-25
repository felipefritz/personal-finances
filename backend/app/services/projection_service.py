"""
Annual balance projection service.

For each month of the requested year calculates:
  total_income            – recurring incomes + real income for past/current months
  fixed_expenses          – active fixed expenses template
  pending_installments    – cuotas due that month (inferred from installment metadata)
  avg_variable_expenses   – 3-month rolling average of variable spending
  available_balance       – income – all expenses
  suggested_savings       – pro-rata contribution per active savings goal
  net_balance             – available_balance – suggested_savings
  is_actual               – True for past/current months (real data), False for future
"""
from datetime import date
from typing import Any, Dict, List, Optional

from sqlmodel import Session, select, and_

from app.models.transaction import Transaction
from app.models.fixed_expense import FixedExpense
from app.models.recurring_income import RecurringIncome
from app.models.savings_goal import SavingsGoal

MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def project_annual_balance(
    session: Session,
    year: int,
    account_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    today = date.today()

    # ── Static templates (used for future months) ──────────────────────────
    recurring_incomes = session.exec(
        select(RecurringIncome).where(RecurringIncome.is_active == True)
    ).all()
    total_recurring_income = sum(r.amount for r in recurring_incomes)

    fixed_exp_q = select(FixedExpense).where(FixedExpense.is_active == True)
    if account_id:
        fixed_exp_q = fixed_exp_q.where(FixedExpense.account_id == account_id)
    fixed_expenses_list = session.exec(fixed_exp_q).all()
    total_fixed_template = round(sum(max(f.expected_amount, 0) for f in fixed_expenses_list), 2)

    goals = session.exec(select(SavingsGoal).where(SavingsGoal.status == "active")).all()

    # ── Installment transactions ─────────────────────────────────────────
    inst_q = select(Transaction).where(
        Transaction.installment_total.is_not(None),
        Transaction.status != "ignored",
    )
    if account_id:
        inst_q = inst_q.where(Transaction.account_id == account_id)
    installment_txs = session.exec(inst_q).all()

    # ── Average variable expenses (from most recent 3 real months) ────────
    avg_variable = _avg_variable_last_3(session, today.month, today.year, account_id)

    result: List[Dict[str, Any]] = []

    for month in range(1, 13):
        is_actual = (year < today.year) or (year == today.year and month <= today.month)

        if is_actual:
            month_data = _build_actual_month(
                session, year, month, account_id,
                total_recurring_income, total_fixed_template, goals,
            )
        else:
            month_data = _build_projected_month(
                year, month,
                total_recurring_income, total_fixed_template,
                avg_variable, installment_txs, goals,
            )

        result.append(month_data)

    return result


# ── Actual month (uses real transaction data) ─────────────────────────────────

def _build_actual_month(
    session: Session,
    year: int,
    month: int,
    account_id: Optional[int],
    total_recurring_income: float,
    total_fixed_template: float,
    goals: list,
) -> Dict[str, Any]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    conditions = [
        Transaction.date >= start,
        Transaction.date < end,
        Transaction.status != "ignored",
    ]
    if account_id:
        conditions.append(Transaction.account_id == account_id)

    txs = session.exec(select(Transaction).where(and_(*conditions))).all()

    real_income = sum(t.amount for t in txs if t.transaction_type == "income")
    real_fixed = sum(
        abs(t.amount) for t in txs
        if t.is_fixed_expense and t.transaction_type == "expense"
    )
    real_installments = sum(
        abs(t.amount) for t in txs
        if t.is_debt and t.transaction_type == "expense"
    )
    real_variable = sum(
        abs(t.amount) for t in txs
        if not t.is_fixed_expense and not t.is_debt and t.transaction_type == "expense"
    )

    # If no real income recorded yet, fall back to recurring income template
    total_income = real_income if real_income > 0 else total_recurring_income
    total_expenses = real_fixed + real_installments + real_variable
    available_balance = total_income - total_expenses
    suggested = _calc_suggested_savings(goals, year, month, available_balance)
    total_suggested = sum(s["amount"] for s in suggested)

    return {
        "month": month,
        "year": year,
        "label": MONTH_NAMES[month - 1],
        "is_actual": True,
        "total_income": round(total_income, 0),
        "recurring_income_template": 0,  # real data used
        "fixed_expenses": round(real_fixed, 0),
        "pending_installments": round(real_installments, 0),
        "variable_expenses": round(real_variable, 0),
        "total_expenses": round(total_expenses, 0),
        "available_balance": round(available_balance, 0),
        "suggested_savings": suggested,
        "total_suggested_savings": round(total_suggested, 0),
        "net_balance": round(available_balance - total_suggested, 0),
    }


# ── Projected month (uses templates + installment forecasting) ────────────────

def _build_projected_month(
    year: int,
    month: int,
    total_recurring_income: float,
    total_fixed_template: float,
    avg_variable: float,
    installment_txs: list,
    goals: list,
) -> Dict[str, Any]:
    pending_installments = _calc_pending_installments_for_month(installment_txs, year, month)
    total_expenses = total_fixed_template + pending_installments + avg_variable
    available_balance = total_recurring_income - total_expenses
    suggested = _calc_suggested_savings(goals, year, month, available_balance)
    total_suggested = sum(s["amount"] for s in suggested)

    return {
        "month": month,
        "year": year,
        "label": MONTH_NAMES[month - 1],
        "is_actual": False,
        "total_income": round(total_recurring_income, 0),
        "recurring_income_template": round(total_recurring_income, 0),
        "fixed_expenses": round(total_fixed_template, 0),
        "pending_installments": round(pending_installments, 0),
        "variable_expenses": round(avg_variable, 0),
        "total_expenses": round(total_expenses, 0),
        "available_balance": round(available_balance, 0),
        "suggested_savings": suggested,
        "total_suggested_savings": round(total_suggested, 0),
        "net_balance": round(available_balance - total_suggested, 0),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _calc_pending_installments_for_month(
    installment_txs: list,
    year: int,
    month: int,
) -> float:
    """Sum the installment amounts that fall due in (year, month)."""
    target = date(year, month, 1)
    total = 0.0

    for tx in installment_txs:
        if tx.installment_total is None or tx.installment_current is None:
            continue

        remaining = tx.installment_total - tx.installment_current
        if remaining <= 0:
            continue

        # Per-installment amount
        if tx.installment_base_amount and tx.installment_base_amount > 0:
            inst_amount = tx.installment_base_amount
        elif tx.installment_total > 0:
            inst_amount = abs(tx.amount) / tx.installment_total
        else:
            continue

        # First installment month = month AFTER the transaction date
        start_month = tx.date.month + 1
        start_year = tx.date.year
        if start_month > 12:
            start_month = 1
            start_year += 1

        start = date(start_year, start_month, 1)

        # Last installment month
        end_offset = remaining - 1
        end_month = start_month + end_offset
        end_year = start_year + (end_month - 1) // 12
        end_month = (end_month - 1) % 12 + 1
        end = date(end_year, end_month, 1)

        if start <= target <= end:
            total += inst_amount

    return round(total, 2)


def _avg_variable_last_3(
    session: Session,
    current_month: int,
    current_year: int,
    account_id: Optional[int] = None,
) -> float:
    """Average of variable (non-fixed, non-debt) expenses over last 3 months."""
    totals = []
    m, y = current_month, current_year
    for _ in range(3):
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        conditions = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.transaction_type == "expense",
            Transaction.status != "ignored",
            Transaction.is_fixed_expense == False,
            Transaction.is_debt == False,
        ]
        if account_id:
            conditions.append(Transaction.account_id == account_id)
        txs = session.exec(select(Transaction).where(and_(*conditions))).all()
        totals.append(sum(abs(t.amount) for t in txs))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return round(sum(totals) / len(totals), 2) if totals else 0.0


def _calc_suggested_savings(
    goals: list,
    year: int,
    month: int,
    available_balance: float,
) -> List[Dict[str, Any]]:
    """
    Calculate pro-rata monthly savings contribution per active goal.
    If the goal has a target_date, spreads the remaining amount over the months left.
    If no target_date, contributes 10% of available_balance (if positive).
    """
    suggestions = []
    today = date(year, month, 1)

    for goal in goals:
        remaining = goal.target_amount - goal.current_amount
        if remaining <= 0:
            continue

        if goal.target_date and goal.target_date > today:
            months_left = (goal.target_date.year - year) * 12 + (goal.target_date.month - month)
            if months_left <= 0:
                continue
            monthly = round(remaining / months_left, 0)
        else:
            if available_balance <= 0:
                continue
            monthly = round(available_balance * 0.10, 0)

        if monthly > 0:
            suggestions.append({
                "goal_id": goal.id,
                "goal_name": goal.name,
                "priority": goal.priority,
                "amount": monthly,
            })

    # Sort by priority (1 = highest)
    suggestions.sort(key=lambda s: s["priority"])
    return suggestions

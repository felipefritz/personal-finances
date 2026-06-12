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

from app.models.import_file import ImportFile
from app.models.transaction import Transaction
from app.models.fixed_expense import FixedExpense
from app.models.recurring_income import RecurringIncome
from app.models.savings_goal import SavingsGoal
from app.services.currency_service import convert_fixed_amount_to_clp
from app.models.budget import Budget
from app.models.category import Category
from app.services.financial_policy import max_suggested_savings_from_available

MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def project_annual_balance(
    session: Session,
    year: int,
    account_id: Optional[int] = None,
    include_fintoc_internal_transfers: bool = False,
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

    goals = session.exec(select(SavingsGoal).where(SavingsGoal.status == "active")).all()

    # ── Installment transactions ─────────────────────────────────────────
    inst_q = select(Transaction).where(
        Transaction.installment_total.is_not(None),
        Transaction.status != "ignored",
    )
    if account_id:
        inst_q = inst_q.where(Transaction.account_id == account_id)
    installment_txs = session.exec(inst_q).all()
    statement_month_by_import_id = _build_installment_statement_month_map(session, installment_txs)

    # ── Average variable expenses (from most recent 3 real months) ────────
    avg_variable = _avg_variable_last_3(
        session,
        today.month,
        today.year,
        account_id,
        include_fintoc_internal_transfers=include_fintoc_internal_transfers,
    )

    # ── Recurring budget template (user-planned variable spending) ────────
    # Find the most recent month that has is_recurring=True budgets
    recurring_budget_template = _calc_recurring_budget_template(session)
    # Use recurring budgets when available, otherwise fall back to historical avg
    projected_variable = recurring_budget_template if recurring_budget_template > 0 else avg_variable
    variable_source = "budget" if recurring_budget_template > 0 else "historical_avg"

    result: List[Dict[str, Any]] = []

    for month in range(1, 13):
        is_actual = (year < today.year) or (year == today.year and month <= today.month)

        if is_actual:
            month_data = _build_actual_month(
                session, year, month, account_id,
                total_recurring_income, fixed_expenses_list, goals,
                installment_txs,
                statement_month_by_import_id,
                include_fintoc_internal_transfers=include_fintoc_internal_transfers,
            )
        else:
            month_data = _build_projected_month(
                year, month,
                total_recurring_income, fixed_expenses_list,
                projected_variable, installment_txs, goals,
                statement_month_by_import_id,
                variable_source=variable_source,
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
    fixed_expenses_list: list,
    goals: list,
    installment_txs: list = [],
    statement_month_by_import_id: Optional[Dict[int, str]] = None,
    include_fintoc_internal_transfers: bool = False,
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
    valid_txs = [
        t
        for t in txs
        if include_fintoc_internal_transfers or not _is_fintoc_internal_transfer(t)
    ]

    real_income = sum(_projection_amount(t) for t in valid_txs if t.transaction_type == "income")
    # Use the fixed-expense template (same as projected months).
    # Transactions are rarely tagged is_fixed_expense=True after PDF import, so summing
    # real transactions yields $0.  The template is the authoritative source.
    real_fixed = _calc_fixed_expenses_for_month(
        fixed_expenses_list,
        year,
        month,
    )
    # Use schedule projection for installments (same logic as future months).
    # Real DB transactions only capture imported installments for this month, but many
    # installment series were imported in prior months — their April/current payment would
    # be missing from the query.  The schedule projection correctly sums ALL active
    # installment series regardless of when they were originally imported.
    real_installments = _calc_pending_installments_for_month(
        installment_txs,
        year,
        month,
        statement_month_by_import_id,
    )
    real_variable = sum(
        abs(_projection_amount(t)) for t in valid_txs
        if not t.is_fixed_expense
        and not (t.is_debt or (t.installment_current is not None and t.installment_current > 0))
        and t.transaction_type == "expense"
        and t.is_paid  # exclude cuota-0
    )

    today = date.today()
    is_current_month = year == today.year and month == today.month

    # For the current month, use recurring income as a floor to avoid underestimating
    # salary paid at the very end of month (last business day).
    if is_current_month:
        total_income = max(real_income, total_recurring_income)
    else:
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
    fixed_expenses_list: list,
    avg_variable: float,
    installment_txs: list,
    goals: list,
    statement_month_by_import_id: Optional[Dict[int, str]] = None,
    variable_source: str = "historical_avg",
) -> Dict[str, Any]:
    total_fixed_template = _calc_fixed_expenses_for_month(
        fixed_expenses_list,
        year,
        month,
    )
    pending_installments = _calc_pending_installments_for_month(
        installment_txs,
        year,
        month,
        statement_month_by_import_id,
    )
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
        "variable_expenses_source": variable_source,
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
    statement_month_by_import_id: Optional[Dict[int, str]] = None,
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
        # For cuota 0/N: tx.amount IS the per-installment amount (valor_cuota), not the total.
        # installment_base_amount should be set; fallback uses tx.amount directly for cur=0.
        if tx.installment_base_amount and tx.installment_base_amount > 0:
            inst_amount = tx.installment_base_amount
            if tx.is_international and tx.local_amount is not None:
                inst_amount = abs(tx.local_amount)
        elif tx.installment_current == 0:
            # amount already stores valor_cuota for new-debt rows
            inst_amount = abs(_projection_amount(tx))
        elif tx.installment_total > 0:
            inst_amount = abs(_projection_amount(tx)) / tx.installment_total
        else:
            continue

        anchor = _get_installment_anchor_month(tx, statement_month_by_import_id)
        due_count = _get_installment_due_count_from_anchor(tx)
        if due_count <= 0:
            continue

        diff = _month_diff(anchor, target)
        if 0 <= diff < due_count:
            total += inst_amount

    return round(total, 2)


def _calc_fixed_expenses_for_month(
    fixed_expenses_list: list,
    year: int,
    month: int,
) -> float:
    """Sum active fixed expenses for a target month, honoring remaining installments."""
    target = date(year, month, 1)
    reference = date.today().replace(day=1)

    total = 0.0
    for fixed in fixed_expenses_list:
        if not fixed.is_active:
            continue

        amount_clp = convert_fixed_amount_to_clp(fixed.expected_amount, fixed.currency)
        if amount_clp is None or amount_clp <= 0:
            continue

        if fixed.start_date:
            start_month = date(fixed.start_date.year, fixed.start_date.month, 1)
            if target < start_month:
                continue

        if fixed.remaining_installments is not None:
            if fixed.remaining_installments <= 0:
                continue
            # remaining_installments is interpreted as pending from current month onward.
            # Past months are kept visible in historical projection rows.
            diff_from_now = _month_diff(reference, target)
            if diff_from_now >= fixed.remaining_installments:
                continue

        total += max(float(amount_clp), 0.0)

    return round(total, 2)


def _build_installment_statement_month_map(
    session: Session,
    installment_txs: list,
) -> Dict[int, str]:
    import_ids = sorted({tx.import_file_id for tx in installment_txs if tx.import_file_id})
    if not import_ids:
        return {}

    import_files = session.exec(
        select(ImportFile).where(ImportFile.id.in_(import_ids))
    ).all()
    return {
        import_file.id: import_file.statement_month
        for import_file in import_files
        if import_file.id is not None and import_file.statement_month
    }


def _get_installment_anchor_month(
    tx: Transaction,
    statement_month_by_import_id: Optional[Dict[int, str]] = None,
) -> date:
    statement_month = None
    if statement_month_by_import_id and tx.import_file_id:
        statement_month = statement_month_by_import_id.get(tx.import_file_id)

    if statement_month:
        try:
            year_str, month_str = statement_month.split("-", 1)
            return date(int(year_str), int(month_str), 1)
        except ValueError:
            pass

    start_month = tx.date.month + 1
    start_year = tx.date.year
    if start_month > 12:
        start_month = 1
        start_year += 1
    return date(start_year, start_month, 1)


def _get_installment_due_count_from_anchor(tx: Transaction) -> int:
    if tx.installment_total is None or tx.installment_current is None:
        return 0
    if tx.installment_current == 0:
        return tx.installment_total
    return tx.installment_total - tx.installment_current + 1


def _month_diff(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month)


def _is_fintoc_internal_transfer(tx: Transaction) -> bool:
    if tx.source != "fintoc":
        return False

    if tx.is_transfer or tx.transaction_type == "transfer":
        return True

    description = (tx.description or "").lower()
    keywords = [
        "entre cuentas propias",
        "cuenta propia",
        "traspaso fondos cuenta propia",
        "traspaso de fondos entre cuentas propias",
    ]
    return any(keyword in description for keyword in keywords)


def _calc_recurring_budget_template(session: Session) -> float:
    """Sum recurring budget template excluding fixed-expense-related category overlap."""
    # Find the latest year+month combo with recurring budgets
    all_recurring = session.exec(
        select(Budget).where(Budget.is_recurring == True)
    ).all()
    if not all_recurring:
        return 0.0

    fixed_expenses = session.exec(
        select(FixedExpense).where(FixedExpense.is_active == True)
    ).all()
    fixed_category_ids = {f.category_id for f in fixed_expenses if f.category_id is not None}

    categories = session.exec(select(Category)).all()
    parent_by_id = {c.id: c.parent_id for c in categories if c.id is not None}

    def ancestry(cat_id: Optional[int]) -> set[int]:
        chain: set[int] = set()
        current = cat_id
        while current is not None and current not in chain:
            chain.add(current)
            current = parent_by_id.get(current)
        return chain

    fixed_ancestry_union: set[int] = set()
    for fixed_id in fixed_category_ids:
        fixed_ancestry_union.update(ancestry(fixed_id))

    def overlaps_with_fixed_tree(cat_id: Optional[int]) -> bool:
        if cat_id is None:
            return False
        if cat_id in fixed_ancestry_union:
            return True
        return bool(ancestry(cat_id).intersection(fixed_category_ids))

    latest = max(all_recurring, key=lambda b: (b.year, b.month))
    same_period = [b for b in all_recurring if b.year == latest.year and b.month == latest.month]
    filtered = [b for b in same_period if not overlaps_with_fixed_tree(b.category_id)]
    return round(sum(b.expected_amount for b in filtered), 2)


def _avg_variable_last_3(
    session: Session,
    current_month: int,
    current_year: int,
    account_id: Optional[int] = None,
    include_fintoc_internal_transfers: bool = False,
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
            # Exclude installment-tagged transactions: they are already captured
            # in pending_installments. Including them here would double-count them
            # in the projected variable average.
            Transaction.installment_current.is_(None),
        ]
        if account_id:
            conditions.append(Transaction.account_id == account_id)
        txs = session.exec(select(Transaction).where(and_(*conditions))).all()
        valid_txs = [
            t
            for t in txs
            if include_fintoc_internal_transfers or not _is_fintoc_internal_transfer(t)
        ]
        totals.append(sum(abs(_projection_amount(t)) for t in valid_txs))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return round(sum(totals) / len(totals), 2) if totals else 0.0


def _projection_amount(tx: Transaction) -> float:
    """
    Amount normalized for projection math.
    For international transactions, local_amount stores the CLP equivalent.
    """
    if tx.local_amount is not None and (tx.is_international or tx.original_currency):
        return tx.local_amount
    return tx.amount


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

    # Suggested savings cannot exceed the month's available balance.
    max_total_savings = max_suggested_savings_from_available(available_balance)
    if max_total_savings <= 0 or not suggestions:
        return []

    total_requested = round(sum(s["amount"] for s in suggestions), 0)
    if total_requested <= max_total_savings:
        return suggestions

    remaining = max_total_savings
    capped: List[Dict[str, Any]] = []
    for s in suggestions:
        if remaining <= 0:
            break
        alloc = min(s["amount"], remaining)
        if alloc > 0:
            capped.append({
                **s,
                "amount": alloc,
            })
            remaining -= alloc

    return capped

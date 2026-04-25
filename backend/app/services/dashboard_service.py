"""
Dashboard aggregation service.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from sqlmodel import Session, select, and_
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.category import Category
from app.models.fixed_expense import FixedExpense
from app.models.savings_goal import SavingsGoal


def resolve_analysis_period(
    session: Session,
    month: Optional[int] = None,
    year: Optional[int] = None,
    account_id: Optional[int] = None,
) -> tuple[int, int]:
    """Resolve month/year using latest available movement when caller doesn't provide period."""
    if month and year:
        return month, year

    q = select(Transaction).where(Transaction.status != "ignored").order_by(Transaction.date.desc())
    if account_id:
        q = q.where(Transaction.account_id == account_id)
    latest_tx = session.exec(q).first()
    if latest_tx:
        return latest_tx.date.month, latest_tx.date.year

    now = datetime.now()
    return now.month, now.year


def get_dashboard_summary(session: Session, month: int, year: int, account_id: Optional[int] = None) -> Dict[str, Any]:
    start_date = date(year, month, 1)
    # last day of month
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    # Current month transactions
    conditions = [
        Transaction.date >= start_date,
        Transaction.date < end_date,
        Transaction.status != "ignored",
    ]
    if account_id:
        conditions.append(Transaction.account_id == account_id)

    transactions = session.exec(select(Transaction).where(and_(*conditions))).all()

    income = sum(t.amount for t in transactions if t.transaction_type == "income")
    expenses = sum(abs(t.amount) for t in transactions if t.transaction_type == "expense")
    transfers = sum(t.amount for t in transactions if t.transaction_type == "transfer")
    savings = income - expenses
    savings_pct = round((savings / income * 100) if income > 0 else 0, 1)
    fixed_expenses = sum(abs(t.amount) for t in transactions if t.is_fixed_expense and t.transaction_type == "expense")
    variable_expenses = expenses - fixed_expenses
    ant_expenses = sum(abs(t.amount) for t in transactions if t.is_ant_expense and t.transaction_type == "expense")
    debt_payments = sum(abs(t.amount) for t in transactions if t.is_debt and t.transaction_type == "expense")

    # Total balance across all active accounts
    account_conditions = [Account.is_active == True]
    if account_id:
        account_conditions.append(Account.id == account_id)
    accounts = session.exec(select(Account).where(and_(*account_conditions))).all()
    total_balance = sum(a.balance for a in accounts)

    # Previous month for comparison
    if month == 1:
        prev_month, prev_year = 12, year - 1
    else:
        prev_month, prev_year = month - 1, year

    prev_start = date(prev_year, prev_month, 1)
    if prev_month == 12:
        prev_end = date(prev_year + 1, 1, 1)
    else:
        prev_end = date(prev_year, prev_month + 1, 1)

    prev_conditions = [
        Transaction.date >= prev_start,
        Transaction.date < prev_end,
        Transaction.status != "ignored",
    ]
    if account_id:
        prev_conditions.append(Transaction.account_id == account_id)

    prev_transactions = session.exec(select(Transaction).where(and_(*prev_conditions))).all()
    prev_income = sum(t.amount for t in prev_transactions if t.transaction_type == "income")
    prev_expenses = sum(abs(t.amount) for t in prev_transactions if t.transaction_type == "expense")

    # Category breakdown
    category_breakdown = _get_category_breakdown(session, transactions)

    # Monthly trend (last 6 months)
    monthly_trend = _get_monthly_trend(session, month, year, months=6, account_id=account_id)

    # Top expenses
    top_expenses = _get_top_expenses(session, start_date, end_date, limit=10, account_id=account_id)

    # Savings goals
    goals = session.exec(select(SavingsGoal).where(SavingsGoal.status == "active")).all()
    goals_summary = [
        {
            "id": g.id,
            "name": g.name,
            "target_amount": g.target_amount,
            "current_amount": g.current_amount,
            "progress_percent": round((g.current_amount / g.target_amount * 100) if g.target_amount > 0 else 0, 1),
        }
        for g in goals
    ]

    goals_monthly_required = _calc_goals_monthly_required(goals)
    avg_variable_3m = _avg_variable_expenses_last_n_months(session, month, year, 3, account_id=account_id)
    active_fixed_template = _fixed_expenses_template(session, account_id=account_id)
    projected_debt_payments = _avg_debt_payments_last_n_months(session, month, year, 3, account_id=account_id)
    projected_month_expenses = round(active_fixed_template + avg_variable_3m, 2)
    projected_month_savings = round(income - projected_month_expenses, 2)
    recommended_monthly_saving = round(max(income * 0.20, goals_monthly_required), 2) if income > 0 else round(goals_monthly_required, 2)
    savings_gap_to_target = round(max(recommended_monthly_saving - max(savings, 0), 0), 2)
    suggested_expense_reductions = _build_savings_recommendations(category_breakdown, ant_expenses)
    potential_monthly_savings = round(sum(item["suggested_cut_amount"] for item in suggested_expense_reductions), 2)

    if savings_pct >= 20:
        health = "healthy"
    elif savings_pct >= 10:
        health = "watch"
    else:
        health = "risk"

    return {
        "period": {"month": month, "year": year},
        "current_date": date.today().isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "total_balance": total_balance,
        "net_worth": total_balance,
        "income": income,
        "expenses": expenses,
        "savings": savings,
        "savings_percent": savings_pct,
        "fixed_expenses": fixed_expenses,
        "variable_expenses": variable_expenses,
        "ant_expenses": ant_expenses,
        "debt_payments": debt_payments,
        "projected_debt_payments": projected_debt_payments,
        "prev_income": prev_income,
        "prev_expenses": prev_expenses,
        "income_change_pct": _change_pct(income, prev_income),
        "expenses_change_pct": _change_pct(expenses, prev_expenses),
        "accounts_count": len(accounts),
        "accounts": [{"id": a.id, "name": a.name, "balance": a.balance, "currency": a.currency, "account_type": a.account_type} for a in accounts],
        "category_breakdown": category_breakdown,
        "monthly_trend": monthly_trend,
        "top_expenses": top_expenses,
        "savings_goals": goals_summary,
        "transaction_count": len(transactions),
        "projected_month_expenses": projected_month_expenses,
        "projected_month_savings": projected_month_savings,
        "recommended_monthly_saving": recommended_monthly_saving,
        "goals_monthly_required": round(goals_monthly_required, 2),
        "savings_gap_to_target": savings_gap_to_target,
        "potential_monthly_savings": potential_monthly_savings,
        "suggested_expense_reductions": suggested_expense_reductions,
        "financial_health_status": health,
    }


def _change_pct(current: float, previous: float) -> Optional[float]:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def _get_category_breakdown(session: Session, transactions: list) -> List[Dict]:
    category_totals: Dict[int, float] = {}
    for t in transactions:
        if t.transaction_type == "expense" and t.category_id:
            category_totals[t.category_id] = category_totals.get(t.category_id, 0) + abs(t.amount)

    if not category_totals:
        return []

    categories = session.exec(select(Category)).all()
    cat_map = {c.id: c for c in categories}

    result = []
    for cat_id, total in sorted(category_totals.items(), key=lambda x: -x[1]):
        cat = cat_map.get(cat_id)
        if cat:
            result.append({
                "category_id": cat_id,
                "category_name": cat.name,
                "color": cat.color or "#607D8B",
                "amount": round(total, 0),
            })
    return result


def _get_monthly_trend(
    session: Session,
    current_month: int,
    current_year: int,
    months: int = 6,
    account_id: Optional[int] = None,
) -> List[Dict]:
    result = []
    m, y = current_month, current_year
    for _ in range(months):
        start = date(y, m, 1)
        if m == 12:
            end = date(y + 1, 1, 1)
        else:
            end = date(y, m + 1, 1)

        conditions = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status != "ignored",
        ]
        if account_id:
            conditions.append(Transaction.account_id == account_id)

        txs = session.exec(select(Transaction).where(and_(*conditions))).all()

        inc = sum(t.amount for t in txs if t.transaction_type == "income")
        exp = sum(abs(t.amount) for t in txs if t.transaction_type == "expense")

        result.append({"month": m, "year": y, "label": f"{m}/{y}", "income": round(inc, 0), "expenses": round(exp, 0)})

        m -= 1
        if m == 0:
            m = 12
            y -= 1

    result.reverse()
    return result


def _get_top_expenses(
    session: Session,
    start_date: date,
    end_date: date,
    limit: int = 10,
    account_id: Optional[int] = None,
) -> List[Dict]:
    conditions = [
        Transaction.date >= start_date,
        Transaction.date < end_date,
        Transaction.transaction_type == "expense",
        Transaction.status != "ignored",
    ]
    if account_id:
        conditions.append(Transaction.account_id == account_id)

    transactions = session.exec(select(Transaction).where(and_(*conditions)).order_by(Transaction.amount)).all()

    categories = {c.id: c for c in session.exec(select(Category)).all()}

    result = []
    for t in transactions[:limit]:
        cat = categories.get(t.category_id) if t.category_id else None
        result.append({
            "id": t.id,
            "date": str(t.date),
            "description": t.description,
            "amount": abs(t.amount),
            "category_name": cat.name if cat else "Sin categoría",
            "category_color": (cat.color or "#607D8B") if cat else "#607D8B",
        })

    return result


def _avg_variable_expenses_last_n_months(
    session: Session,
    current_month: int,
    current_year: int,
    months: int = 3,
    account_id: Optional[int] = None,
) -> float:
    totals: List[float] = []
    m, y = current_month, current_year
    for _ in range(months):
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        conditions = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.transaction_type == "expense",
            Transaction.status != "ignored",
            Transaction.is_fixed_expense == False,
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


def _fixed_expenses_template(session: Session, account_id: Optional[int] = None) -> float:
    q = select(FixedExpense).where(FixedExpense.is_active == True)
    if account_id:
        q = q.where(FixedExpense.account_id == account_id)
    items = session.exec(q).all()
    return round(sum(max(i.expected_amount, 0) for i in items), 2)


def _avg_debt_payments_last_n_months(
    session: Session,
    current_month: int,
    current_year: int,
    months: int = 3,
    account_id: Optional[int] = None,
) -> float:
    totals: List[float] = []
    m, y = current_month, current_year
    for _ in range(months):
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        conditions = [
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.transaction_type == "expense",
            Transaction.status != "ignored",
            Transaction.is_debt == True,
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


def _build_savings_recommendations(category_breakdown: List[Dict], ant_expenses: float) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    high_opportunity_categories = {
        "Suscripciones": (0.20, "Revisar planes duplicados o poco usados."),
        "Ocio": (0.15, "Reducir salidas y paseos de alto costo este mes."),
        "Compras": (0.15, "Pausar compras no esenciales o escalonarlas."),
        "Alimentación": (0.10, "Mover delivery/restaurantes hacia supermercado o menu planificado."),
        "Transporte": (0.10, "Optimizar uso de bencina, viajes y trayectos."),
        "Créditos": (0.08, "Refinanciar o adelantar cuotas caras si hay caja disponible."),
    }

    if ant_expenses > 0:
        recommendations.append({
            "category_name": "Gastos hormiga",
            "current_amount": round(ant_expenses, 2),
            "suggested_cut_amount": round(ant_expenses * 0.5, 2),
            "reason": "Reduciendo a la mitad los gastos pequenos recurrentes puedes liberar ahorro rapido.",
        })

    for item in category_breakdown:
        category_name = item.get("category_name")
        if category_name not in high_opportunity_categories:
            continue
        reduction_pct, reason = high_opportunity_categories[category_name]
        current_amount = float(item.get("amount", 0))
        if current_amount <= 0:
            continue
        recommendations.append({
            "category_name": category_name,
            "current_amount": current_amount,
            "suggested_cut_amount": round(current_amount * reduction_pct, 2),
            "reason": reason,
        })

    recommendations.sort(key=lambda x: x["suggested_cut_amount"], reverse=True)
    return recommendations[:5]


def _calc_goals_monthly_required(goals: List[SavingsGoal]) -> float:
    today = date.today()
    total_required = 0.0
    for g in goals:
        if g.status != "active":
            continue
        remaining = max(g.target_amount - g.current_amount, 0)
        if remaining == 0:
            continue
        if g.target_date and g.target_date > today:
            months_left = max((g.target_date.year - today.year) * 12 + (g.target_date.month - today.month), 1)
            total_required += remaining / months_left
        else:
            total_required += remaining * 0.05
    return total_required

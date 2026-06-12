"""Dashboard aggregation service.

Provides ``get_dashboard_summary``, which builds the full dashboard payload for
a given month/year and optional account filter.  Also exposes
``resolve_analysis_period`` to pick the best default period when one is not
supplied by the caller.

Architecture notes:
    - All monetary values are in CLP.
    - UF-denominated fixed expenses are converted to CLP at runtime via
        ``convert_fixed_amount_to_clp`` (uses the mindicador.cl cached rate).
    - ``_month_date_range`` centralises the ``[first_day, first_day_of_next_month)``
        half-open interval used throughout the service for monthly queries.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlmodel import Session, select, and_
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.category import Category
from app.models.fixed_expense import FixedExpense
from app.models.recurring_income import RecurringIncome
from app.models.savings_goal import SavingsGoal
from app.services.currency_service import convert_fixed_amount_to_clp
from app.services.credit_card_service import compute_credit_card_metrics
from app.models.budget import Budget
from app.services.projection_service import project_annual_balance


LIQUID_ACCOUNT_TYPES = {"corriente", "vista", "ahorro", "efectivo"}
INVESTMENT_ACCOUNT_TYPES = {"inversion"}
DEBT_ACCOUNT_TYPES = {"tarjeta_credito"}


def _month_date_range(year: int, month: int) -> tuple[date, date]:
    """Return the half-open date interval ``[month_start, next_month_start)`` for *year*/*month*.

    Using a half-open interval (``date >= start`` and ``date < end``) with the
    first day of the following month as the upper bound avoids off-by-one errors
    when filtering transactions that fall on the last day of any month.
    """
    month_start = date(year, month, 1)
    if month == 12:
        month_end_exclusive = date(year + 1, 1, 1)
    else:
        month_end_exclusive = date(year, month + 1, 1)
    return month_start, month_end_exclusive


def resolve_analysis_period(
    session: Session,
    month: Optional[int] = None,
    year: Optional[int] = None,
    account_id: Optional[int] = None,
) -> tuple[int, int]:
    """Resolve month/year using latest available movement when caller doesn't provide period."""
    if month and year:
        return month, year

    today = date.today()
    q = select(Transaction).where(Transaction.status != "ignored").order_by(Transaction.date.desc())
    if account_id:
        q = q.where(Transaction.account_id == account_id)
    latest_tx = session.exec(q).first()
    if latest_tx:
        if latest_tx.date > today:
            # Imported statements can include future-dated movements; default analysis should stay in current period.
            return today.month, today.year
        return latest_tx.date.month, latest_tx.date.year

    return today.month, today.year


def get_dashboard_summary(session: Session, month: int, year: int, account_id: Optional[int] = None) -> Dict[str, Any]:
    start_date, end_date = _month_date_range(year, month)

    # Current month transactions
    conditions = [
        Transaction.date >= start_date,
        Transaction.date < end_date,
        Transaction.status != "ignored",
    ]
    if account_id:
        conditions.append(Transaction.account_id == account_id)

    transactions = session.exec(select(Transaction).where(and_(*conditions))).all()

    tx_income = sum(t.amount for t in transactions if t.transaction_type == "income")
    recurring_income_template = _recurring_income_template(session, account_id=account_id)
    today = date.today()
    # For analysis, prioritize realized income from transactions when available.
    # Use recurring template only as a fallback when there are no recorded income movements.
    income = tx_income if tx_income > 0 else recurring_income_template
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
    cc_metrics_by_account: Dict[int, Dict[str, float]] = {}
    for account in accounts:
        if (account.account_type or "") in DEBT_ACCOUNT_TYPES:
            cc_metrics_by_account[account.id] = compute_credit_card_metrics(session, account.id)

    balance_snapshot = _build_balance_snapshot(accounts, cc_metrics_by_account)
    total_balance = balance_snapshot["total_assets"]

    accounts_summary = []
    credit_card_total_limit = 0.0
    credit_card_used_amount = 0.0
    credit_card_available_amount = 0.0
    for account in accounts:
        row = {
            "id": account.id,
            "name": account.name,
            "balance": float(account.balance or 0),
            "currency": account.currency,
            "account_type": account.account_type,
        }
        if (account.account_type or "") in DEBT_ACCOUNT_TYPES:
            metrics = cc_metrics_by_account.get(account.id) or {
                "computed_balance": 0.0,
                "future_installments_commitment": 0.0,
            }
            credit_limit = float(metrics.get("statement_credit_limit") or account.balance or 0)
            used_amount = abs(min(float(metrics.get("computed_balance", 0.0)), 0))
            available_from_statement = metrics.get("statement_available_credit")
            available_amount = float(available_from_statement) if available_from_statement is not None else (credit_limit - used_amount)
            row["computed_balance"] = float(metrics.get("computed_balance", 0.0))
            row["credit_limit"] = credit_limit
            row["available_credit"] = available_amount
            row["future_installments_commitment"] = float(metrics.get("future_installments_commitment", 0.0))
            credit_card_total_limit += credit_limit
            credit_card_used_amount += used_amount
            credit_card_available_amount += available_amount

        accounts_summary.append(row)

    # Previous month for comparison
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    prev_start, prev_end = _month_date_range(prev_year, prev_month)

    prev_conditions = [
        Transaction.date >= prev_start,
        Transaction.date < prev_end,
        Transaction.status != "ignored",
    ]
    if account_id:
        prev_conditions.append(Transaction.account_id == account_id)

    prev_transactions = session.exec(select(Transaction).where(and_(*prev_conditions))).all()
    prev_tx_income = sum(t.amount for t in prev_transactions if t.transaction_type == "income")
    prev_income = prev_tx_income if prev_tx_income > 0 else recurring_income_template
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
    mortgage_remaining_debt = _fixed_expenses_remaining_debt(session, account_id=account_id, expense_type="dividendo")
    fixed_installment_debt = _fixed_expenses_remaining_debt(session, account_id=account_id, exclude_expense_types={"dividendo"})
    projected_debt_payments = _avg_debt_payments_last_n_months(session, month, year, 3, account_id=account_id)
    total_debt_exposure = round(balance_snapshot["short_term_debt"] + fixed_installment_debt, 2)
    recurring_budget_total = _recurring_budget_template(session)
    projected_variable = recurring_budget_total if recurring_budget_total > 0 else avg_variable_3m
    projected_month_expenses = round(active_fixed_template + projected_variable, 2)
    projected_month_savings = round(income - projected_month_expenses, 2)
    is_past_month = (year < today.year) or (year == today.year and month < today.month)
    effective_expenses = round(expenses if is_past_month else max(expenses, projected_month_expenses), 2)
    effective_savings = round(income - effective_expenses, 2)
    effective_savings_pct = round((effective_savings / income * 100) if income > 0 else 0, 1)
    recommended_monthly_saving = round(max(income * 0.20, goals_monthly_required), 2) if income > 0 else round(goals_monthly_required, 2)
    savings_gap_to_target = round(max(recommended_monthly_saving - max(effective_savings, 0), 0), 2)
    suggested_expense_reductions = _build_savings_recommendations(category_breakdown, ant_expenses)
    potential_monthly_savings = round(sum(item["suggested_cut_amount"] for item in suggested_expense_reductions), 2)
    short_term_projection = _build_short_term_cashflow_projection(session, account_id=account_id)

    health_metrics = _build_financial_health_metrics(
        savings_pct=effective_savings_pct,
        liquid_assets=balance_snapshot["liquid_assets"],
        short_term_debt=total_debt_exposure,
        projected_month_expenses=projected_month_expenses,
        next_30_net_balance=float(short_term_projection.get("next_30_days", {}).get("projected_net_balance", 0)),
        next_30_income=float(short_term_projection.get("next_30_days", {}).get("projected_income", 0)),
    )
    dashboard_insights = _build_dashboard_insights(
        health_score=health_metrics["score"],
        health_status=health_metrics["status"],
        next_30_projection=short_term_projection.get("next_30_days", {}),
        liquid_assets=balance_snapshot["liquid_assets"],
        projected_month_expenses=projected_month_expenses,
        projected_debt_payments=projected_debt_payments,
        fixed_installment_debt=fixed_installment_debt,
        mortgage_remaining_debt=mortgage_remaining_debt,
        income=income,
        savings_gap_to_target=savings_gap_to_target,
        potential_monthly_savings=potential_monthly_savings,
        suggested_expense_reductions=suggested_expense_reductions,
        goals_monthly_required=goals_monthly_required,
        recommended_monthly_saving=recommended_monthly_saving,
    )

    return {
        "period": {"month": month, "year": year},
        "current_date": date.today().isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "total_balance": total_balance,
        "net_worth": balance_snapshot["net_worth"],
        "total_assets": balance_snapshot["total_assets"],
        "liquid_assets": balance_snapshot["liquid_assets"],
        "savings_assets": balance_snapshot["savings_assets"],
        "investment_assets": balance_snapshot["investment_assets"],
        "short_term_debt": balance_snapshot["short_term_debt"],
        "mortgage_remaining_debt": mortgage_remaining_debt,
        "fixed_installment_debt": fixed_installment_debt,
        "total_debt_exposure": total_debt_exposure,
        "income": income,
        "income_from_transactions": tx_income,
        "recurring_income_template": recurring_income_template,
        "expenses": expenses,
        "savings": savings,
        "savings_percent": savings_pct,
        "effective_expenses": effective_expenses,
        "effective_savings": effective_savings,
        "effective_savings_percent": effective_savings_pct,
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
        "accounts": accounts_summary,
        "credit_card_total_limit": round(credit_card_total_limit, 2),
        "credit_card_used_amount": round(credit_card_used_amount, 2),
        "credit_card_available_amount": round(credit_card_available_amount, 2),
        "category_breakdown": category_breakdown,
        "monthly_trend": monthly_trend,
        "top_expenses": top_expenses,
        "savings_goals": goals_summary,
        "transaction_count": len(transactions),
        "projected_month_expenses": projected_month_expenses,
        "projected_month_savings": projected_month_savings,
        "cashflow_projection": short_term_projection,
        "recommended_monthly_saving": recommended_monthly_saving,
        "goals_monthly_required": round(goals_monthly_required, 2),
        "savings_gap_to_target": savings_gap_to_target,
        "potential_monthly_savings": potential_monthly_savings,
        "suggested_expense_reductions": suggested_expense_reductions,
        "dashboard_insights": dashboard_insights,
        "financial_health_score": health_metrics["score"],
        "financial_health_status": health_metrics["status"],
        "financial_health_breakdown": health_metrics["breakdown"],
    }


def _recurring_income_template(session: Session, account_id: Optional[int] = None) -> float:
    """Return the sum of all active recurring income amounts as the expected monthly income template."""
    query = select(RecurringIncome).where(RecurringIncome.is_active == True)
    if account_id:
        query = query.where(RecurringIncome.account_id == account_id)
    recurring_incomes = session.exec(query).all()
    return round(sum(max(float(ri.amount or 0), 0) for ri in recurring_incomes), 2)


def _build_balance_snapshot(
    accounts: List[Account],
    cc_metrics_by_account: Optional[Dict[int, Dict[str, float]]] = None,
) -> Dict[str, float]:
    """Classify active account balances into asset and debt buckets.

    Credit-card accounts are treated as short-term debt using the
    ``computed_balance`` from ``compute_credit_card_metrics`` (which includes
    unfactured 0/N installments), rather than the nominal ``balance`` field.

    Returns a dict with keys: ``total_assets``, ``liquid_assets``,
    ``savings_assets``, ``investment_assets``, ``short_term_debt``, ``net_worth``.
    """
    liquid_assets = 0.0
    savings_assets = 0.0
    investment_assets = 0.0
    short_term_debt = 0.0
    other_assets = 0.0

    for account in accounts:
        balance = float(account.balance or 0)
        account_type = account.account_type or ""

        if account_type in DEBT_ACCOUNT_TYPES:
            # Include commitment from unfactured 0/N installments when computing debt.
            cc_balance = float((cc_metrics_by_account or {}).get(account.id, {}).get("computed_balance", 0.0))
            # cc_balance is negative when in debt (expenses > payments)
            short_term_debt += abs(min(cc_balance, 0))
            continue

        positive_balance = max(balance, 0)
        if account_type in INVESTMENT_ACCOUNT_TYPES:
            investment_assets += positive_balance
        elif account_type == "ahorro":
            liquid_assets += positive_balance
            savings_assets += positive_balance
        elif account_type in LIQUID_ACCOUNT_TYPES:
            liquid_assets += positive_balance
        else:
            other_assets += positive_balance

    total_assets = liquid_assets + investment_assets + other_assets
    net_worth = total_assets - short_term_debt

    return {
        "total_assets": round(total_assets, 2),
        "liquid_assets": round(liquid_assets, 2),
        "savings_assets": round(savings_assets, 2),
        "investment_assets": round(investment_assets, 2),
        "short_term_debt": round(short_term_debt, 2),
        "net_worth": round(net_worth, 2),
    }


def _build_financial_health_metrics(
    savings_pct: float,
    liquid_assets: float,
    short_term_debt: float,
    projected_month_expenses: float,
    next_30_net_balance: float,
    next_30_income: float,
) -> Dict[str, Any]:
    """Compute a 0-100 financial health score from four weighted sub-scores.

    Sub-scores and weights:
      - savings_rate (35 %): effective savings as % of income
      - liquidity_buffer (25 %): months of expenses covered by liquid assets
      - debt_pressure (20 %): short-term debt relative to liquid assets
      - short_term_cashflow (20 %): projected 30-day net balance relative to income

    Returns a dict with keys: ``score`` (int), ``status``
    (``"healthy"`` / ``"watch"`` / ``"risk"``), ``breakdown`` (scoring details).
    """
    normalized_savings_pct = max(min(savings_pct, 100), -100)
    liquidity_months = liquid_assets / projected_month_expenses if projected_month_expenses > 0 else 0
    debt_to_liquidity = short_term_debt / liquid_assets if liquid_assets > 0 else (1.5 if short_term_debt > 0 else 0)
    near_term_cashflow_ratio = next_30_net_balance / next_30_income if next_30_income > 0 else 0

    savings_score = _score_by_thresholds(
        normalized_savings_pct,
        [(20, 100), (10, 75), (0, 50)],
        default=20,
    )
    liquidity_score = _score_by_thresholds(
        liquidity_months,
        [(6, 100), (3, 80), (1, 55)],
        default=25,
    )
    debt_score = _reverse_score_by_thresholds(
        debt_to_liquidity,
        [(0.2, 100), (0.5, 75), (1.0, 50)],
        default=20,
    )
    cashflow_score = _score_by_thresholds(
        near_term_cashflow_ratio,
        [(0.15, 100), (0.0, 75), (-0.1, 45)],
        default=20,
    )

    score = round(
        savings_score * 0.35
        + liquidity_score * 0.25
        + debt_score * 0.20
        + cashflow_score * 0.20
    )

    if score >= 80:
        status = "healthy"
    elif score >= 55:
        status = "watch"
    else:
        status = "risk"

    breakdown = [
        {
            "key": "savings_rate",
            "label": "Tasa de ahorro",
            "score": savings_score,
            "value": round(normalized_savings_pct, 1),
            "context": f"{round(normalized_savings_pct, 1)}% del ingreso",
        },
        {
            "key": "liquidity_buffer",
            "label": "Colchon de liquidez",
            "score": liquidity_score,
            "value": round(liquidity_months, 1),
            "context": f"{round(liquidity_months, 1)} meses de gastos cubiertos",
        },
        {
            "key": "debt_pressure",
            "label": "Presion de deuda",
            "score": debt_score,
            "value": round(debt_to_liquidity, 2),
            "context": f"Deuda corta / liquidez: {round(debt_to_liquidity, 2)}x",
        },
        {
            "key": "short_term_cashflow",
            "label": "Caja 30 dias",
            "score": cashflow_score,
            "value": round(next_30_net_balance, 0),
            "context": f"Neto proyectado: ${next_30_net_balance:,.0f}",
        },
    ]

    return {"score": score, "status": status, "breakdown": breakdown}


def _score_by_thresholds(value: float, thresholds: List[tuple[float, int]], default: int) -> int:
    for minimum, score in thresholds:
        if value >= minimum:
            return score
    return default


def _reverse_score_by_thresholds(value: float, thresholds: List[tuple[float, int]], default: int) -> int:
    for maximum, score in thresholds:
        if value <= maximum:
            return score
    return default


def _build_dashboard_insights(
    health_score: int,
    health_status: str,
    next_30_projection: Dict[str, Any],
    liquid_assets: float,
    projected_month_expenses: float,
    projected_debt_payments: float,
    fixed_installment_debt: float,
    mortgage_remaining_debt: float,
    income: float,
    savings_gap_to_target: float,
    potential_monthly_savings: float,
    suggested_expense_reductions: List[Dict[str, Any]],
    goals_monthly_required: float,
    recommended_monthly_saving: float,
) -> List[Dict[str, Any]]:
    """Build a prioritised list of up to 4 actionable insight cards for the dashboard.

    Each card contains: ``severity`` (``"success"`` / ``"info"`` / ``"warning"``),
    ``title``, ``message``, and ``action``.  Cards are ordered from most urgent
    to least urgent.  A generic "all good" card is returned when no issues are
    detected.
    """
    insights: List[Dict[str, Any]] = []
    next_30_net = float(next_30_projection.get("projected_net_balance", 0) or 0)
    next_30_end = next_30_projection.get("end_date")
    liquidity_months = liquid_assets / projected_month_expenses if projected_month_expenses > 0 else 0

    if next_30_net < 0:
        insights.append({
            "severity": "warning",
            "title": "Caja ajustada en 30 dias",
            "message": f"Si no cambias el ritmo actual, te faltarian ${abs(next_30_net):,.0f} antes del {next_30_end}.",
            "action": "Reduce gasto variable o posterga ahorro discrecional este mes.",
        })

    if savings_gap_to_target > 0:
        insights.append({
            "severity": "info",
            "title": "Brecha contra tu meta de ahorro",
            "message": f"Hoy estas ${savings_gap_to_target:,.0f} por debajo del ahorro recomendado mensual (${recommended_monthly_saving:,.0f}).",
            "action": "Usa esta brecha como monto objetivo para ajustar categorias recortables.",
        })

    if suggested_expense_reductions:
        top_cut = suggested_expense_reductions[0]
        insights.append({
            "severity": "success" if potential_monthly_savings >= max(savings_gap_to_target, 1) else "info",
            "title": "Mejor oportunidad inmediata",
            "message": f"{top_cut['category_name']} podria liberar ~${top_cut['suggested_cut_amount']:,.0f} al mes.",
            "action": top_cut.get("reason") or "Revisa esa categoria para recuperar caja rapido.",
        })

    if liquidity_months < 3:
        insights.append({
            "severity": "warning",
            "title": "Colchon de liquidez bajo",
            "message": f"Tu liquidez cubre {liquidity_months:.1f} meses de gasto proyectado.",
            "action": "Prioriza fondo de emergencia antes de asumir nuevas deudas o inversiones agresivas.",
        })

    if projected_debt_payments > 0 and income > 0 and projected_debt_payments / income > 0.25:
        insights.append({
            "severity": "warning",
            "title": "Presion relevante de deuda",
            "message": f"Los pagos de deuda proyectados consumen {projected_debt_payments / income * 100:.1f}% de tus ingresos del periodo.",
            "action": "Evalua prepago o refinanciamiento para recuperar holgura mensual.",
        })

    if fixed_installment_debt > 0:
        insights.append({
            "severity": "info",
            "title": "Deuda remanente en gastos fijos",
            "message": f"Tienes ${fixed_installment_debt:,.0f} comprometidos en cuotas dinamicas de gastos fijos.",
            "action": "Monitorea cuando terminen cuotas para redirigir ese flujo a ahorro o inversion.",
        })

    if mortgage_remaining_debt > 0:
        insights.append({
            "severity": "info",
            "title": "Hipoteca separada del corto plazo",
            "message": f"Mantienes ${mortgage_remaining_debt:,.0f} de deuda hipotecaria remanente, tratada aparte de la presion de caja de corto plazo.",
            "action": "Usa este saldo para seguimiento patrimonial y compara refinanciamiento solo si mejora tu flujo mensual.",
        })

    if not insights:
        insights.append({
            "severity": "success" if health_status == "healthy" else "info",
            "title": "Panorama controlado",
            "message": f"Tu score actual es {health_score}/100 y no se detectan desbalances urgentes en caja o deuda.",
            "action": f"Manten o automatiza un ahorro mensual cercano a ${max(goals_monthly_required, recommended_monthly_saving):,.0f}.",
        })

    return insights[:4]


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
        start, end = _month_date_range(y, m)
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
    """Return the average monthly variable-expense total over the last *months* months.

    Only non-fixed expense transactions are included.  Months with no matching
    transactions still count as 0, so the average naturally reflects quiet periods
    rather than over-extrapolating from sparse data.
    """
    totals: List[float] = []
    m, y = current_month, current_year
    for _ in range(months):
        start, end = _month_date_range(y, m)
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
    """Return the expected monthly total of all active fixed expenses converted to CLP."""
    q = select(FixedExpense).where(FixedExpense.is_active == True)
    if account_id:
        q = q.where(FixedExpense.account_id == account_id)
    items = session.exec(q).all()
    return round(sum(max(convert_fixed_amount_to_clp(i.expected_amount, i.currency) or 0, 0) for i in items), 2)


def _recurring_budget_template(session: Session) -> float:
    """Sum expected_amount of recurring budgets from the most recent period that has them."""
    all_recurring = session.exec(select(Budget).where(Budget.is_recurring == True)).all()
    if not all_recurring:
        return 0.0
    latest = max(all_recurring, key=lambda b: (b.year, b.month))
    same_period = [b for b in all_recurring if b.year == latest.year and b.month == latest.month]
    return round(sum(b.expected_amount for b in same_period), 2)


def _fixed_expenses_remaining_debt(
    session: Session,
    account_id: Optional[int] = None,
    expense_type: Optional[str] = None,
    exclude_expense_types: Optional[set[str]] = None,
) -> float:
    """Return the total remaining debt committed by active instalment fixed expenses.

    Computes ``sum(clp_amount * remaining_installments)`` for each matching row,
    giving the total CLP outflow still pending across all remaining installments.
    """
    q = select(FixedExpense).where(
        FixedExpense.is_active == True,
        FixedExpense.remaining_installments.is_not(None),
        FixedExpense.remaining_installments > 0,
    )
    if account_id:
        q = q.where(FixedExpense.account_id == account_id)
    if expense_type:
        q = q.where(FixedExpense.expense_type == expense_type)
    items = session.exec(q).all()
    if exclude_expense_types:
        items = [item for item in items if item.expense_type not in exclude_expense_types]
    return round(
        sum(
            max(convert_fixed_amount_to_clp(i.expected_amount, i.currency) or 0, 0)
            * max(i.remaining_installments or 0, 0)
            for i in items
        ),
        2,
    )


def _avg_debt_payments_last_n_months(
    session: Session,
    current_month: int,
    current_year: int,
    months: int = 3,
    account_id: Optional[int] = None,
) -> float:
    """Return the average monthly debt-payment total over the last *months* months.

    Includes only transactions flagged ``is_debt=True``.
    """
    totals: List[float] = []
    m, y = current_month, current_year
    for _ in range(months):
        start, end = _month_date_range(y, m)
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
    """Return the minimum monthly saving needed to reach all active savings goals on time.

    For goals with a future target date, the required monthly saving is
    ``remaining / months_left``.  Goals that are overdue or have no target date
    contribute 5 % of their remaining balance per month as a soft nudge.
    """
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


def _build_short_term_cashflow_projection(
    session: Session,
    account_id: Optional[int] = None,
) -> Dict[str, Dict[str, float | str | int]]:
    """Project cash flow for the next 30 and 90 days from today.

    Calls ``project_annual_balance`` for each calendar year that overlaps the
    window and pro-rates each month's totals by the fraction of days inside the
    window.  Results are keyed ``"next_30_days"`` and ``"next_90_days"``.
    """
    today = date.today()
    windows = [30, 90]
    year_cache: Dict[int, List[Dict[str, Any]]] = {}
    results: Dict[str, Dict[str, float | str | int]] = {}

    for window_days in windows:
        start = today
        end = today + timedelta(days=window_days - 1)
        aggregated = {
            "income": 0.0,
            "expenses": 0.0,
            "suggested_savings": 0.0,
            "net_balance": 0.0,
        }

        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            if cursor.year not in year_cache:
                year_cache[cursor.year] = project_annual_balance(session, cursor.year, account_id=account_id)

            month_data = next((item for item in year_cache[cursor.year] if item["month"] == cursor.month), None)
            if month_data is None:
                cursor = _next_month(cursor)
                continue

            month_start = date(cursor.year, cursor.month, 1)
            month_end = date(cursor.year, cursor.month, monthrange(cursor.year, cursor.month)[1])
            overlap_start = max(start, month_start)
            overlap_end = min(end, month_end)

            if overlap_start <= overlap_end:
                overlap_days = (overlap_end - overlap_start).days + 1
                month_days = (month_end - month_start).days + 1
                ratio = overlap_days / month_days

                aggregated["income"] += month_data["total_income"] * ratio
                aggregated["expenses"] += month_data["total_expenses"] * ratio
                aggregated["suggested_savings"] += month_data["total_suggested_savings"] * ratio
                aggregated["net_balance"] += month_data["net_balance"] * ratio

            cursor = _next_month(cursor)

        key = f"next_{window_days}_days"
        results[key] = {
            "days": window_days,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "projected_income": round(aggregated["income"], 0),
            "projected_expenses": round(aggregated["expenses"], 0),
            "projected_savings": round(aggregated["suggested_savings"], 0),
            "projected_net_balance": round(aggregated["net_balance"], 0),
        }

    return results


def _next_month(base: date) -> date:
    if base.month == 12:
        return date(base.year + 1, 1, 1)
    return date(base.year, base.month + 1, 1)

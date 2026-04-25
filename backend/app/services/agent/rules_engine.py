"""
Rules-based financial analysis engine.
Runs locally without any external API.
"""
from typing import Any, Dict, List
from datetime import date
from collections import defaultdict


def run_rules_analysis(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Applies rule-based analysis to financial data.
    Returns structured findings and alerts.
    """
    findings = []
    alerts = []

    income = data.get("income", 0)
    expenses = data.get("expenses", 0)
    savings = income - expenses
    ant_expenses = data.get("ant_expenses", 0)
    fixed_expenses = data.get("fixed_expenses", 0)
    category_breakdown = data.get("category_breakdown", [])
    prev_income = data.get("prev_income", 0)
    prev_expenses = data.get("prev_expenses", 0)
    projected_debt_payments = data.get("projected_debt_payments", 0)
    suggested_expense_reductions = data.get("suggested_expense_reductions", [])
    potential_monthly_savings = data.get("potential_monthly_savings", 0)

    # --- Rule 1: Savings rate ---
    if income > 0:
        savings_pct = savings / income * 100
        if savings_pct < 0:
            alerts.append({"severity": "danger", "rule": "negative_savings", "message": "⚠️ Tus gastos superan tus ingresos este mes."})
        elif savings_pct < 10:
            alerts.append({"severity": "warning", "rule": "low_savings", "message": f"📉 Tasa de ahorro baja: {savings_pct:.1f}%. Se recomienda al menos 10-20%."})
        elif savings_pct >= 20:
            findings.append({"type": "positive", "rule": "good_savings", "message": f"✅ Excelente tasa de ahorro: {savings_pct:.1f}%."})

    # --- Rule 2: Ant expenses ---
    if ant_expenses > 0 and income > 0:
        ant_pct = ant_expenses / income * 100
        if ant_pct > 5:
            findings.append({
                "type": "warning",
                "rule": "ant_expenses",
                "message": f"🐜 Gastos hormiga: ${ant_expenses:,.0f} ({ant_pct:.1f}% de ingresos). Reducirlos a la mitad te ahorraría ${ant_expenses/2:,.0f}.",
            })

    # --- Rule 3: Expenses vs previous month ---
    if prev_expenses > 0:
        exp_change_pct = (expenses - prev_expenses) / prev_expenses * 100
        if exp_change_pct > 20:
            findings.append({
                "type": "warning",
                "rule": "expenses_increase",
                "message": f"📈 Tus gastos aumentaron {exp_change_pct:.1f}% respecto al mes anterior.",
            })
        elif exp_change_pct < -10:
            findings.append({
                "type": "positive",
                "rule": "expenses_decrease",
                "message": f"👏 Redujiste tus gastos un {abs(exp_change_pct):.1f}% respecto al mes anterior.",
            })

    # --- Rule 4: Fixed expenses proportion ---
    if expenses > 0 and fixed_expenses > 0:
        fixed_pct = fixed_expenses / expenses * 100
        if fixed_pct > 60:
            findings.append({
                "type": "info",
                "rule": "high_fixed_expenses",
                "message": f"📌 El {fixed_pct:.1f}% de tus gastos son fijos. Poca flexibilidad financiera.",
            })

    # --- Rule 5: Top category dominance ---
    if category_breakdown and expenses > 0:
        top = category_breakdown[0]
        top_pct = top["amount"] / expenses * 100
        if top_pct > 40:
            findings.append({
                "type": "info",
                "rule": "category_dominance",
                "message": f"📊 {top['category_name']} representa el {top_pct:.1f}% de tus gastos.",
            })

    # --- Rule 6: Debt burden ---
    if projected_debt_payments > 0 and income > 0:
        debt_pct = projected_debt_payments / income * 100
        if debt_pct > 25:
            alerts.append({
                "severity": "warning",
                "rule": "high_debt_burden",
                "message": f"💳 Tus pagos de deuda proyectados consumen {debt_pct:.1f}% de tus ingresos. Conviene priorizar amortizacion o refinanciamiento.",
            })

    # --- Rule 7: Savings opportunities ---
    if suggested_expense_reductions:
        top_cut = suggested_expense_reductions[0]
        findings.append({
            "type": "info",
            "rule": "best_saving_opportunity",
            "message": f"✂️ Mayor oportunidad de ahorro: {top_cut['category_name']} puede liberar ~${top_cut['suggested_cut_amount']:,.0f} al mes.",
        })
    if potential_monthly_savings > 0:
        findings.append({
            "type": "positive",
            "rule": "potential_savings",
            "message": f"💡 Ajustando categorias clave podrias ahorrar hasta ${potential_monthly_savings:,.0f} mensuales.",
        })

    return {"findings": findings, "alerts": alerts}

"""
Mock LLM provider for development without an API key.
Generates realistic recommendations based on the financial data.
"""
from typing import Any, Dict, List
from app.services.agent.providers.base import BaseLLMProvider


class MockLLMProvider(BaseLLMProvider):
    """Mock provider that generates rule-based responses without calling any external API."""

    def analyze_finances(self, data: Dict[str, Any]) -> Dict[str, Any]:
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        savings = income - expenses
        savings_pct = round((savings / income * 100) if income > 0 else 0, 1)

        return {
            "summary": self.explain_summary(data),
            "health_score": self._health_score(savings_pct),
            "recommendations": self.generate_recommendations(data),
            "alerts": self._generate_alerts(data),
        }

    def generate_recommendations(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        recommendations = []
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        ant_expenses = data.get("ant_expenses", 0)
        category_breakdown = data.get("category_breakdown", [])
        savings = income - expenses

        # Ant expenses recommendation
        if ant_expenses > 0 and income > 0:
            pct = round(ant_expenses / income * 100, 1)
            recommendations.append({
                "type": "warning",
                "icon": "🐜",
                "title": "Gastos hormiga detectados",
                "message": f"Tus gastos hormiga suman ${ant_expenses:,.0f} ({pct}% de tus ingresos). "
                           f"Reducirlos a la mitad te liberaría ${ant_expenses/2:,.0f} mensuales.",
            })

        # Savings recommendation
        if income > 0 and savings > 0:
            recommendations.append({
                "type": "success",
                "icon": "💰",
                "title": "Capacidad de ahorro",
                "message": f"Este mes tu capacidad de ahorro estimada es de ${savings:,.0f} "
                           f"({round(savings/income*100,1)}% de tus ingresos).",
            })
        elif income > 0 and savings <= 0:
            recommendations.append({
                "type": "danger",
                "icon": "🚨",
                "title": "Gastos superan ingresos",
                "message": f"Tus gastos (${expenses:,.0f}) superan tus ingresos (${income:,.0f}). "
                           "Revisa los gastos variables para encontrar áreas de reducción.",
            })

        # Top category recommendation
        if category_breakdown:
            top_cat = category_breakdown[0]
            pct = round(top_cat["amount"] / expenses * 100, 1) if expenses > 0 else 0
            recommendations.append({
                "type": "info",
                "icon": "📊",
                "title": f"Mayor categoría de gasto: {top_cat['category_name']}",
                "message": f"El gasto en {top_cat['category_name']} representa el {pct}% "
                           f"de tus gastos totales (${top_cat['amount']:,.0f}).",
            })

        # Monthly comparison
        prev_income = data.get("prev_income", 0)
        prev_expenses = data.get("prev_expenses", 0)
        if prev_expenses > 0:
            exp_change = round((expenses - prev_expenses) / prev_expenses * 100, 1)
            if exp_change > 20:
                recommendations.append({
                    "type": "warning",
                    "icon": "📈",
                    "title": "Aumento en gastos",
                    "message": f"Tus gastos aumentaron un {exp_change}% respecto al mes anterior. "
                               "Revisa en qué categorías se concentra el aumento.",
                })

        # Savings goal suggestion
        goals = data.get("savings_goals", [])
        if goals and income > 0:
            total_needed = sum(g.get("target_amount", 0) - g.get("current_amount", 0) for g in goals if g.get("status") == "active")
            if total_needed > 0:
                recommendations.append({
                    "type": "info",
                    "icon": "🎯",
                    "title": "Objetivos de ahorro",
                    "message": f"Tienes objetivos de ahorro activos. Destinar el 20% de tus ingresos "
                               f"(${income*0.2:,.0f}) te acercaría a tus metas más rápido.",
                })

        return recommendations

    def explain_summary(self, data: Dict[str, Any]) -> str:
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        savings = income - expenses
        savings_pct = round((savings / income * 100) if income > 0 else 0, 1)
        month = data.get("period", {}).get("month", "")
        year = data.get("period", {}).get("year", "")

        return (
            f"En el período {month}/{year}, tus ingresos fueron ${income:,.0f} y tus gastos ${expenses:,.0f}. "
            f"{'Lograste ahorrar' if savings > 0 else 'Tuviste un déficit de'} ${abs(savings):,.0f} "
            f"({'%.1f' % savings_pct}% de tus ingresos). "
            f"{'¡Buen trabajo manteniendo un balance positivo!' if savings > 0 else 'Te recomendamos revisar tus gastos variables para mejorar tu balance.'}"
        )

    def chat(self, user_input: str, context: Dict[str, Any]) -> str:
        lower = user_input.lower()
        income = context.get("income", 0)
        expenses = context.get("expenses", 0)
        savings = income - expenses

        if any(w in lower for w in ["ahorro", "ahorrar", "guardar"]):
            return (
                f"Basado en tus finanzas actuales, tienes una capacidad de ahorro de ${savings:,.0f} este mes. "
                "Te recomiendo aplicar la regla 50/30/20: 50% en necesidades, 30% en deseos y 20% en ahorro."
            )
        if any(w in lower for w in ["gasto", "gastos", "gastar"]):
            return (
                f"Tus gastos totales este mes son ${expenses:,.0f}. "
                "Las principales áreas donde podrías recortar son los gastos hormiga y las suscripciones no utilizadas."
            )
        if any(w in lower for w in ["ingreso", "ingresos", "sueldo"]):
            return f"Tus ingresos registrados este mes son ${income:,.0f}."
        if any(w in lower for w in ["deuda", "deudas", "credito", "crédito"]):
            return (
                "Para manejar deudas, te recomiendo la estrategia 'bola de nieve': paga primero las deudas más pequeñas "
                "para ganar momentum, o la estrategia 'avalancha': paga las de mayor tasa de interés primero."
            )
        if any(w in lower for w in ["objetivo", "meta", "metas"]):
            return (
                "Para alcanzar tus objetivos de ahorro más rápido, automatiza una transferencia mensual "
                "apenas recibes tu sueldo. ¡Págate primero a ti mismo!"
            )

        return (
            f"Hola! Soy tu agente financiero. Este mes tus ingresos son ${income:,.0f} y tus gastos ${expenses:,.0f}, "
            f"con un {'ahorro' if savings > 0 else 'déficit'} de ${abs(savings):,.0f}. "
            "Puedes preguntarme sobre tus gastos, ahorros, deudas u objetivos financieros."
        )

    def _health_score(self, savings_pct: float) -> int:
        if savings_pct >= 20:
            return 90
        elif savings_pct >= 10:
            return 70
        elif savings_pct >= 0:
            return 50
        else:
            return 25

    def _generate_alerts(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        alerts = []
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        if income > 0 and expenses > income:
            alerts.append({"type": "danger", "message": "⚠️ Tus gastos superan tus ingresos este mes."})
        if income > 0 and expenses / income > 0.9:
            alerts.append({"type": "warning", "message": "⚡ Estás gastando más del 90% de tus ingresos."})
        return alerts

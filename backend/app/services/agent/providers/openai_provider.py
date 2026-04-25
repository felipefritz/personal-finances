"""
OpenAI LLM provider. Uses GPT models to analyze finances and chat.
Requires OPENAI_API_KEY environment variable.
"""
from typing import Any, Dict, List
import json

from app.core.config import settings
from app.services.agent.providers.base import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    """OpenAI (GPT) provider for the financial agent."""

    def __init__(self):
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
            self.model = settings.MODEL_NAME
        except ImportError:
            raise RuntimeError("openai package is not installed. Run: pip install openai")

    def _build_context_prompt(self, data: Dict[str, Any]) -> str:
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        savings = income - expenses
        savings_pct = round((savings / income * 100) if income > 0 else 0, 1)
        categories = data.get("category_breakdown", [])
        cat_text = "\n".join(f"  - {c['category_name']}: ${c['amount']:,.0f}" for c in categories[:8])
        goals = data.get("savings_goals", [])
        goals_text = "\n".join(f"  - {g['name']}: {g.get('progress_percent', 0):.0f}% completado" for g in goals)

        return f"""Datos financieros del período {data.get('period', {}).get('month')}/{data.get('period', {}).get('year')}:
- Ingresos: ${income:,.0f}
- Gastos: ${expenses:,.0f}
- Ahorro: ${savings:,.0f} ({savings_pct}%)
- Gastos hormiga: ${data.get('ant_expenses', 0):,.0f}
- Gastos fijos: ${data.get('fixed_expenses', 0):,.0f}
- Gastos variables: ${data.get('variable_expenses', 0):,.0f}
- Deudas/créditos: ${data.get('debt_payments', 0):,.0f}

Distribución de gastos por categoría:
{cat_text if cat_text else '  (Sin datos)'}

Objetivos de ahorro:
{goals_text if goals_text else '  (Sin objetivos activos)'}"""

    def analyze_finances(self, data: Dict[str, Any]) -> Dict[str, Any]:
        context = self._build_context_prompt(data)
        prompt = f"""{context}

Basado en estos datos financieros, entrega:
1. Un resumen claro del estado financiero (2-3 oraciones)
2. Los 3 principales problemas detectados
3. Las 3 recomendaciones más importantes y concretas
4. Oportunidades de ahorro identificadas

Responde en español, de forma clara y directa. Formato JSON con claves: summary, problems, recommendations, savings_opportunities."""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "Eres un asesor financiero personal experto. Analizas datos financieros y das recomendaciones concretas en español."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=1000,
        )
        content = response.choices[0].message.content
        try:
            result = json.loads(content)
        except Exception:
            result = {"summary": content, "recommendations": [], "problems": [], "savings_opportunities": []}
        return result

    def generate_recommendations(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        analysis = self.analyze_finances(data)
        recs = analysis.get("recommendations", [])
        return [{"type": "info", "icon": "💡", "title": "Recomendación", "message": r} for r in recs]

    def explain_summary(self, data: Dict[str, Any]) -> str:
        analysis = self.analyze_finances(data)
        return analysis.get("summary", "")

    def chat(self, user_input: str, context: Dict[str, Any]) -> str:
        ctx_text = self._build_context_prompt(context)
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Eres un asesor financiero personal amigable y experto. "
                        "Respondes en español de forma clara y concisa. "
                        "Usas los datos financieros del usuario para dar respuestas personalizadas."
                    ),
                },
                {"role": "user", "content": f"Contexto financiero:\n{ctx_text}\n\nPregunta: {user_input}"},
            ],
            max_tokens=500,
        )
        return response.choices[0].message.content

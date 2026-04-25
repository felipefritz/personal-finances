"""
Ollama LLM provider.
Uses local Ollama server (http://localhost:11434 by default).
"""
from typing import Any, Dict, List
import json

import httpx

from app.core.config import settings
from app.services.agent.providers.base import BaseLLMProvider


class OllamaProvider(BaseLLMProvider):
    """Ollama provider for local/private financial analysis."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self.timeout = httpx.Timeout(60.0)

    def _build_context_prompt(self, data: Dict[str, Any]) -> str:
        income = data.get("income", 0)
        expenses = data.get("expenses", 0)
        savings = data.get("savings", income - expenses)
        savings_pct = data.get("savings_percent", 0)
        categories = data.get("category_breakdown", [])
        cat_text = "\n".join(f"- {c['category_name']}: ${c['amount']:,.0f}" for c in categories[:10])

        return (
            f"Periodo: {data.get('period', {}).get('month')}/{data.get('period', {}).get('year')}\n"
            f"Ingresos: ${income:,.0f}\n"
            f"Gastos: ${expenses:,.0f}\n"
            f"Ahorro: ${savings:,.0f} ({savings_pct}%)\n"
            f"Gastos hormiga: ${data.get('ant_expenses', 0):,.0f}\n"
            f"Gastos fijos: ${data.get('fixed_expenses', 0):,.0f}\n"
            f"Top categorias:\n{cat_text if cat_text else '- Sin datos'}"
        )

    def _chat(self, system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "")
        except Exception:
            if json_mode:
                return json.dumps(
                    {
                        "summary": "No se pudo contactar Ollama local. Verifica que el servicio este ejecutandose.",
                        "health_score": 50,
                        "recommendations": [
                            {
                                "type": "warning",
                                "icon": "⚠️",
                                "title": "Ollama no disponible",
                                "message": "Ejecuta `ollama serve` y descarga el modelo configurado.",
                            }
                        ],
                    }
                )
            return (
                "No pude contactar Ollama local. "
                "Asegurate de tener `ollama serve` corriendo y el modelo descargado."
            )

    def analyze_finances(self, data: Dict[str, Any]) -> Dict[str, Any]:
        context = self._build_context_prompt(data)
        prompt = (
            f"{context}\n\n"
            "Genera un analisis financiero en JSON con llaves: "
            "summary, health_score, recommendations. "
            "recommendations debe ser un array de objetos con llaves: "
            "type (info|warning|success|danger), icon, title, message."
        )
        content = self._chat(
            system_prompt="Eres un asesor financiero personal experto y practico. Respondes en espanol.",
            user_prompt=prompt,
            json_mode=True,
        )
        try:
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise ValueError("Invalid JSON object")

            raw_summary = parsed.get("summary", self.explain_summary(data))
            if isinstance(raw_summary, dict):
                summary = " | ".join(f"{k}: {v}" for k, v in raw_summary.items())
            else:
                summary = str(raw_summary)

            health_score = parsed.get("health_score", 50)
            try:
                health_score = int(health_score)
            except Exception:
                health_score = 50

            raw_recs = parsed.get("recommendations", [])
            recommendations: List[Dict[str, str]] = []
            if isinstance(raw_recs, list):
                for r in raw_recs:
                    if isinstance(r, dict):
                        recommendations.append(
                            {
                                "type": str(r.get("type", "info")),
                                "icon": str(r.get("icon", "💡")),
                                "title": str(r.get("title", "Recomendacion")),
                                "message": str(r.get("message", "")),
                            }
                        )
                    elif isinstance(r, str):
                        recommendations.append(
                            {
                                "type": "info",
                                "icon": "💡",
                                "title": "Recomendacion",
                                "message": r,
                            }
                        )

            return {
                "summary": summary,
                "health_score": health_score,
                "recommendations": recommendations,
            }
        except Exception:
            return {
                "summary": content or self.explain_summary(data),
                "health_score": 50,
                "recommendations": self.generate_recommendations(data),
            }

    def generate_recommendations(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        analysis = self.analyze_finances(data)
        recs = analysis.get("recommendations", [])
        if isinstance(recs, list):
            return [
                {
                    "type": str(r.get("type", "info")),
                    "icon": str(r.get("icon", "💡")),
                    "title": str(r.get("title", "Recomendacion")),
                    "message": str(r.get("message", "")),
                }
                for r in recs
                if isinstance(r, dict)
            ]
        return []

    def explain_summary(self, data: Dict[str, Any]) -> str:
        context = self._build_context_prompt(data)
        prompt = f"{context}\n\nEntrega un resumen financiero en maximo 3 oraciones."
        return self._chat(
            system_prompt="Eres un asesor financiero personal. Respondes en espanol claro.",
            user_prompt=prompt,
            json_mode=False,
        )

    def chat(self, user_input: str, context: Dict[str, Any]) -> str:
        ctx_text = self._build_context_prompt(context)
        prompt = f"Contexto financiero:\n{ctx_text}\n\nPregunta del usuario: {user_input}"
        return self._chat(
            system_prompt=(
                "Eres un asesor financiero personal amigable y accionable. "
                "Respondes en espanol, con recomendaciones concretas."
            ),
            user_prompt=prompt,
            json_mode=False,
        )

"""
Financial agent: combines rules engine + LLM service.
Builds financial context from DB and produces analysis.
"""
from typing import Any, Dict, List, Optional
from sqlmodel import Session

from app.services.dashboard_service import get_dashboard_summary
from app.services.agent.rules_engine import run_rules_analysis
from app.services.agent.llm_service import LLMService

_llm_service = LLMService()


def get_financial_analysis(session: Session, month: int, year: int, account_id: Optional[int] = None) -> Dict[str, Any]:
    """Full financial analysis combining rules + LLM."""
    data = get_dashboard_summary(session, month, year, account_id=account_id)

    # Rules-based findings
    rules_result = run_rules_analysis(data)

    # LLM-based analysis
    llm_analysis = _llm_service.analyze_finances(data)

    return {
        "period": data["period"],
        "summary": llm_analysis.get("summary", ""),
        "health_score": llm_analysis.get("health_score", 50),
        "recommendations": llm_analysis.get("recommendations", []),
        "alerts": rules_result["alerts"],
        "findings": rules_result["findings"],
        "financial_data": {
            "income": data["income"],
            "expenses": data["expenses"],
            "savings": data["savings"],
            "savings_percent": data["savings_percent"],
            "ant_expenses": data["ant_expenses"],
            "fixed_expenses": data["fixed_expenses"],
            "variable_expenses": data["variable_expenses"],
        },
    }


def chat_with_agent(user_input: str, session: Session, month: int, year: int, account_id: Optional[int] = None) -> str:
    """Send a message and get a response from the financial agent."""
    context = get_dashboard_summary(session, month, year, account_id=account_id)
    return _llm_service.chat(user_input, context)

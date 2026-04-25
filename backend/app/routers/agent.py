from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.core.database import get_session
from app.services.agent.financial_agent import get_financial_analysis, chat_with_agent
from app.services.dashboard_service import resolve_analysis_period

router = APIRouter(prefix="/agent", tags=["Financial Agent"])


class ChatRequest(BaseModel):
    message: str
    month: Optional[int] = None
    year: Optional[int] = None
    account_id: Optional[int] = None


@router.get("/analyze")
def analyze(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None),
    account_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    """Full financial analysis for a given month."""
    m, y = resolve_analysis_period(session, month=month, year=year, account_id=account_id)
    return get_financial_analysis(session, m, y, account_id=account_id)


@router.post("/chat")
def chat(data: ChatRequest, session: Session = Depends(get_session)):
    """Chat with the financial agent."""
    m, y = resolve_analysis_period(session, month=data.month, year=data.year, account_id=data.account_id)
    response = chat_with_agent(data.message, session, m, y, account_id=data.account_id)
    return {"response": response, "month": m, "year": y}

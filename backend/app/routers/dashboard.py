from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.services.dashboard_service import get_dashboard_summary, resolve_analysis_period

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def summary(
    month: int = Query(default=None, ge=1, le=12),
    year: int = Query(default=None, ge=2000, le=2100),
    account_id: int = Query(default=None),
    session: Session = Depends(get_session),
):
    m, y = resolve_analysis_period(session, month=month, year=year, account_id=account_id)
    return get_dashboard_summary(session, m, y, account_id=account_id)

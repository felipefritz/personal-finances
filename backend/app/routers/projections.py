from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.services.projection_service import project_annual_balance

router = APIRouter(prefix="/projections", tags=["Projections"])


@router.get("/annual")
def annual_projection(
    year: int = Query(default=None, ge=2000, le=2100),
    account_id: int = Query(default=None),
    session: Session = Depends(get_session),
):
    """
    Returns a 12-month balance projection for the requested year.
    Past/current months use real transaction data; future months use templates
    (recurring incomes, fixed expenses, installment forecasts, variable avg).
    """
    if year is None:
        year = datetime.now().year
    return {
        "year": year,
        "months": project_annual_balance(session, year, account_id=account_id),
    }

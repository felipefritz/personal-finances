from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class BudgetBase(BaseModel):
    month: int
    year: int
    category_id: int
    expected_amount: float
    actual_amount: float = 0.0


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    expected_amount: Optional[float] = None
    actual_amount: Optional[float] = None


class BudgetRead(BudgetBase):
    id: int
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    difference: float = 0.0
    status: str = "ok"  # ok, near_limit, exceeded
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetRecommendationItem(BaseModel):
    category_id: int
    category_name: str
    bucket: str
    recommended_amount: float
    recent_avg_spent: float = 0.0
    current_budget_amount: float = 0.0
    rationale: str


class BudgetRecommendationResponse(BaseModel):
    strategy_name: str
    month: int
    year: int
    avg_monthly_income: float
    needs_target: float
    wants_target: float
    savings_target: float
    recommended_monthly_saving: float
    recent_needs_ratio: float = 0.0
    insights: list[str] = []
    items: list[BudgetRecommendationItem] = []


class BudgetRecommendationApplyResponse(BaseModel):
    created: int
    updated: int
    skipped: int

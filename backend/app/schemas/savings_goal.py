from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel


class SavingsGoalBase(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[date] = None
    current_amount: float = 0.0
    priority: int = 1
    status: str = "active"
    description: Optional[str] = None


class SavingsGoalCreate(SavingsGoalBase):
    pass


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    target_date: Optional[date] = None
    current_amount: Optional[float] = None
    priority: Optional[int] = None
    status: Optional[str] = None
    description: Optional[str] = None


class SavingsGoalRead(SavingsGoalBase):
    id: int
    progress_percent: float = 0.0
    monthly_needed: Optional[float] = None
    suggested_monthly_contribution: Optional[float] = None
    estimated_months_to_target: Optional[int] = None
    estimated_target_date: Optional[date] = None
    feasibility_status: Optional[str] = None
    available_monthly_savings: Optional[float] = None
    other_goals_monthly_commitment: Optional[float] = None
    available_liquid_balance: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SavingsGoalPlanRequest(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: Optional[date] = None
    priority: int = 1
    status: str = "active"


class SavingsGoalPlanResponse(BaseModel):
    monthly_needed: Optional[float] = None
    suggested_monthly_contribution: float
    estimated_months_to_target: Optional[int] = None
    estimated_target_date: Optional[date] = None
    feasibility_status: str
    available_monthly_savings: float
    other_goals_monthly_commitment: float
    available_liquid_balance: float
    message: str

from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel, field_validator

from app.core.text_normalization import normalize_sentence_text, normalize_title_text


class SavingsGoalBase(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[date] = None
    current_amount: float = 0.0
    priority: int = 1
    status: str = "active"
    description: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        return normalize_sentence_text(value)


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

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        return normalize_sentence_text(value)


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
    reserved_amount: float = 0.0
    total_available_amount: float = 0.0
    remaining_after_reserved: float = 0.0
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

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)


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


class SavingsDistributionGoalItem(BaseModel):
    goal_id: int
    goal_name: str
    priority: int
    target_date: Optional[date] = None
    remaining_amount: float
    suggested_monthly_amount: float
    monthly_needed: Optional[float] = None
    feasibility: str


class SavingsDistributionAccountItem(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    current_balance: float
    suggested_monthly_amount: float


class SavingsDistributionResponse(BaseModel):
    projected_monthly_savings: float
    distribution_to_goals: float
    distribution_to_accounts: float
    goals: list[SavingsDistributionGoalItem]
    savings_accounts: list[SavingsDistributionAccountItem]
    recommendations: list[str]


class SavingsAnnualProjectionMonth(BaseModel):
    period: str  # YYYY-MM
    projected_savings: float
    to_goals: float
    to_accounts: float
    cumulative_savings: float


class SavingsAnnualProjectionResponse(BaseModel):
    start_date: date
    end_date: date
    months: list[SavingsAnnualProjectionMonth]
    total_projected_savings: float
    total_to_goals: float
    total_to_accounts: float

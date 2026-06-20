from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field


class SavingsGoal(SQLModel, table=True):
    __tablename__ = "savings_goals"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    target_amount: float
    target_date: Optional[date] = Field(default=None)
    current_amount: float = Field(default=0.0)
    priority: int = Field(default=1)  # 1-5
    status: str = Field(default="active", max_length=50)  # active, completed, paused
    description: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

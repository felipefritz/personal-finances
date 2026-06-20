from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field


class RecurringIncome(SQLModel, table=True):
    __tablename__ = "recurring_incomes"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    amount: float
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    day_of_month: Optional[int] = Field(default=None)  # 1–31, day income is received
    income_type: str = Field(default="sueldo", max_length=50)  # sueldo, honorarios, arriendo, otro
    is_active: bool = Field(default=True)
    last_applied_date: Optional[date] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

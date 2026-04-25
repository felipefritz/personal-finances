from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Budget(SQLModel, table=True):
    __tablename__ = "budgets"

    id: Optional[int] = Field(default=None, primary_key=True)
    month: int  # 1-12
    year: int
    category_id: int = Field(foreign_key="categories.id")
    expected_amount: float
    actual_amount: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

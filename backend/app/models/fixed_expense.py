from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class FixedExpense(SQLModel, table=True):
    __tablename__ = "fixed_expenses"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    expected_amount: float
    payment_day: Optional[int] = Field(default=None)  # 1-31
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    is_active: bool = Field(default=True)
    # dividendo, credito, colegio, servicio, seguro, suscripcion, otro
    expense_type: str = Field(default="otro", max_length=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

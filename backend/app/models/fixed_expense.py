from typing import Optional
from datetime import date, datetime
from sqlmodel import SQLModel, Field


class FixedExpense(SQLModel, table=True):
    __tablename__ = "fixed_expenses"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    expected_amount: float
    currency: str = Field(default="CLP", max_length=10)
    start_date: Optional[date] = Field(default=None)
    payment_day: Optional[int] = Field(default=None)  # 1-31
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    is_active: bool = Field(default=True)
    # dividendo, credito, colegio, servicio, seguro, suscripcion, otro
    expense_type: str = Field(default="otro", max_length=50)
    total_installments: Optional[int] = Field(default=None)
    remaining_installments: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

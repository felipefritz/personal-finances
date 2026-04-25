from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class FixedExpenseBase(BaseModel):
    name: str
    category_id: Optional[int] = None
    expected_amount: float
    payment_day: Optional[int] = None
    account_id: Optional[int] = None
    is_active: bool = True
    expense_type: str = "otro"  # dividendo, credito, colegio, servicio, seguro, suscripcion, otro


class FixedExpenseCreate(FixedExpenseBase):
    pass


class FixedExpenseUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    expected_amount: Optional[float] = None
    payment_day: Optional[int] = None
    account_id: Optional[int] = None
    is_active: Optional[bool] = None
    expense_type: Optional[str] = None


class FixedExpenseRead(FixedExpenseBase):
    id: int
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

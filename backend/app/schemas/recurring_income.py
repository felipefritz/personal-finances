from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class RecurringIncomeBase(BaseModel):
    name: str
    amount: float
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    day_of_month: Optional[int] = None
    income_type: str = "sueldo"  # sueldo, honorarios, arriendo, otro
    is_active: bool = True


class RecurringIncomeCreate(RecurringIncomeBase):
    pass


class RecurringIncomeUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    day_of_month: Optional[int] = None
    income_type: Optional[str] = None
    is_active: Optional[bool] = None


class RecurringIncomeRead(RecurringIncomeBase):
    id: int
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

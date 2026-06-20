from typing import Literal, Optional
from datetime import date, datetime
from pydantic import BaseModel
from pydantic import Field
from pydantic import field_validator

from app.core.text_normalization import normalize_title_text


class FixedExpenseBase(BaseModel):
    name: str
    category_id: Optional[int] = None
    expected_amount: float
    currency: str = "CLP"
    start_date: Optional[date] = None
    payment_day: Optional[int] = None
    account_id: Optional[int] = None
    is_active: bool = True
    expense_type: str = "otro"  # dividendo, credito, colegio, servicio, seguro, suscripcion, otro
    total_installments: Optional[int] = None
    remaining_installments: Optional[int] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: Optional[str]) -> str:
        normalized = (value or "CLP").upper()
        if normalized not in {"CLP", "UF"}:
            raise ValueError("La moneda del gasto fijo debe ser CLP o UF")
        return normalized


class FixedExpenseCreate(FixedExpenseBase):
    amount_mode: Literal["monthly", "total"] = "monthly"


class FixedExpenseUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    expected_amount: Optional[float] = None
    start_date: Optional[date] = None
    payment_day: Optional[int] = None
    account_id: Optional[int] = None
    is_active: Optional[bool] = None
    expense_type: Optional[str] = None
    total_installments: Optional[int] = None
    remaining_installments: Optional[int] = None
    amount_mode: Optional[Literal["monthly", "total"]] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)


class FixedExpenseRead(FixedExpenseBase):
    id: int
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    account_name: Optional[str] = None
    expected_amount_clp: Optional[float] = None
    total_debt_clp: Optional[float] = None
    remaining_debt_clp: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FixedExpensePrepayRequest(BaseModel):
    installments: int = Field(default=1, ge=1)


class FixedExpensePrepayResponse(BaseModel):
    fixed_expense: FixedExpenseRead
    prepaid_installments: int
    previous_remaining_installments: int
    remaining_installments: int
    closed_debt: bool


class FixedExpensePrepayRevertRequest(BaseModel):
    installments: int = Field(default=1, ge=1)


class FixedExpensePrepayRevertResponse(BaseModel):
    fixed_expense: FixedExpenseRead
    reverted_installments: int
    previous_remaining_installments: int
    remaining_installments: int
    reopened_debt: bool

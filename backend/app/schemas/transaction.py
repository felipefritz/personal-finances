from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel, Field

# Alias to avoid Python 3.13 name-shadowing bug: when a field is named `date`
# and has a default value (date: Optional[date] = None), the annotation resolves
# the type `date` to the field's default (None) instead of datetime.date.
_Date = date


class TransactionBase(BaseModel):
    date: date
    description: str
    amount: float
    transaction_type: str  # income, expense, transfer
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    account_id: Optional[int] = None
    source: str = "manual"
    is_fixed_expense: bool = False
    is_ant_expense: bool = False
    is_transfer: bool = False
    is_debt: bool = False
    is_international: bool = False
    is_paid: bool = True
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    local_amount: Optional[float] = None  # CLP equivalent for international transactions
    comment: Optional[str] = None
    tags: Optional[str] = None  # comma-separated
    status: str = "confirmed"
    fixed_expense_id: Optional[int] = None
    installment_current: Optional[int] = None
    installment_total: Optional[int] = None
    installment_base_amount: Optional[float] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[_Date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    transaction_type: Optional[str] = None
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    account_id: Optional[int] = None
    is_fixed_expense: Optional[bool] = None
    is_ant_expense: Optional[bool] = None
    is_transfer: Optional[bool] = None
    is_debt: Optional[bool] = None
    is_international: Optional[bool] = None
    is_paid: Optional[bool] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    comment: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None
    fixed_expense_id: Optional[int] = None


class TransactionRead(TransactionBase):
    id: int
    import_file_id: Optional[int] = None
    category_name: Optional[str] = None
    account_name: Optional[str] = None
    exchange_rate_usd: Optional[float] = None  # CLP per 1 USD used for conversion
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TransactionFilter(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    transaction_type: Optional[str] = None
    source: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    search: Optional[str] = None
    is_fixed_expense: Optional[bool] = None
    is_ant_expense: Optional[bool] = None
    status: Optional[str] = None


class TransactionListResponse(BaseModel):
    items: List[TransactionRead]
    total: int
    page: int
    page_size: int
    total_pages: int
    total_amount: float


class InstallmentPrepayRequest(BaseModel):
    installments: int = Field(default=1, ge=1)


class InstallmentPrepayResponse(BaseModel):
    transaction_id: int
    prepaid_installments: int
    previous_remaining_installments: int
    remaining_installments: int
    closed_debt: bool


class InstallmentPrepayRevertRequest(BaseModel):
    installments: int = Field(default=1, ge=1)


class InstallmentPrepayRevertResponse(BaseModel):
    transaction_id: int
    reverted_installments: int
    previous_remaining_installments: int
    remaining_installments: int
    reopened_debt: bool

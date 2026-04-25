from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel


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
    comment: Optional[str] = None
    tags: Optional[str] = None  # comma-separated
    status: str = "confirmed"
    fixed_expense_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
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

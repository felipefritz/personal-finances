from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field


class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: date
    description: str = Field(max_length=500)
    amount: float  # positive = income, use sign convention with transaction_type
    transaction_type: str = Field(max_length=50)  # income, expense, transfer
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    subcategory_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    source: str = Field(default="manual", max_length=50)  # manual, fintoc, excel, pdf
    is_fixed_expense: bool = Field(default=False)
    is_ant_expense: bool = Field(default=False)  # gasto hormiga
    is_transfer: bool = Field(default=False)
    is_debt: bool = Field(default=False)
    is_international: bool = Field(default=False)
    is_paid: bool = Field(default=True)
    original_amount: Optional[float] = Field(default=None)  # amount in original foreign currency
    original_currency: Optional[str] = Field(default=None, max_length=10)  # e.g. USD, MXN
    comment: Optional[str] = Field(default=None)
    tags: Optional[str] = Field(default=None)  # comma-separated
    status: str = Field(default="confirmed", max_length=50)  # confirmed, pending, ignored
    fixed_expense_id: Optional[int] = Field(default=None, foreign_key="fixed_expenses.id")
    import_file_id: Optional[int] = Field(default=None, foreign_key="import_files.id")
    # Installment metadata (populated from bank statement parsing)
    installment_current: Optional[int] = Field(default=None)  # 0 = unfactured purchase, N = Nth payment
    installment_total: Optional[int] = Field(default=None)    # total number of installments
    installment_base_amount: Optional[float] = Field(default=None)  # amount per installment
    # For international transactions: amount is stored in USD; local_amount is the CLP equivalent at import time
    local_amount: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

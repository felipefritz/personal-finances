from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    bank: Optional[str] = Field(default=None, max_length=100)
    # corriente, vista, ahorro, tarjeta_credito, inversion, efectivo
    account_type: str = Field(max_length=50)
    balance: float = Field(default=0.0)
    currency: str = Field(default="CLP", max_length=10)
    is_active: bool = Field(default=True)
    source: str = Field(default="manual", max_length=50)  # manual, fintoc, excel, pdf
    statement_pdf_password: Optional[str] = Field(default=None, max_length=255)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

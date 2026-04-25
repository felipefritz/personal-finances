from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class AccountBase(BaseModel):
    name: str
    bank: Optional[str] = None
    account_type: str  # corriente, vista, ahorro, tarjeta_credito, inversion, efectivo
    balance: float = 0.0
    currency: str = "CLP"
    is_active: bool = True
    source: str = "manual"
    notes: Optional[str] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    bank: Optional[str] = None
    account_type: Optional[str] = None
    balance: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class AccountRead(AccountBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

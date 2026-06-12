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
    card_last_four: Optional[str] = None
    card_network: Optional[str] = None


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
    card_last_four: Optional[str] = None
    card_network: Optional[str] = None


class AccountRead(AccountBase):
    id: int
    created_at: datetime
    updated_at: datetime
    # For tarjeta_credito: computed from transactions (negative = debt); None for other account types
    computed_balance: Optional[float] = None
    # For tarjeta_credito: balance field is treated as credit limit (cupo total)
    credit_limit: Optional[float] = None
    # For tarjeta_credito: available amount after discounting debt from credit limit
    available_credit: Optional[float] = None
    # For tarjeta_credito: extra reserved credit for unfactured 0/N installments
    future_installments_commitment: Optional[float] = None

    model_config = {"from_attributes": True}

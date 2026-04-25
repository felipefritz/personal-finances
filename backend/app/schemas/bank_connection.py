from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class BankConnectionCreate(BaseModel):
    provider: str
    display_name: str
    account_id: Optional[int] = None


class BankConnectionRead(BaseModel):
    id: int
    provider: str
    display_name: str
    status: str
    last_sync: Optional[datetime] = None
    account_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FintocConnectRequest(BaseModel):
    link_token: str
    account_id: Optional[int] = None


class FintocSyncRequest(BaseModel):
    connection_id: int
    account_id: int

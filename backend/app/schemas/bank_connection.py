from typing import Optional, List
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
    has_access_token: bool = False
    access_token_masked: Optional[str] = None
    has_fintoc_secret_key: bool = False
    fintoc_secret_key_masked: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FintocConnectRequest(BaseModel):
    link_token: str
    account_id: Optional[int] = None
    secret_key: Optional[str] = None


class FintocSyncRequest(BaseModel):
    connection_id: int
    provider_account_id: Optional[str] = None
    provider_account_ids: Optional[List[str]] = None


class FintocUpdateCredentialsRequest(BaseModel):
    connection_id: int
    link_token: Optional[str] = None
    secret_key: Optional[str] = None


class FintocCredentialsRead(BaseModel):
    connection_id: int
    has_access_token: bool
    access_token: Optional[str] = None
    has_fintoc_secret_key: bool
    fintoc_secret_key: Optional[str] = None

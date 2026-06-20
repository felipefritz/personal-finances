from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, field_validator

from app.core.text_normalization import normalize_title_text


class BankConnectionCreate(BaseModel):
    provider: str  # bci | banco_chile | santander | banco_estado | fake
    rut: str
    password: str
    display_name: Optional[str] = None

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_display_name(cls, value):
        return normalize_title_text(value)


class BankConnectionUpdateCredentials(BaseModel):
    rut: Optional[str] = None
    password: Optional[str] = None


class BankConnectionSyncRequest(BaseModel):
    provider_account_id: Optional[str] = None
    provider_account_ids: Optional[List[str]] = None


class LinkAccountRequest(BaseModel):
    provider_account_id: str
    local_account_id: Optional[int] = None
    enabled: bool = True


class BankConnectionRead(BaseModel):
    id: int
    provider: str
    provider_label: Optional[str] = None
    display_name: str
    status: str
    last_sync: Optional[datetime] = None
    last_error: Optional[str] = None
    last_error_at: Optional[datetime] = None
    rut_masked: Optional[str] = None
    has_credentials: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

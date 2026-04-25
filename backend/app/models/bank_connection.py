from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class BankConnection(SQLModel, table=True):
    __tablename__ = "bank_connections"

    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str = Field(max_length=50)  # fintoc, manual
    display_name: str = Field(max_length=100)
    status: str = Field(default="disconnected", max_length=50)  # connected, disconnected, error
    last_sync: Optional[datetime] = Field(default=None)
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    # NOTE: Store encrypted tokens in production. This is a placeholder for v1.
    access_token: Optional[str] = Field(default=None)
    connection_metadata: Optional[str] = Field(default=None)  # JSON string
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

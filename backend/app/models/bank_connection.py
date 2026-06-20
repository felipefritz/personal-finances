from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class BankConnection(SQLModel, table=True):
    __tablename__ = "bank_connections"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    # bci | banco_chile | santander | banco_estado | fake (pruebas) | fintoc (legado, deshabilitado)
    provider: str = Field(max_length=50)
    display_name: str = Field(max_length=100)
    # connected | action_required | error | disconnected
    status: str = Field(default="disconnected", max_length=50)
    last_sync: Optional[datetime] = Field(default=None)
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    # Credenciales del banco cifradas con Fernet (SCRAPER_ENCRYPTION_KEY).
    encrypted_credentials: Optional[str] = Field(default=None)
    last_error: Optional[str] = Field(default=None)
    last_error_at: Optional[datetime] = Field(default=None)
    connection_metadata: Optional[str] = Field(default=None)  # JSON string
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

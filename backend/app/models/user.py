from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    email: Optional[str] = Field(default=None, max_length=200)
    role: str = Field(default="owner", max_length=50)  # owner, admin, member, viewer
    family_account_id: Optional[int] = Field(default=None, foreign_key="family_accounts.id")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

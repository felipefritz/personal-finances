from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class FamilyAccount(SQLModel, table=True):
    __tablename__ = "family_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    plan: str = Field(default="free", max_length=50)  # free, premium
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

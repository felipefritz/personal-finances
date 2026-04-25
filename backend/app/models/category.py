from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class Category(SQLModel, table=True):
    __tablename__ = "categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    parent_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    color: Optional[str] = Field(default=None, max_length=20)
    icon: Optional[str] = Field(default=None, max_length=50)
    is_system: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

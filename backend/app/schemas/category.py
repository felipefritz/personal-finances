from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, field_validator

from app.core.text_normalization import normalize_title_text


class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_system: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        return normalize_title_text(value)


class CategoryRead(CategoryBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryWithChildren(CategoryRead):
    children: List["CategoryRead"] = []


class CategoryDefaultsResult(BaseModel):
    created_categories: int
    created_subcategories: int
    skipped_categories: int
    skipped_subcategories: int

from typing import Optional, List, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel


class ImportFileRead(BaseModel):
    id: int
    filename: str
    file_type: str
    status: str
    error_message: Optional[str] = None
    transaction_count: int
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    period_label: Optional[str] = None
    imported_at: datetime

    model_config = {"from_attributes": True}


class ColumnMapping(BaseModel):
    date_column: str
    description_column: str
    amount_column: str
    type_column: Optional[str] = None
    category_column: Optional[str] = None


class ImportPreviewRow(BaseModel):
    row_index: int
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    transaction_type: Optional[str] = None
    is_duplicate: bool = False
    is_international: bool = False
    original_currency: Optional[str] = None
    original_amount: Optional[float] = None
    raw_data: Dict[str, Any] = {}


class ImportPreviewResponse(BaseModel):
    import_file_id: int
    filename: str
    file_type: str
    columns: List[str] = []
    preview_rows: List[ImportPreviewRow] = []
    total_rows: int
    duplicate_count: int


class ImportConfirmRequest(BaseModel):
    account_id: int
    pdf_password: Optional[str] = None
    column_mapping: Optional[ColumnMapping] = None
    skip_duplicates: bool = True

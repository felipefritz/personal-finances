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
    statement_month: Optional[str] = None
    national_total_clp: float = 0
    international_total_clp: float = 0
    international_total_usd: float = 0
    import_total_clp: float = 0
    payable_national_clp: float = 0
    payable_international_clp: float = 0
    payable_total_clp: float = 0
    statement_credit_limit_clp: Optional[float] = None
    statement_available_credit_clp: Optional[float] = None
    import_type: Optional[str] = "estado_cuenta"
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
    local_amount: Optional[float] = None  # CLP equivalent for international rows
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
    selected_row_indices: Optional[List[int]] = None
    import_type: Optional[str] = "estado_cuenta"

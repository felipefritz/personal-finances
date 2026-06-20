from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field


class ImportFile(SQLModel, table=True):
    __tablename__ = "import_files"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    filename: str = Field(max_length=255)
    file_type: str = Field(max_length=20)  # excel, pdf
    status: str = Field(default="pending", max_length=50)  # pending, processing, completed, error
    error_message: Optional[str] = Field(default=None)
    transaction_count: int = Field(default=0)
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    period_start: Optional[date] = Field(default=None)
    period_end: Optional[date] = Field(default=None)
    stored_file_path: Optional[str] = Field(default=None, max_length=500)
    statement_month: Optional[str] = Field(default=None, max_length=7)  # YYYY-MM
    national_total_clp: float = Field(default=0)
    international_total_clp: float = Field(default=0)
    international_total_usd: float = Field(default=0)
    import_total_clp: float = Field(default=0)
    payable_national_clp: float = Field(default=0)
    payable_international_clp: float = Field(default=0)
    payable_total_clp: float = Field(default=0)
    statement_credit_limit_clp: Optional[float] = Field(default=None)
    statement_available_credit_clp: Optional[float] = Field(default=None)
    import_type: str = Field(default="estado_cuenta", max_length=30)  # estado_cuenta, movimientos, movimientos_tc
    imported_at: datetime = Field(default_factory=datetime.utcnow)

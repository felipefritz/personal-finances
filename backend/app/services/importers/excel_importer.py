"""
Excel file importer. Parses uploaded Excel files and creates transaction preview rows.
"""
import io
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from app.schemas.import_file import ColumnMapping, ImportPreviewRow

# Summary/total rows that must not be imported as transactions (mirrors pdf_importer logic)
_EXCEL_TOTAL_RE = re.compile(
    r"^\s*(total|subtotal|gran\s+total|monto\s+total|suma\s+total)\b"
    r"|\b(total|subtotal)\s*[:\-]"
    r"|\btotal\s+(?:de\s+)?(?:movimientos?|compras?|cargos?|abonos?|deudas?|facturado)\b"
    r"|\bsaldo\s+(?:anterior|final|al\s+\d)",
    re.IGNORECASE,
)


def _is_excel_total_row(row: Dict[str, Any]) -> bool:
    """Return True if any cell value in the row matches a total/summary pattern."""
    for val in row.values():
        if isinstance(val, str) and _EXCEL_TOTAL_RE.search(val.strip()):
            return True
    return False


def parse_excel(
    file_bytes: bytes,
    filename: Optional[str] = None,
    column_mapping: Optional[ColumnMapping] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parse an Excel file and return (columns, rows).
    rows is a list of raw dicts (column -> value).
    """
    _ = column_mapping  # Reserved for future direct mapping support.
    ext = ""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "csv":
        # Try common encodings used by bank exports.
        try:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8-sig")
        except Exception:
            df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin-1")
    elif ext == "xls":
        # Legacy Excel files are usually BIFF8; let pandas infer engine first.
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception:
            # Some xls exports can still be opened by openpyxl-converted formats.
            df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
    else:
        # Default path for xlsx and unknown spreadsheet-like formats.
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        except Exception:
            df = pd.read_excel(io.BytesIO(file_bytes))

    df = df.dropna(how="all")
    columns = list(df.columns.astype(str))
    rows = df.to_dict(orient="records")
    return columns, rows


def build_preview_rows(
    raw_rows: List[Dict[str, Any]],
    column_mapping: ColumnMapping,
    existing_keys: set,
) -> List[ImportPreviewRow]:
    """
    Map raw rows using column_mapping into ImportPreviewRow objects.
    Marks duplicates based on (date, description, amount) key.
    """
    preview_rows: List[ImportPreviewRow] = []

    for idx, row in enumerate(raw_rows):
        if _is_excel_total_row(row):
            continue

        date_val = _safe_str(row.get(column_mapping.date_column))
        desc_val = _safe_str(row.get(column_mapping.description_column))
        amount_val = _safe_float(row.get(column_mapping.amount_column))
        type_val = _infer_type(amount_val)

        dedup_key = f"{date_val}|{desc_val}|{amount_val}"
        is_dup = dedup_key in existing_keys

        preview_rows.append(
            ImportPreviewRow(
                row_index=idx,
                date=date_val,
                description=desc_val,
                amount=abs(amount_val) if amount_val is not None else None,
                transaction_type=type_val,
                is_duplicate=is_dup,
                raw_data={str(k): str(v) for k, v in row.items()},
            )
        )

    return preview_rows


def _safe_str(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    return str(val).strip()


def _safe_float(val: Any) -> Optional[float]:
    try:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        return float(str(val).replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return None


def _infer_type(amount: Optional[float]) -> str:
    if amount is None:
        return "expense"
    return "income" if amount > 0 else "expense"

"""
Excel file importer. Parses uploaded Excel files and creates transaction preview rows.
"""
import io
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from app.schemas.import_file import ColumnMapping, ImportPreviewRow


def parse_excel(
    file_bytes: bytes,
    column_mapping: Optional[ColumnMapping] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parse an Excel file and return (columns, rows).
    rows is a list of raw dicts (column -> value).
    """
    df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
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

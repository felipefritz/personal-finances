"""
Post-processing for PDF-import preview rows.

Goals:
- Remove noisy pseudo-transactions (e.g. "US US")
- Normalize international amounts to account/user local currency when parsed amount is suspicious
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.schemas.import_file import ImportPreviewRow
from app.services.currency_service import convert_amount

_COUNTRY_CODES = {
    "US", "MX", "PE", "BR", "AR", "CO", "UY", "PY", "BO", "VE", "EC", "PA", "CR", "CN", "GB", "ES", "FR", "DE", "IT", "NL"
}

_CURRENCY_ALIASES = {
    "US": "USD",
    "MX": "MXN",
    "PE": "PEN",
    "CL": "CLP",
}

_CURRENCY_ONLY_LINE_RE = re.compile(r"^\s*([A-Z]{2})(?:\s+\1)+\s*$")
_CURRENCY_TAIL_RE = re.compile(r"\b(" + "|".join(sorted(_COUNTRY_CODES)) + r")\b(?:\s+[\d.,]+)?", re.IGNORECASE)


def normalize_pdf_preview_rows(
    raw_rows: List[Dict[str, Any]],
    preview_rows: List[ImportPreviewRow],
    local_currency: str = "CLP",
) -> List[ImportPreviewRow]:
    """
    Returns cleaned/normalized preview rows.
    Does not mutate input rows list in place.
    """
    cleaned: List[ImportPreviewRow] = []
    local_ccy = (local_currency or "CLP").upper()

    for row in preview_rows:
        if row.original_currency:
            row.original_currency = _normalize_currency_code(row.original_currency)

        raw_line = (raw_rows[row.row_index].get("raw_line", "") if 0 <= row.row_index < len(raw_rows) else "")
        description = (row.description or "").strip()

        if _is_noise_line(description) or _is_noise_line(raw_line):
            continue

        # Strong heuristic: if parser produced an international row in non-local currency
        # but local amount is tiny, it likely captured the wrong number from the statement.
        # Skip this check for bank-specific parsers (bci, etc.) that already set amount=USD.
        parser_bank = (row.raw_data or {}).get("bank", "")
        if _is_suspicious_international_amount(row, local_ccy) and parser_bank not in ("bci",):
            corrected = _convert_original_to_local(row, local_ccy)
            if corrected is not None:
                row.amount = corrected

        # Compute local_amount (CLP equivalent) for international rows so the UI
        # can always show the local-currency value as the primary display amount.
        if row.is_international and row.amount is not None:
            orig_ccy = _normalize_currency_code(row.original_currency or "")
            if orig_ccy == local_ccy and row.original_amount is not None:
                # original was already local (e.g. CLP 990 → USD 1.15 for APPLE.COM)
                sign = -1 if (row.transaction_type or "expense") != "income" else 1
                row.local_amount = sign * abs(row.original_amount)
            else:
                # amount is in USD; convert to local currency
                converted = convert_amount(abs(row.amount), "USD", local_ccy)
                if converted is not None:
                    sign = -1 if (row.transaction_type or "expense") != "income" else 1
                    row.local_amount = sign * abs(converted)

        cleaned.append(row)

    return cleaned


def _is_noise_line(text: str) -> bool:
    s = re.sub(r"\s+", " ", (text or "").strip()).upper()
    if not s:
        return True
    if _CURRENCY_ONLY_LINE_RE.match(s):
        return True
    return s in {"US US", "MX MX"}


def _is_suspicious_international_amount(row: ImportPreviewRow, local_currency: str) -> bool:
    if not row.is_international:
        return False
    if not row.original_currency or not row.original_amount:
        return False

    src = _normalize_currency_code(row.original_currency)
    if src == local_currency:
        return False

    amount_abs = abs(row.amount or 0)
    original_abs = abs(row.original_amount)

    # Typical bad parse pattern in BCI statements: MXN value present, CLP captured as tiny number
    if local_currency == "CLP" and amount_abs < 1000 and original_abs >= 50:
        return True

    # Generic ratio sanity check
    ratio = amount_abs / max(original_abs, 1)
    return ratio < 0.25


def _convert_original_to_local(row: ImportPreviewRow, local_currency: str) -> Optional[float]:
    if not row.original_currency or row.original_amount is None:
        return None
    converted = convert_amount(abs(row.original_amount), _normalize_currency_code(row.original_currency), local_currency)
    if converted is None:
        return None
    return -abs(converted) if (row.transaction_type or "expense") != "income" else abs(converted)


def _normalize_currency_code(code: str) -> str:
    raw = (code or "").strip().upper()
    if not raw:
        return raw
    return _CURRENCY_ALIASES.get(raw, raw)



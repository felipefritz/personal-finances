"""
Post-processing for PDF-import preview rows.

Goals:
- Remove noisy pseudo-transactions (e.g. "US US")
- Normalize international amounts to account/user local currency when parsed amount is suspicious
- Use AI as fallback only for low-confidence rows (OpenAI/Ollama when configured)
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
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
        if _is_suspicious_international_amount(row, local_ccy):
            corrected = _convert_original_to_local(row, local_ccy)
            if corrected is not None:
                row.amount = corrected

            # AI fallback only for low-confidence rows where we still look off.
            ai_hint = _ai_interpret_line(raw_line, local_ccy)
            if ai_hint:
                if ai_hint.get("is_noise") is True:
                    continue
                _apply_ai_hint(row, ai_hint, local_ccy)

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


def _apply_ai_hint(row: ImportPreviewRow, hint: Dict[str, Any], local_currency: str) -> None:
    local_amount = hint.get("local_amount")
    if isinstance(local_amount, (int, float)) and local_amount > 0:
        row.amount = -abs(float(local_amount)) if (row.transaction_type or "expense") != "income" else abs(float(local_amount))

    original_currency = hint.get("original_currency")
    if isinstance(original_currency, str) and original_currency.strip():
        row.original_currency = _normalize_currency_code(original_currency)
        row.is_international = row.original_currency != local_currency

    original_amount = hint.get("original_amount")
    if isinstance(original_amount, (int, float)) and float(original_amount) > 0:
        row.original_amount = float(original_amount)


def _ai_interpret_line(line: str, local_currency: str) -> Optional[Dict[str, Any]]:
    if not line or settings.LLM_PROVIDER.lower() == "mock":
        return None

    provider = settings.LLM_PROVIDER.lower()
    if provider == "openai":
        return _ai_interpret_openai(line, local_currency)
    if provider == "ollama":
        return _ai_interpret_ollama(line, local_currency)
    return None


def _normalize_currency_code(code: str) -> str:
    raw = (code or "").strip().upper()
    if not raw:
        return raw
    return _CURRENCY_ALIASES.get(raw, raw)


def _ai_interpret_openai(line: str, local_currency: str) -> Optional[Dict[str, Any]]:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        prompt = (
            "Interpreta esta línea de cartola bancaria y responde SOLO JSON con llaves: "
            "is_noise (bool), original_currency (string|null), original_amount (number|null), "
            "local_amount (number|null). "
            f"La moneda local objetivo es {local_currency}. "
            "Si la línea no es una transacción real (ej: US US), usa is_noise=true. "
            "Si detectas gasto internacional, entrega original_currency y original_amount y local_amount convertido a moneda local. "
            f"\nLínea: {line}"
        )
        response = client.chat.completions.create(
            model=settings.MODEL_NAME,
            messages=[
                {"role": "system", "content": "Eres un parser financiero preciso. Respondes solo JSON válido."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=220,
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        if data.get("is_noise") is True:
            return {"is_noise": True}
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _ai_interpret_ollama(line: str, local_currency: str) -> Optional[Dict[str, Any]]:
    try:
        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "Eres un parser financiero. Respondes solo JSON válido.",
                },
                {
                    "role": "user",
                    "content": (
                        "Interpreta esta línea de cartola bancaria y responde SOLO JSON con llaves: "
                        "is_noise (bool), original_currency (string|null), original_amount (number|null), "
                        "local_amount (number|null). "
                        f"La moneda local objetivo es {local_currency}. "
                        "Si no es transacción real, is_noise=true. "
                        f"\nLínea: {line}"
                    ),
                },
            ],
            "format": "json",
            "stream": False,
        }
        with httpx.Client(timeout=httpx.Timeout(30.0)) as client:
            resp = client.post(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat", json=payload)
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "")
            data = json.loads(content)
            if data.get("is_noise") is True:
                return {"is_noise": True}
            return data if isinstance(data, dict) else None
    except Exception:
        return None

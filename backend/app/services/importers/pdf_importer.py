"""
PDF file importer — dispatcher layer.

Extracts raw text from a PDF and routes to the appropriate bank-specific
parser based on statement fingerprint detection:

  ┌─────────────────────────────┬──────────────────────────────────┐
  │ Bank detected               │ Parser used                      │
  ├─────────────────────────────┼──────────────────────────────────┤
  │ BCI (Banco BCI, Chile)      │ importers/bci_parser.py          │
  │ Unknown / no match          │ (sin parser — lista vacía)       │
  └─────────────────────────────┴──────────────────────────────────┘

To add a new bank parser:
  1. Create backend/app/services/importers/<bank>_parser.py
  2. Implement detect(lines) -> bool and parse_transactions(raw_rows, existing_keys) -> List[ImportPreviewRow]
  3. Register it in _PARSERS below (order matters — first match wins).
"""
import io
from typing import Any, Dict, List, Optional, Tuple

try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

from app.schemas.import_file import ImportPreviewRow
from app.services.importers import bci_parser

# Ordered list of (name, module). First whose detect() returns True wins.
_PARSERS = [
    ("bci", bci_parser),
]


# ── Text extraction ───────────────────────────────────────────────────────────

def _is_password_error(exc: Exception) -> bool:
    text = f"{exc.__class__.__name__.lower()} {str(exc).lower()}"
    return any(t in text for t in ("password", "encrypt", "decrypt", "permission"))


def parse_pdf(file_bytes: bytes, password: Optional[str] = None) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Extract raw text lines from a PDF.
    Returns (columns, rows) where each row is {"raw_line": str}.
    """
    if not PDF_AVAILABLE:
        raise RuntimeError("pdfplumber is not installed. Run: pip install pdfplumber")
    lines: List[str] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    lines.extend(text.split("\n"))
    except Exception as exc:
        if _is_password_error(exc):
            raise RuntimeError("El PDF requiere clave o la clave es incorrecta") from exc
        detail = str(exc).strip() or exc.__class__.__name__
        raise RuntimeError(f"No se pudo procesar el PDF: {detail}") from exc

    rows = [{"raw_line": line.strip()} for line in lines if line.strip()]
    return ["raw_line"], rows


# ── Bank detection ────────────────────────────────────────────────────────────

def detect_bank(raw_rows: List[Dict[str, Any]]) -> Optional[str]:
    """
    Return the name of the first parser whose detect() matches, or None.
    """
    lines = [r.get("raw_line", "") for r in raw_rows]
    for name, module in _PARSERS:
        if module.detect(lines):
            return name
    return None


# ── Dispatcher ────────────────────────────────────────────────────────────────

def parse_pdf_transactions(
    raw_rows: List[Dict[str, Any]],
    existing_keys: set,
    local_currency: str = "CLP",
) -> List[ImportPreviewRow]:
    """
    Route raw PDF rows to the appropriate bank parser and return preview rows.
    """
    bank = detect_bank(raw_rows)
    for name, module in _PARSERS:
        if name == bank:
            return module.parse_transactions(raw_rows, existing_keys)
    return []


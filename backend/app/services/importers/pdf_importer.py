"""
PDF file importer. Extracts text and parses transaction rows using pdfplumber.
"""
import io
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

from app.schemas.import_file import ImportPreviewRow

# Regex patterns for detecting transactions in bank statements
DATE_PATTERN = re.compile(r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b")
AMOUNT_PATTERN = re.compile(r"(?<!\d)([-+]?\$?\s?[\d.]+(?:,[\d]{2})?|[-+]?\$?\s?[\d,]+(?:\.[\d]{2})?)(?!\d)")
IGNORE_LINE_PATTERN = re.compile(
    r"saldo|cartola|estado de cuenta|fecha\s+descripcion|detalle|pagina|p\u00e1gina|movimientos|disponible"
    r"|per[i\u00ed]odo.{0,25}facturado"
    r"|per[i\u00ed]odo.{0,25}facturaci"
    r"|pr[o\u00f3]ximo.{0,8}per[i\u00ed]odo"
    r"|pagar\s+hasta"
    r"|monto\s+cancelado"
    r"|traspaso\s+deuda"
    r"|realizado\s+us"
    r"|\bus\s+us\b",
    re.IGNORECASE,
)
INCOME_HINTS = ("abono", "deposito", "depósito", "pago recibido", "remuner", "sueldo", "devolucion", "devolución", "cashback")
TRANSFER_HINTS = ("transferencia", "traspaso", "transf.")
EXPENSE_HINTS = ("compra", "cargo", "pago", "cuota", "debito", "débito", "giro")
DEBT_HINTS = ("cuota", "credito", "crédito", "prestamo", "préstamo", "hipotec", "avance", "rotativo", "pago minimo", "pago mínimo")
FIXED_HINTS = ("mensualidad", "suscripcion", "suscripción", "plan", "arriendo", "dividendo", "seguro", "colegio", "isapre", "gimnasio", "internet", "celular")

# International transaction detection
# Maps 2-letter country code (as seen in BCI credit card statements) → ISO currency
COUNTRY_CURRENCY: Dict[str, str] = {
    "US": "USD",
    "MX": "MXN",
    "PE": "PEN",
    "BR": "BRL",
    "AR": "ARS",
    "CO": "COP",
    "UY": "UYU",
    "PY": "PYG",
    "BO": "BOB",
    "VE": "VES",
    "EC": "USD",
    "PA": "USD",
    "CR": "CRC",
    "CN": "CNY",
    "GB": "GBP",
    "ES": "EUR",
    "FR": "EUR",
    "DE": "EUR",
    "IT": "EUR",
    "NL": "EUR",
}
# Matches: '<COUNTRY_CODE>' at end of meaningful text, optionally followed by a number
# BCI statements list both the foreign amount AND the CLP equivalent on the same line:
#   e.g.  "SOLIDARIDAD MX 160,00   10.000"
# group(1) = country code, group(2) = foreign amount, optional trailing value = CLP amount (ignored here)
_INTL_TAIL_RE = re.compile(
    r"\b(US|MX|PE|BR|AR|CO|UY|PY|BO|VE|EC|PA|CR|CN|GB|ES|FR|DE|IT|NL)\b"
    r"(?:\s+([\d.,]+))?"          # group(2): foreign currency amount (optional)
    r"(?:\s+[\d.,]+)?"            # optional trailing CLP amount already used as row.amount
    r"\s*$",
    re.IGNORECASE,
)
# Long card-reference number found in international BCI lines (17+ digits)
_LONG_REF_RE = re.compile(r"\d{17,}")


def _is_password_error(exc: Exception) -> bool:
    message = str(exc).lower()
    class_name = exc.__class__.__name__.lower()
    text = f"{class_name} {message}"
    return any(token in text for token in ("password", "encrypt", "decrypt", "permission"))


def parse_pdf(file_bytes: bytes, password: Optional[str] = None) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Extracts raw text lines from a PDF file.
    Returns (columns, rows) — columns are fixed, rows contain raw text lines.
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


def parse_pdf_transactions(raw_rows: List[Dict[str, Any]], existing_keys: set) -> List[ImportPreviewRow]:
    """
    Try to extract transaction info from raw PDF lines using heuristics.
    """
    preview_rows: List[ImportPreviewRow] = []

    for idx, row in enumerate(raw_rows):
        line = (row.get("raw_line", "") or "").strip()
        if not line or IGNORE_LINE_PATTERN.search(line):
            continue

        date_match = DATE_PATTERN.search(line)
        # Strip long reference numbers (17+ digits) before amount matching
        # — they appear in international BCI lines and confuse _pick_amount_match
        line_for_amounts = _LONG_REF_RE.sub("", line)
        amount_match = _pick_amount_match(line_for_amounts)
        date_str = date_match.group(1) if date_match else None
        amount_str = amount_match.group(0) if amount_match else None
        description = _clean_description(line, date_str, amount_str)

        if not date_str or not amount_str or len(description) < 2:
            continue

        transaction_type = _infer_transaction_type(line, amount_str)
        amount_val = _parse_amount(amount_str, transaction_type, line)
        if amount_val is None:
            continue

        dedup_key = f"{date_str}|{description}|{abs(amount_val)}"
        is_dup = dedup_key in existing_keys

        intl = _intl_raw_data(line)
        preview_rows.append(
            ImportPreviewRow(
                row_index=idx,
                date=date_str,
                description=description or line[:100],
                amount=amount_val,
                transaction_type=transaction_type,
                is_duplicate=is_dup,
                is_international=intl["is_international"],
                original_currency=intl["original_currency"],
                original_amount=intl["original_amount"],
                raw_data={
                    "raw_line": line,
                    "is_debt": _contains_any(line, DEBT_HINTS),
                    "is_fixed_expense": _contains_any(line, FIXED_HINTS),
                    "is_installment": _is_installment_line(line),
                    "is_international": intl["is_international"],
                    "original_currency": intl["original_currency"],
                    "original_amount": intl["original_amount"],
                },
            )
        )

    return preview_rows


def _pick_amount_match(line: str) -> Optional[re.Match[str]]:
    matches = list(AMOUNT_PATTERN.finditer(line))
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]

    lower_line = line.lower()
    if "saldo" in lower_line and len(matches) >= 2:
        return matches[-2]
    return matches[-1]


def _infer_transaction_type(line: str, amount_str: str) -> str:
    lower = line.lower()
    if _contains_any(lower, TRANSFER_HINTS):
        return "transfer"
    if _contains_any(lower, INCOME_HINTS):
        return "income"
    if _contains_any(lower, EXPENSE_HINTS):
        return "expense"
    if amount_str.strip().startswith("-"):
        return "expense"
    return "expense"


def _parse_cl_number(text: str) -> Optional[float]:
    """
    Parse a Chilean-formatted number where dots are thousands separators
    and comma is the decimal separator (e.g. "1.700.000", "8.990", "1.234,56").
    """
    s = text.replace("$", "").replace(" ", "").strip()
    negative = s.startswith("-")
    clean = s.lstrip("+-")
    has_comma = "," in clean
    dot_count = clean.count(".")

    if has_comma:
        # Format: 1.234,56 or 1234,56 → standard decimal
        clean = clean.replace(".", "").replace(",", ".")
    elif dot_count >= 2:
        # Multiple dots → all thousands separators: 1.700.000 → 1700000
        clean = clean.replace(".", "")
    elif dot_count == 1:
        _, decimal_part = clean.split(".", 1)
        if len(decimal_part) == 3:
            # 3 digits after single dot → thousands separator (e.g. 8.990 → 8990)
            clean = clean.replace(".", "")
        # else: treat dot as decimal point (e.g. 8.99 → 8.99)

    try:
        val = float(clean)
        return -val if negative else val
    except ValueError:
        return None


def _parse_amount(amount_str: str, transaction_type: str, line: str) -> Optional[float]:
    val = _parse_cl_number(amount_str)
    if val is None:
        return None
    value = abs(val)
    lower = line.lower()
    if transaction_type == "income":
        return value
    if transaction_type == "transfer":
        return value if any(token in lower for token in INCOME_HINTS) else -value
    return -value


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def _is_installment_line(line: str) -> bool:
    lower = line.lower()
    # Explicit cuota fraction: "cuota 4/10"
    if re.search(r"cuota\s*\d+\s*/\s*\d+", lower):
        return True
    # BCI-style credit installments always carry an explicit interest rate
    if "tasa int" in lower:
        return True
    return False


def _intl_raw_data(line: str) -> Dict[str, Any]:
    """
    Detect whether this line is an international transaction.
    Returns dict keys: is_international, original_currency, original_amount.
    """
    m = _INTL_TAIL_RE.search(line)
    if not m:
        return {"is_international": False, "original_currency": None, "original_amount": None}

    country = m.group(1).upper()
    currency = COUNTRY_CURRENCY.get(country)
    original_amount: Optional[float] = None
    raw_amount_str = m.group(2)
    if raw_amount_str:
        original_amount = _parse_cl_number(raw_amount_str)

    return {
        "is_international": True,
        "original_currency": currency,
        "original_amount": original_amount,
    }


def _clean_description(line: str, date_str: Optional[str], amount_str: Optional[str]) -> str:
    """Remove date and amount from line to get description."""
    desc = line
    if date_str:
        desc = desc.replace(date_str, "")
    if amount_str:
        desc = desc.replace(amount_str, "")
    desc = re.sub(r"\b(?:cargo|abono|debito|débito|credito|crédito)\b", "", desc, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", desc).strip(" -")

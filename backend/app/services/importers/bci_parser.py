"""
BCI bank statement parser.

Handles both card statement types emitted by Banco BCI (Chile):
  - National (CLP): ESTADO DE CUENTA NACIONAL DE TARJETA DE CRÉDITO
  - International (USD): ESTADO DE CUENTA INTERNACIONAL DE TARJETA DE CRÉDITO

Detection fingerprint: text contains "BCI" or "BANCO BCI" in the first lines,
or the characteristic section header "LUGAR DE FECHA CÓDIGO DESCRIPCIÓN".
"""
import re
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.import_file import ImportPreviewRow

# ── Detection ────────────────────────────────────────────────────────────────

_BCI_FINGERPRINTS = re.compile(
    r"banco\s*bci"
    r"|estado\s+de\s+cuenta\s+(?:nacional|internacional)\s+de\s+tarjeta"
    r"|lugar\s+de\s+fecha\s+c[oó]digo\s+descripci[oó]n",
    re.IGNORECASE,
)


def detect(lines: List[str]) -> bool:
    """Return True if these PDF lines belong to a BCI statement."""
    sample = "\n".join(lines[:60])
    return bool(_BCI_FINGERPRINTS.search(sample))


# ── Shared constants ──────────────────────────────────────────────────────────

INCOME_HINTS = ("abono", "deposito", "depósito", "pago recibido", "remuner", "sueldo", "devolucion", "devolución", "cashback")
TRANSFER_HINTS = ("transferencia", "traspaso", "transf.")
EXPENSE_HINTS = ("compra", "cargo", "pago", "cuota", "debito", "débito", "giro")
DEBT_HINTS = ("cuota", "credito", "crédito", "prestamo", "préstamo", "hipotec", "avance", "rotativo", "pago minimo", "pago mínimo")
FIXED_HINTS = ("mensualidad", "suscripcion", "suscripción", "plan", "arriendo", "dividendo", "seguro", "colegio", "isapre", "gimnasio", "internet", "celular")

# Country code → ISO currency (as printed in BCI international statements)
COUNTRY_CURRENCY: Dict[str, str] = {
    "US": "USD", "MX": "MXN", "PE": "PEN", "BR": "BRL", "AR": "ARS",
    "CO": "COP", "UY": "UYU", "PY": "PYG", "BO": "BOB", "VE": "VES",
    "EC": "USD", "PA": "USD", "CR": "CRC", "CN": "CNY", "GB": "GBP",
    "ES": "EUR", "FR": "EUR", "DE": "EUR", "IT": "EUR", "NL": "EUR",
    "LU": "EUR",
}

_COUNTRY_GROUP = r"US|MX|PE|BR|AR|CO|UY|PY|BO|VE|EC|PA|CR|CN|GB|ES|FR|DE|IT|NL|LU"

# ── Regexes ───────────────────────────────────────────────────────────────────

IGNORE_LINE_RE = re.compile(
    r"cartola|estado de cuenta|fecha\s+descripcion|detalle|pagina|p\u00e1gina"
    r"|per[i\u00ed]odo.{0,25}facturado"
    r"|per[i\u00ed]odo.{0,25}facturaci"
    r"|pr[o\u00f3]ximo.{0,8}per[i\u00ed]odo"
    r"|pagar\s+hasta"
    r"|traspaso\s+deuda"
    r"|realizado\s+us"
    r"|\bus\s+us\b"
    r"|lugar\s+de\s+(?:fecha|operaci)"
    r"|n[u\u00fa]mero\s+referencia"
    r"|moneda\s+origen"
    r"|informaci[o\u00f3]n\s+de\s+(?:pago|transacciones)"
    r"|informaci[o\u00f3]n\s+general"
    r"|cupo\s+total"
    r"|tasa\s+inter[e\u00e9]s\s+vigente"
    r"|vencimiento\s+pr[o\u00f3]ximos"
    r"|costos\s+por\s+atraso"
    r"|evoluci[o\u00f3]n\s+montos"
    r"|pr[o\u00f3]ximo\s+per[i\u00ed]odo\s+de\s+facturaci"
    r"|us\$\d"
    r"|us\$\s*efectivo"
    r"|monto\s+cancelado\s+cheque",
    re.IGNORECASE,
)

TOTAL_LINE_RE = re.compile(
    r"^\s*(total|subtotal|gran\s+total|monto\s+total|suma\s+total)\b"
    r"|\b(total|subtotal)\s*[:\-]"
    r"|\btotal\s+(?:de\s+)?(?:movimientos?|compras?|cargos?|abonos?|deudas?|per[i\u00ed]odo|mes|facturado|facturaci[o\u00f3]n)\b"
    r"|\btotal\s+tarjeta\b"
    r"|\btotal\s+(?:de\s+)?(?:pagos|compras)\b"
    r"|\btotal\s+p[ae]t\b"
    r"|\btotal\s+compras\s+en\s+cuotas\b"
    r"|\bsaldo\s+(?:anterior|final|al\s+\d)"
    r"|\bpago\s+(?:m[i\u00ed]nimo|total|m[a\u00e1]ximo)\s*(?:[\$:\d])"
    r"|\bl[i\u00ed]nea\s+de\s+cr[e\u00e9]dito\b"
    r"|\bmonto\s+(?:facturado|cancelado|m[i\u00ed]nimo|pagado)\b"
    r"|\bsaldo\s+adeudado\b"
    r"|\babono\s+realizado\b"
    r"|^\s*\d+\.\s*(?:total|productos|servicios|cargos|comisiones|impuestos|informaci[o\u00f3]n\s+compras|compras\s+en\s+cuotas)\b",
    re.IGNORECASE,
)

_INSTALLMENT_RE = re.compile(
    r"cuota\s*\d+\s*/\s*\d+"
    r"|(?<!\d)(0)\s*/\s*(\d{2,})(?!\d)"
    r"|(?<!\d)(\d{1,3})\s*/\s*(1[3-9]|[2-9]\d)(?!\d)"
    r"|(?<!\d)(\d{1,2})\s*/\s*(\d{2,3})(?!\d)\s*"
        r"(?:tasa|inter[e\u00e9]s|s/int|c/int|sin\s+int|con\s+int|cuotas?)"
    r"|tasa\s+int",
    re.IGNORECASE,
)
_INSTALLMENT_FRAC_RE = re.compile(r"(?<!\d)(\d{1,3})\s*/\s*(\d{1,3})(?!\d)")
_LONG_REF_RE = re.compile(r"\d{17,}")

# BCI international: DDMM REF22 DD/MM/YY DESCRIPTION CITY COUNTRY MONTO_ORIGEN MONTO_USD
_INTL_LINE_RE = re.compile(
    r"^\s*(\d{4})\s+"
    r"(\d{17,})\s+"
    r"(\d{1,2}/\d{1,2}/\d{2,4})\s+"
    r"(.+?)\s+"
    r"\b(" + _COUNTRY_GROUP + r")\b\s+"
    r"([\d.,]+)\s+"
    r"([\d.,]+)\s*$",
    re.IGNORECASE,
)

# BCI national: [LUGAR] DD/MM/YY DDMM REF DESCRIPTION MONTO MONTO NN/MM VALOR_CUOTA
_NAT_LINE_RE = re.compile(
    r"^(?:[A-Z][A-Z\s.]{1,20}?\s+)?"
    r"(\d{1,2}/\d{1,2}/\d{2,4})\s+"
    r"\d{4}\s+"
    r"\d{5,}\s+"
    r"(.+?)\s+"
    r"\$?(-?[\d.]+(?:,\d+)?)\s+"
    r"\$?-?[\d.]+(?:,\d+)?\s+"
    r"(\d{1,3})/(\d{1,3})\s+"
    r"\$?-?([\d.]+(?:,\d+)?)\s*$",
)


# ── Number parsing ────────────────────────────────────────────────────────────

def parse_cl_number(text: str) -> Optional[float]:
    """Parse a Chilean-formatted number (dot=thousands, comma=decimal)."""
    s = text.replace("$", "").replace(" ", "").strip()
    negative = s.startswith("-")
    clean = s.lstrip("+-")
    has_comma = "," in clean
    dot_count = clean.count(".")
    if has_comma:
        clean = clean.replace(".", "").replace(",", ".")
    elif dot_count >= 2:
        clean = clean.replace(".", "")
    elif dot_count == 1:
        _, dec = clean.split(".", 1)
        if len(dec) == 3:
            clean = clean.replace(".", "")
    try:
        val = float(clean)
        return -val if negative else val
    except ValueError:
        return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _contains_any(text: str, needles: Tuple[str, ...]) -> bool:
    low = text.lower()
    return any(n in low for n in needles)


def _is_total_line(line: str) -> bool:
    return bool(TOTAL_LINE_RE.search(line))


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_transactions(raw_rows: List[Dict[str, Any]], existing_keys: set) -> List[ImportPreviewRow]:
    """
    Parse BCI bank statement lines into ImportPreviewRow objects.
    Handles both national (CLP) and international (USD) sections.
    """
    preview_rows: List[ImportPreviewRow] = []

    for idx, row in enumerate(raw_rows):
        line = (row.get("raw_line", "") or "").strip()
        if not line or IGNORE_LINE_RE.search(line):
            continue
        if _is_total_line(line):
            continue

        # ── International line ────────────────────────────────────────────
        intl_m = _INTL_LINE_RE.match(line)
        if intl_m:
            date_str = intl_m.group(3)
            description = intl_m.group(4).strip()
            country = intl_m.group(5).upper()
            monto_origen = parse_cl_number(intl_m.group(6))
            monto_usd = parse_cl_number(intl_m.group(7))
            currency = COUNTRY_CURRENCY.get(country, "USD")
            if monto_origen is None or monto_usd is None:
                continue
            # amount is always in USD; original shows the merchant-currency figure
            ratio = (monto_origen / monto_usd) if monto_usd else 1
            amount_val = -abs(monto_usd)
            if ratio > 100:
                # MONTO_ORIGEN is CLP (e.g. Apple Chile)
                orig_currency = "CLP"
                orig_amount = monto_origen
            else:
                # MONTO_ORIGEN is merchant currency (MXN, PEN, EUR…)
                orig_currency = currency
                orig_amount = monto_origen
            dedup_key = f"{date_str}|{description}|{abs(amount_val)}"
            preview_rows.append(ImportPreviewRow(
                row_index=idx,
                date=date_str,
                description=description,
                amount=amount_val,
                transaction_type="expense",
                is_duplicate=dedup_key in existing_keys,
                is_international=True,
                original_currency=orig_currency,
                original_amount=orig_amount,
                raw_data={
                    "raw_line": line,
                    "bank": "bci",
                    "is_debt": False,
                    "is_fixed_expense": _contains_any(description, FIXED_HINTS),
                    "is_installment": False,
                    "is_international": True,
                    "original_currency": orig_currency,
                    "original_amount": orig_amount,
                    "usd_amount": monto_usd,
                    "installment_current": None,
                    "installment_total": None,
                    "installment_base_amount": None,
                },
            ))
            continue

        # ── National line ─────────────────────────────────────────────────
        nat_m = _NAT_LINE_RE.match(line)
        if nat_m:
            date_str = nat_m.group(1)
            description = nat_m.group(2).strip()
            monto_op = parse_cl_number(nat_m.group(3))
            inst_cur = int(nat_m.group(4))
            inst_tot = int(nat_m.group(5))
            valor_cuota = parse_cl_number(nat_m.group(6))
            if monto_op is None:
                continue
            if monto_op < 0:
                # abono/refund → income
                amount_val = abs(monto_op)
                installment_info = None
                installment_base = None
            elif inst_cur == 0 and inst_tot >= 2:
                # New purchase: not yet billed. First installment is next month.
                # Store per-installment amount; projection service will schedule N future payments.
                vc = valor_cuota if valor_cuota is not None else abs(monto_op) / inst_tot
                amount_val = -abs(vc)
                installment_info = (0, inst_tot)
                installment_base = abs(vc)
            elif inst_cur > 0 and inst_tot > 1 and valor_cuota is not None:
                amount_val = -abs(valor_cuota)   # use cuota amount, not full price
                installment_info = (inst_cur, inst_tot)
                installment_base = abs(valor_cuota)
            else:
                amount_val = -abs(monto_op)
                installment_info = (inst_cur, inst_tot) if inst_tot >= 2 else None
                installment_base = abs(valor_cuota) if valor_cuota else None
            dedup_key = f"{date_str}|{description}|{abs(amount_val)}"
            transaction_type = "income" if amount_val > 0 else "expense"
            preview_rows.append(ImportPreviewRow(
                row_index=idx,
                date=date_str,
                description=description,
                amount=amount_val,
                transaction_type=transaction_type,
                is_duplicate=dedup_key in existing_keys,
                is_international=False,
                original_currency=None,
                original_amount=None,
                raw_data={
                    "raw_line": line,
                    "bank": "bci",
                    "is_debt": _contains_any(description, DEBT_HINTS),
                    "is_fixed_expense": _contains_any(description, FIXED_HINTS),
                    "is_installment": installment_info is not None,
                    "is_international": False,
                    "original_currency": None,
                    "original_amount": None,
                    "usd_amount": None,
                    "installment_current": installment_info[0] if installment_info else None,
                    "installment_total": installment_info[1] if installment_info else None,
                    "installment_base_amount": installment_base,
                },
            ))
            continue

    return preview_rows

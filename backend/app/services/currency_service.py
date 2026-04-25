"""
Lightweight exchange-rate service.
Uses open.er-api.com (completely free, no API key required).
Rates are cached in-process for 1 hour.
"""
import time
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# In-memory cache
_RATE_CACHE: Dict[str, float] = {}  # currency_code → CLP per 1 unit
_CACHE_TIME: float = 0.0
_CACHE_TTL: float = 3600.0  # 1 hour

SUPPORTED = {
    "USD", "MXN", "PEN", "BRL", "ARS", "EUR", "GBP",
    "COP", "UYU", "CRC", "CNY", "BOB", "PYG",
}


def get_rates_clp() -> Dict[str, float]:
    """
    Returns a dict: currency_code → CLP per 1 unit of that currency.
    E.g. {"USD": 925.0, "MXN": 48.5, "PEN": 247.0, ...}
    """
    global _RATE_CACHE, _CACHE_TIME
    if _RATE_CACHE and (time.time() - _CACHE_TIME) < _CACHE_TTL:
        return dict(_RATE_CACHE)

    fresh = _fetch_rates()
    if fresh:
        _RATE_CACHE = fresh
        _CACHE_TIME = time.time()

    return dict(_RATE_CACHE)


def get_clp_for(amount: float, currency: str) -> Optional[float]:
    """Convert `amount` in `currency` to CLP. Returns None if rate unavailable."""
    if currency.upper() == "CLP":
        return amount
    rates = get_rates_clp()
    rate = rates.get(currency.upper())
    if rate:
        return round(amount * rate, 0)
    return None


def convert_amount(amount: float, from_currency: str, to_currency: str) -> Optional[float]:
    """Convert amount between supported currencies using CLP cross-rates."""
    src = (from_currency or "").upper()
    dst = (to_currency or "").upper()
    if not src or not dst:
        return None
    if src == dst:
        return amount

    rates = get_rates_clp()

    # 1) Convert source -> CLP
    if src == "CLP":
        clp_amount = amount
    else:
        src_rate = rates.get(src)
        if not src_rate or src_rate <= 0:
            return None
        clp_amount = amount * src_rate

    # 2) Convert CLP -> destination
    if dst == "CLP":
        return round(clp_amount, 0)

    dst_rate = rates.get(dst)
    if not dst_rate or dst_rate <= 0:
        return None
    return round(clp_amount / dst_rate, 2)


def _fetch_rates() -> Optional[Dict[str, float]]:
    try:
        import httpx
        resp = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        usd_rates: Dict[str, float] = data.get("rates", {})
        clp_per_usd = usd_rates.get("CLP")
        if not clp_per_usd:
            return None

        # CLP per 1 unit of each currency = (CLP/USD) ÷ (X/USD)
        result: Dict[str, float] = {}
        for code, rate_from_usd in usd_rates.items():
            if rate_from_usd and rate_from_usd > 0:
                result[code] = round(clp_per_usd / rate_from_usd, 4)
        return result
    except Exception as exc:
        logger.warning("Exchange rate fetch failed: %s", exc)
        return None

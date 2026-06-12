"""
Lightweight exchange-rate and Chilean market indicator service.

External data sources:
    - open.er-api.com  -- FX rates (USD base, no API key required)
    - mindicador.cl    -- Chilean official indicators: UF, dolar observado, UTM, etc.

All results are cached in-process to avoid hammering upstream APIs on every
request.  Cache TTLs are short enough to catch intra-day UF updates while
staying well within free-tier rate limits.
"""
import time
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache state
# ---------------------------------------------------------------------------

# FX rates: currency_code -> CLP per 1 unit  (e.g. "USD" -> 950.0)
_fx_rate_cache: Dict[str, float] = {}
_fx_rate_cache_timestamp: float = 0.0
_FX_CACHE_TTL_SECONDS: float = 3600.0  # 1 hour

# Chilean market indicators (UF, USD from mindicador.cl) including previous-day
# values used for trend arrows in the UI (keys: UF, UF_prev, USD, USD_prev).
_market_indicator_cache: Dict[str, float] = {}
_market_indicator_cache_timestamp: float = 0.0
_MARKET_INDICATOR_CACHE_TTL_SECONDS: float = 600.0  # 10 minutes

# Currencies served by this service
SUPPORTED = {
    "USD", "MXN", "PEN", "BRL", "ARS", "EUR", "GBP",
    "COP", "UYU", "CRC", "CNY", "BOB", "PYG",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_market_reference_rates() -> Dict[str, float]:
    """Return current and previous-day CLP values for UF and USD.

    Data is sourced from mindicador.cl and cached for 10 minutes.  The returned
    dict may contain the keys ``UF``, ``UF_prev``, ``USD``, and ``USD_prev``.
    On fetch failure, returns the last known cached values, falling back to the
    open.er-api FX rate for USD when the indicator cache is empty.
    """
    global _market_indicator_cache, _market_indicator_cache_timestamp
    cache_is_valid = (
        _market_indicator_cache
        and (time.time() - _market_indicator_cache_timestamp) < _MARKET_INDICATOR_CACHE_TTL_SECONDS
    )
    if cache_is_valid:
        return dict(_market_indicator_cache)

    fresh_rates = _fetch_market_indicators_from_mindicador()
    if fresh_rates:
        _market_indicator_cache = fresh_rates
        _market_indicator_cache_timestamp = time.time()
        return dict(_market_indicator_cache)

    # Partial fallback: USD from FX API; stale UF from cache if available
    fallback: Dict[str, float] = {}
    usd_from_fx = get_rates_clp().get("USD")
    if usd_from_fx:
        fallback["USD"] = round(float(usd_from_fx), 2)
    if _market_indicator_cache.get("UF"):
        fallback["UF"] = _market_indicator_cache["UF"]
    return fallback


def get_rates_clp() -> Dict[str, float]:
    """Return a mapping of currency_code -> CLP per 1 unit of that currency.

    Example: ``{"USD": 925.0, "MXN": 48.5, "PEN": 247.0, ...}``

    Rates are fetched from open.er-api.com and cached in-process for 1 hour.
    Returns the last successful cache on fetch failure.
    """
    global _fx_rate_cache, _fx_rate_cache_timestamp
    cache_is_valid = (
        _fx_rate_cache
        and (time.time() - _fx_rate_cache_timestamp) < _FX_CACHE_TTL_SECONDS
    )
    if cache_is_valid:
        return dict(_fx_rate_cache)

    fresh_rates = _fetch_fx_rates_from_er_api()
    if fresh_rates:
        _fx_rate_cache = fresh_rates
        _fx_rate_cache_timestamp = time.time()

    return dict(_fx_rate_cache)


def get_clp_for(amount: float, currency: str) -> Optional[float]:
    """Convert *amount* denominated in *currency* to CLP.

    Returns ``None`` when the exchange rate for *currency* is not available.
    """
    if currency.upper() == "CLP":
        return amount
    rate = get_rates_clp().get(currency.upper())
    if rate:
        return round(amount * rate, 0)
    return None


def convert_amount(amount: float, from_currency: str, to_currency: str) -> Optional[float]:
    """Convert *amount* from *from_currency* to *to_currency* via CLP cross-rates.

    Returns ``None`` when either source or destination rate is unavailable.
    """
    source_currency = (from_currency or "").upper()
    target_currency = (to_currency or "").upper()
    if not source_currency or not target_currency:
        return None
    if source_currency == target_currency:
        return amount

    rates = get_rates_clp()

    # Step 1: convert source currency -> CLP
    if source_currency == "CLP":
        amount_in_clp = amount
    else:
        source_rate = rates.get(source_currency)
        if not source_rate or source_rate <= 0:
            return None
        amount_in_clp = amount * source_rate

    # Step 2: convert CLP -> target currency
    if target_currency == "CLP":
        return round(amount_in_clp, 0)

    target_rate = rates.get(target_currency)
    if not target_rate or target_rate <= 0:
        return None
    return round(amount_in_clp / target_rate, 2)


def convert_fixed_amount_to_clp(amount: float, currency: str) -> Optional[float]:
    """Convert a fixed-expense *amount* in *currency* to CLP.

    Handles the common Chilean case where recurring expenses such as mortgage
    dividends are denominated in UF.  Returns ``None`` when the UF rate is
    unavailable.
    """
    normalized_currency = (currency or "CLP").upper()
    if normalized_currency == "CLP":
        return round(float(amount), 0)
    if normalized_currency == "UF":
        indicators = get_market_reference_rates()
        uf_rate = indicators.get("UF")
        if not uf_rate or uf_rate <= 0:
            return None
        return round(float(amount) * float(uf_rate), 0)
    return convert_amount(float(amount), normalized_currency, "CLP")


# ---------------------------------------------------------------------------
# Private: HTTP fetch helpers
# ---------------------------------------------------------------------------

def _fetch_fx_rates_from_er_api() -> Optional[Dict[str, float]]:
    """Fetch USD-based FX rates from open.er-api.com and convert every pair to CLP.

    Returns a mapping ``{currency_code: clp_per_unit}`` or ``None`` on failure.
    """
    try:
        import httpx
        response = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=5.0)
        response.raise_for_status()
        usd_denominated_rates: Dict[str, float] = response.json().get("rates", {})
        clp_per_usd = usd_denominated_rates.get("CLP")
        if not clp_per_usd:
            return None
        # CLP per 1 unit of currency X  =  (CLP/USD) / (X/USD)
        return {
            code: round(clp_per_usd / rate_vs_usd, 4)
            for code, rate_vs_usd in usd_denominated_rates.items()
            if rate_vs_usd and rate_vs_usd > 0
        }
    except Exception as exc:
        logger.warning("FX rate fetch from open.er-api failed: %s", exc)
        return None


def _fetch_uf_series_from_mindicador() -> tuple[Optional[float], Optional[float]]:
    """Fetch the two most recent daily UF values from mindicador.cl.

    Returns ``(today_value, yesterday_value)``.  Either element may be ``None``
    when the upstream call fails or the series is shorter than expected.
    """
    try:
        import httpx
        response = httpx.get("https://mindicador.cl/api/uf", timeout=5.0)
        response.raise_for_status()
        series = response.json().get("serie", [])
        today_uf = float(series[0]["valor"]) if series and isinstance(series[0].get("valor"), (int, float)) else None
        yesterday_uf = float(series[1]["valor"]) if len(series) > 1 and isinstance(series[1].get("valor"), (int, float)) else None
        return today_uf, yesterday_uf
    except Exception as exc:
        logger.warning("UF series fetch from mindicador failed: %s", exc)
        return None, None


def _fetch_usd_series_from_mindicador() -> tuple[Optional[float], Optional[float]]:
    """Fetch the two most recent dolar observado values from mindicador.cl.

    Returns ``(today_value, yesterday_value)``.  Either element may be ``None``
    when the upstream call fails or the series is shorter than expected.
    """
    try:
        import httpx
        response = httpx.get("https://mindicador.cl/api/dolar", timeout=5.0)
        response.raise_for_status()
        series = response.json().get("serie", [])
        today_usd = float(series[0]["valor"]) if series and isinstance(series[0].get("valor"), (int, float)) else None
        yesterday_usd = float(series[1]["valor"]) if len(series) > 1 and isinstance(series[1].get("valor"), (int, float)) else None
        return today_usd, yesterday_usd
    except Exception as exc:
        logger.warning("USD series fetch from mindicador failed: %s", exc)
        return None, None


def _fetch_market_indicators_from_mindicador() -> Optional[Dict[str, float]]:
    """Fetch current and previous-day values for UF and USD from mindicador.cl.

    Returns a dict that may contain ``UF``, ``UF_prev``, ``USD``, ``USD_prev``.
    Returns ``None`` when no indicator value could be retrieved at all.
    """
    result: Dict[str, float] = {}

    today_uf, yesterday_uf = _fetch_uf_series_from_mindicador()
    if today_uf is not None:
        result["UF"] = round(today_uf, 2)
    if yesterday_uf is not None:
        result["UF_prev"] = round(yesterday_uf, 2)

    today_usd, yesterday_usd = _fetch_usd_series_from_mindicador()
    if today_usd is not None:
        result["USD"] = round(today_usd, 2)
    if yesterday_usd is not None:
        result["USD_prev"] = round(yesterday_usd, 2)

    return result or None

from fastapi import APIRouter
from typing import Dict

router = APIRouter(prefix="/exchange-rates", tags=["Exchange Rates"])


@router.get("/", response_model=Dict[str, float])
def get_exchange_rates():
    """
    Returns current exchange rates expressed as CLP per 1 unit of each foreign currency.
    E.g. {"USD": 925.0, "MXN": 48.5, "PEN": 247.0}
    Rates are fetched from open.er-api.com and cached for 1 hour.
    """
    from app.services.currency_service import get_rates_clp, SUPPORTED
    all_rates = get_rates_clp()
    # Only return currencies we care about
    return {k: v for k, v in all_rates.items() if k in SUPPORTED}

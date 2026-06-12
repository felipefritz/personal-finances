from fastapi import APIRouter
from typing import Dict

router = APIRouter(prefix="/exchange-rates", tags=["Exchange Rates"])


@router.get("/", response_model=Dict[str, float])
def get_exchange_rates():
    """
    Returns exchange rates / Chilean market indicators expressed in CLP.
    Includes supported FX rates plus reference values like USD and UF.
    """
    from app.services.currency_service import get_rates_clp, get_market_reference_rates, SUPPORTED

    all_rates = get_rates_clp()
    market_rates = get_market_reference_rates()
    # Only return currencies we care about
    response = {k: v for k, v in all_rates.items() if k in SUPPORTED}
    response.update({k: v for k, v in market_rates.items() if k in {"USD", "UF", "USD_prev", "UF_prev"}})
    return response

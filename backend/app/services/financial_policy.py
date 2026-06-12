"""Shared financial policy helpers used across projection, budgets and savings modules."""

# Keep part of the monthly free cash available for day-to-day use.
MONTHLY_FREE_USE_RESERVE_RATIO = 0.20
MONTHLY_SAVINGS_ALLOCATION_RATIO = 1.0 - MONTHLY_FREE_USE_RESERVE_RATIO


def max_suggested_savings_from_available(available_balance: float) -> float:
    """Max amount that should be auto-allocated to savings in a month."""
    if available_balance <= 0:
        return 0.0
    return round(available_balance * MONTHLY_SAVINGS_ALLOCATION_RATIO, 0)


def suggested_savings_capacity_from_cashflow(avg_monthly_balance: float) -> float:
    """Capacity to fund savings goals from historical monthly net cashflow."""
    if avg_monthly_balance <= 0:
        return 0.0
    return round(avg_monthly_balance * MONTHLY_SAVINGS_ALLOCATION_RATIO, 2)

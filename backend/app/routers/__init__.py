from app.routers.dashboard import router as dashboard_router
from app.routers.accounts import router as accounts_router
from app.routers.transactions import router as transactions_router
from app.routers.categories import router as categories_router
from app.routers.fixed_expenses import router as fixed_expenses_router
from app.routers.savings_goals import router as savings_goals_router
from app.routers.budgets import router as budgets_router
from app.routers.imports import router as imports_router
from app.routers.agent import router as agent_router
from app.routers.bank_connections import router as bank_connections_router
from app.routers.exchange_rates import router as exchange_rates_router
from app.routers.recurring_incomes import router as recurring_incomes_router

__all__ = [
    "dashboard_router",
    "accounts_router",
    "transactions_router",
    "categories_router",
    "fixed_expenses_router",
    "savings_goals_router",
    "budgets_router",
    "imports_router",
    "agent_router",
    "bank_connections_router",
    "exchange_rates_router",
    "recurring_incomes_router",
]

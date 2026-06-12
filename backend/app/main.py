import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_db_and_tables, get_session

# Import all models to register with SQLModel metadata
import app.models  # noqa: F401

from app.routers import (
    dashboard_router,
    accounts_router,
    transactions_router,
    categories_router,
    fixed_expenses_router,
    savings_goals_router,
    budgets_router,
    imports_router,
    bank_connections_router,
    exchange_rates_router,
    recurring_incomes_router,
    projections_router,
)
from app.routers.bank_connections import auto_sync_fintoc_connections_once


logger = logging.getLogger(__name__)


async def _fintoc_auto_sync_loop() -> None:
    """Run Fintoc bank-connection syncs on a recurring background schedule.

    Calls ``auto_sync_fintoc_connections_once`` in a thread pool to avoid
    blocking the event loop, then sleeps for the configured interval.  Errors
    are caught and logged so that one failed cycle does not kill the loop.
    """
    interval_seconds = max(30, int(settings.FINTOC_AUTO_SYNC_INTERVAL_SECONDS or 300))
    while True:
        try:
            summary = await asyncio.to_thread(auto_sync_fintoc_connections_once)
            logger.info("Fintoc auto-sync cycle finished: %s", summary)
        except Exception as exc:
            logger.exception("Fintoc auto-sync cycle failed: %s", exc)
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context: run startup tasks and ensure clean shutdown.

    Startup sequence:
        1. Apply SQLite schema migrations and create missing tables.
        2. Seed initial data when ``SEED_ON_STARTUP`` is enabled.
        3. Launch the Fintoc background sync loop when ``FINTOC_AUTO_SYNC_ENABLED`` is set.

    Shutdown sequence:
        - Cancel the background sync task and await its CancelledError.
    """
    create_db_and_tables()
    auto_sync_task = None

    if settings.SEED_ON_STARTUP:
        from sqlmodel import Session
        from app.core.database import engine
        from app.seeds.initial_data import seed_all
        with Session(engine) as session:
            seed_all(session)

    if settings.FINTOC_AUTO_SYNC_ENABLED:
        auto_sync_task = asyncio.create_task(_fintoc_auto_sync_loop())

    yield
    # Shutdown
    if auto_sync_task:
        auto_sync_task.cancel()
        try:
            await auto_sync_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API para gestión de finanzas personales con agente financiero inteligente.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API prefix
API_PREFIX = "/api/v1"

app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(accounts_router, prefix=API_PREFIX)
app.include_router(transactions_router, prefix=API_PREFIX)
app.include_router(categories_router, prefix=API_PREFIX)
app.include_router(fixed_expenses_router, prefix=API_PREFIX)
app.include_router(savings_goals_router, prefix=API_PREFIX)
app.include_router(budgets_router, prefix=API_PREFIX)
app.include_router(imports_router, prefix=API_PREFIX)
app.include_router(bank_connections_router, prefix=API_PREFIX)
app.include_router(exchange_rates_router, prefix=API_PREFIX)
app.include_router(recurring_incomes_router, prefix=API_PREFIX)
app.include_router(projections_router, prefix=API_PREFIX)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}

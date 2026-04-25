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
    agent_router,
    bank_connections_router,
    exchange_rates_router,
    recurring_incomes_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed initial data
    create_db_and_tables()
    if settings.SEED_ON_STARTUP:
        from sqlmodel import Session
        from app.core.database import engine
        from app.seeds.initial_data import seed_all
        with Session(engine) as session:
            seed_all(session)
    yield
    # Shutdown: nothing to do


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
app.include_router(agent_router, prefix=API_PREFIX)
app.include_router(bank_connections_router, prefix=API_PREFIX)
app.include_router(exchange_rates_router, prefix=API_PREFIX)
app.include_router(recurring_incomes_router, prefix=API_PREFIX)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}

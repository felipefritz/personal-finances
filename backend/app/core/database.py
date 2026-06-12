"""Database engine setup and lightweight schema migrations for SQLite.

Alembic is not used for this project.  Instead, additive ALTER TABLE migrations
are applied in ``create_db_and_tables`` each time the application starts.  Every
migration is guarded by a column-existence check, so running it multiple times
is safe (idempotent).
"""
from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session

from app.core.config import settings
from app.models.fixed_expense import FixedExpense
from app.services.currency_service import get_market_reference_rates


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

_connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    _connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    echo=settings.DEBUG,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_db_and_tables() -> None:
    """Create all SQLModel tables and apply any pending SQLite schema migrations."""
    SQLModel.metadata.create_all(engine)

    if "sqlite" in settings.DATABASE_URL:
        with engine.begin() as conn:
            _migrate_accounts_table(conn)
            _migrate_transactions_table(conn)
            _migrate_import_files_table(conn)
            _migrate_categories_indexes(conn)
            _migrate_fixed_expenses_table(conn)
            _migrate_budgets_table(conn)
            _drop_removed_tables(conn)

        _backfill_mortgage_currency_to_uf()


def get_session():
    """FastAPI dependency that yields a scoped database session."""
    with Session(engine) as session:
        yield session


# ---------------------------------------------------------------------------
# Private: shared migration utilities
# ---------------------------------------------------------------------------

def _existing_columns(conn, table_name: str) -> set[str]:
    """Return the set of column names currently present in *table_name*."""
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def _add_missing_columns(conn, table_name: str, pending: dict[str, str]) -> None:
    """Add each column in *pending* to *table_name* only if it does not already exist.

    Args:
        conn: An active SQLAlchemy connection (inside ``engine.begin()``).
        table_name: Name of the target table.
        pending: Mapping of ``{column_name: column_type_definition}``.
    """
    existing = _existing_columns(conn, table_name)
    for column_name, column_definition in pending.items():
        if column_name not in existing:
            conn.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")
            )


# ---------------------------------------------------------------------------
# Private: per-table migration helpers
# ---------------------------------------------------------------------------

def _migrate_accounts_table(conn) -> None:
    """Add columns introduced after the initial *accounts* table was created."""
    _add_missing_columns(conn, "accounts", {
        "statement_pdf_password": "VARCHAR(255)",
        "card_last_four":         "VARCHAR(4)",
        "card_network":           "VARCHAR(20)",
    })


def _migrate_transactions_table(conn) -> None:
    """Add international-payment and installment columns to *transactions*."""
    _add_missing_columns(conn, "transactions", {
        "is_international":        "BOOLEAN NOT NULL DEFAULT 0",
        "is_paid":                 "BOOLEAN NOT NULL DEFAULT 1",
        "original_amount":         "FLOAT",
        "original_currency":       "VARCHAR(10)",
        "installment_current":     "INTEGER",
        "installment_total":       "INTEGER",
        "installment_base_amount": "REAL",
        "local_amount":            "FLOAT",
    })


def _migrate_import_files_table(conn) -> None:
    """Add period, billing totals, stored-file and import_type columns to *import_files*."""
    _add_missing_columns(conn, "import_files", {
        "period_start":              "DATE",
        "period_end":                "DATE",
        "stored_file_path":          "VARCHAR(500)",
        "statement_month":           "VARCHAR(7)",
        "national_total_clp":        "FLOAT NOT NULL DEFAULT 0",
        "international_total_clp":   "FLOAT NOT NULL DEFAULT 0",
        "international_total_usd":   "FLOAT NOT NULL DEFAULT 0",
        "import_total_clp":          "FLOAT NOT NULL DEFAULT 0",
        "payable_national_clp":      "FLOAT NOT NULL DEFAULT 0",
        "payable_international_clp": "FLOAT NOT NULL DEFAULT 0",
        "payable_total_clp":         "FLOAT NOT NULL DEFAULT 0",
        "statement_credit_limit_clp": "FLOAT",
        "statement_available_credit_clp": "FLOAT",
        "import_type":               "VARCHAR(30) NOT NULL DEFAULT 'estado_cuenta'",
    })


def _migrate_categories_indexes(conn) -> None:
    """Create unique indexes on *categories* to prevent duplicate category names."""
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name_root
        ON categories(name) WHERE parent_id IS NULL
    """))
    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name_within_parent
        ON categories(name, parent_id) WHERE parent_id IS NOT NULL
    """))


def _migrate_fixed_expenses_table(conn) -> None:
    """Add installment-tracking and currency columns to *fixed_expenses*."""
    _add_missing_columns(conn, "fixed_expenses", {
        "start_date":             "DATE",
        "total_installments":     "INTEGER",
        "remaining_installments": "INTEGER",
        "currency":               "VARCHAR(10) NOT NULL DEFAULT 'CLP'",
    })


def _migrate_budgets_table(conn) -> None:
    """Add the *is_recurring* flag introduced after the initial *budgets* table."""
    _add_missing_columns(conn, "budgets", {
        "is_recurring": "BOOLEAN NOT NULL DEFAULT 0",
    })


def _drop_removed_tables(conn) -> None:
    """Drop tables for features removed from the app (only demo/derived data)."""
    for table in ("notifications", "users", "family_accounts"):
        conn.execute(text(f"DROP TABLE IF EXISTS {table}"))


# ---------------------------------------------------------------------------
# Private: one-time data backfill
# ---------------------------------------------------------------------------

def _backfill_mortgage_currency_to_uf() -> None:
    """Convert mortgage fixed expenses stored in CLP to their UF equivalent.

    This is an idempotent data migration that corrects rows created before the
    ``currency`` column was introduced.  It only touches rows where
    ``expense_type == 'dividendo'`` and ``currency == 'CLP'``, rewriting the
    ``expected_amount`` to UF using the current rate from mindicador.cl.
    """
    indicators = get_market_reference_rates()
    uf_rate = indicators.get("UF") if indicators else None
    if not uf_rate or uf_rate <= 0:
        return

    with Session(engine) as session:
        clp_mortgage_items = session.query(FixedExpense).filter(
            FixedExpense.expense_type == "dividendo",
            FixedExpense.currency == "CLP",
        ).all()

        for item in clp_mortgage_items:
            item.expected_amount = round(float(item.expected_amount) / float(uf_rate), 4)
            item.currency = "UF"
            session.add(item)

        if clp_mortgage_items:
            session.commit()

from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)

    # Lightweight migration for local SQLite without Alembic execution.
    if "sqlite" in settings.DATABASE_URL:
        with engine.begin() as conn:
            account_cols = conn.execute(text("PRAGMA table_info(accounts)")).fetchall()
            account_col_names = {c[1] for c in account_cols}
            if "statement_pdf_password" not in account_col_names:
                conn.execute(text("ALTER TABLE accounts ADD COLUMN statement_pdf_password VARCHAR(255)"))

            import_cols = conn.execute(text("PRAGMA table_info(import_files)")).fetchall()
            import_col_names = {c[1] for c in import_cols}
            if "period_start" not in import_col_names:
                conn.execute(text("ALTER TABLE import_files ADD COLUMN period_start DATE"))
            if "period_end" not in import_col_names:
                conn.execute(text("ALTER TABLE import_files ADD COLUMN period_end DATE"))
            if "stored_file_path" not in import_col_names:
                conn.execute(text("ALTER TABLE import_files ADD COLUMN stored_file_path VARCHAR(500)"))

            tx_cols = conn.execute(text("PRAGMA table_info(transactions)")).fetchall()
            tx_col_names = {c[1] for c in tx_cols}
            if "is_international" not in tx_col_names:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN is_international BOOLEAN NOT NULL DEFAULT 0"))
            if "is_paid" not in tx_col_names:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT 1"))
            if "original_amount" not in tx_col_names:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN original_amount FLOAT"))
            if "original_currency" not in tx_col_names:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN original_currency VARCHAR(10)"))


def get_session():
    with Session(engine) as session:
        yield session

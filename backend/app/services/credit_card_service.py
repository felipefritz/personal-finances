from typing import Dict

from sqlmodel import Session, and_, select

from app.models.import_file import ImportFile
from app.models.transaction import Transaction


def _installment_unit_amount(tx: Transaction) -> float:
    """Return per-installment amount in local currency (CLP when available)."""
    if tx.installment_base_amount and tx.installment_base_amount > 0:
        if tx.is_international and tx.local_amount is not None:
            return abs(float(tx.local_amount))
        return abs(float(tx.installment_base_amount))

    if tx.is_international and tx.local_amount is not None:
        return abs(float(tx.local_amount))

    return abs(float(tx.amount or 0.0))


def compute_credit_card_metrics(session: Session, account_id: int) -> Dict[str, float | None]:
    """Compute real-time CC balance including future quota commitment from 0/N rows.

    - base_balance: sum of imported transaction amounts (expenses negative, payments positive)
    - future_installments_commitment: extra reserved credit for 0/N purchases (N-1 installments)
    - computed_balance: base_balance minus future commitment
    """
    latest_statement = session.exec(
        select(ImportFile)
        .where(
            and_(
                ImportFile.account_id == account_id,
                ImportFile.status == "completed",
                ImportFile.import_type == "estado_cuenta",
            )
        )
        .order_by(ImportFile.imported_at.desc())
    ).first()

    txs = session.exec(
        select(Transaction).where(
            and_(
                Transaction.account_id == account_id,
                Transaction.status != "ignored",
            )
        )
    ).all()

    statement_payable = float((latest_statement.payable_total_clp or 0.0)) if latest_statement else 0.0
    if latest_statement and statement_payable > 0:
        # Credit-card payable balance is debt from the statement perspective.
        base_balance = -abs(statement_payable)
    else:
        base_balance = sum(float(tx.amount or 0.0) for tx in txs)

    future_installments_commitment = 0.0

    for tx in txs:
        if tx.transaction_type != "expense":
            continue
        if tx.installment_current != 0:
            continue
        total = int(tx.installment_total or 0)
        if total <= 1:
            continue

        # tx.amount already includes one installment; reserve remaining (N-1).
        unit_amount = _installment_unit_amount(tx)
        future_installments_commitment += unit_amount * (total - 1)

    # When a statement exists, keep statement balance as source of truth for "saldo".
    if latest_statement and statement_payable > 0:
        computed_balance = base_balance
    else:
        computed_balance = base_balance - future_installments_commitment

    statement_credit_limit = None
    statement_available_credit = None
    if latest_statement:
        if latest_statement.statement_credit_limit_clp is not None:
            statement_credit_limit = float(latest_statement.statement_credit_limit_clp)
        if latest_statement.statement_available_credit_clp is not None:
            statement_available_credit = float(latest_statement.statement_available_credit_clp)

    return {
        "base_balance": round(base_balance, 2),
        "future_installments_commitment": round(future_installments_commitment, 2),
        "computed_balance": round(computed_balance, 2),
        "statement_credit_limit": round(statement_credit_limit, 2) if statement_credit_limit is not None else None,
        "statement_available_credit": round(statement_available_credit, 2) if statement_available_credit is not None else None,
    }

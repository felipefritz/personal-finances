import os
import shutil
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, select, and_

from app.core.database import get_session
from app.models.import_file import ImportFile
from app.models.transaction import Transaction
from app.schemas.import_file import (
    ImportConfirmRequest,
    ImportFileRead,
    ImportPreviewResponse,
    ImportPreviewRow,
    ColumnMapping,
)
from app.services.categorization_service import suggest_category
from app.models.category import Category
from app.models.account import Account
from app.services.importers.pdf_postprocess import normalize_pdf_preview_rows

router = APIRouter(prefix="/imports", tags=["Imports"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _describe_exception(exc: Exception) -> str:
    return str(exc).strip() or exc.__class__.__name__


def _is_password_related_error(exc: Exception) -> bool:
    detail = _describe_exception(exc).lower()
    class_name = exc.__class__.__name__.lower()
    text = f"{class_name} {detail}"
    return any(token in text for token in ("password", "encrypt", "decrypt", "permission"))


@router.get("/", response_model=List[ImportFileRead])
def list_imports(session: Session = Depends(get_session)):
    records = session.exec(select(ImportFile).order_by(ImportFile.imported_at.desc())).all()
    return [_enrich_import_file(record, session) for record in records]


@router.post("/upload", response_model=ImportPreviewResponse)
async def upload_file(
    file: UploadFile = File(...),
    account_id: Optional[int] = Form(default=None),
    pdf_password: Optional[str] = Form(default=None),
    save_pdf_password: bool = Form(default=False),
    session: Session = Depends(get_session),
):
    if account_id is None:
        raise HTTPException(status_code=400, detail="Debes asociar el estado de cuenta a una cuenta o tarjeta")

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "xls", "csv", "pdf"):
        raise HTTPException(status_code=400, detail="Formato no soportado. Use .xlsx, .xls, .csv o .pdf")

    file_type = "excel" if ext in ("xlsx", "xls", "csv") else "pdf"

    # Save file
    save_path = os.path.join(UPLOAD_DIR, f"{datetime.utcnow().timestamp()}_{filename}")
    file_bytes = await file.read()
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    # Create import record
    import_record = ImportFile(
        filename=filename,
        file_type=file_type,
        status="pending",
        account_id=account_id,
        stored_file_path=save_path,
    )
    session.add(import_record)
    session.commit()
    session.refresh(import_record)

    # Parse and return preview
    try:
        if file_type == "excel":
            from app.services.importers.excel_importer import parse_excel
            columns, raw_rows = parse_excel(file_bytes)
            existing_keys = _get_existing_keys(session, account_id)
            preview_rows = _auto_map_excel_preview(raw_rows, columns, existing_keys)
        else:
            from app.services.importers.pdf_importer import parse_pdf, parse_pdf_transactions

            account = session.get(Account, account_id) if account_id else None
            effective_password = pdf_password or (account.statement_pdf_password if account else None)

            if save_pdf_password and account and pdf_password:
                account.statement_pdf_password = pdf_password
                session.add(account)
                session.commit()

            columns, raw_rows = parse_pdf(file_bytes, password=effective_password)
            existing_keys = _get_existing_keys(session, account_id)
            preview_rows = parse_pdf_transactions(raw_rows, existing_keys)
            local_currency = (account.currency if account and account.currency else "CLP")
            preview_rows = normalize_pdf_preview_rows(raw_rows, preview_rows, local_currency=local_currency)

        dup_count = sum(1 for r in preview_rows if r.is_duplicate)

        period_start, period_end = _detect_preview_period(preview_rows)
        import_record.period_start = period_start
        import_record.period_end = period_end
        session.add(import_record)
        session.commit()

        return ImportPreviewResponse(
            import_file_id=import_record.id,
            filename=filename,
            file_type=file_type,
            columns=columns,
            preview_rows=preview_rows[:100],
            total_rows=len(preview_rows),
            duplicate_count=dup_count,
        )
    except Exception as e:
        import_record.status = "error"
        import_record.error_message = _describe_exception(e)
        session.add(import_record)
        session.commit()

        if _is_password_related_error(e):
            raise HTTPException(
                status_code=400,
                detail=(
                    "El PDF requiere clave o la clave es incorrecta. "
                    "Ingresa la clave del estado de cuenta en el formulario."
                ),
            )
        raise HTTPException(status_code=422, detail=f"Error al procesar archivo: {_describe_exception(e)}")


@router.post("/{import_id}/confirm")
def confirm_import(
    import_id: int,
    data: ImportConfirmRequest,
    session: Session = Depends(get_session),
):
    """Save preview transactions to the database."""
    import_record = session.get(ImportFile, import_id)
    if not import_record:
        raise HTTPException(status_code=404, detail="Importación no encontrada")

    # Reload file from disk and re-parse
    try:
        save_path = _find_upload_file(import_record.filename)
        with open(save_path, "rb") as f:
            file_bytes = f.read()

        if import_record.file_type == "excel":
            from app.services.importers.excel_importer import parse_excel, build_preview_rows
            columns, raw_rows = parse_excel(file_bytes)
            mapping = data.column_mapping or _auto_detect_mapping(columns)
            existing_keys = _get_existing_keys(session, data.account_id)
            preview_rows = build_preview_rows(raw_rows, mapping, existing_keys)
        else:
            from app.services.importers.pdf_importer import parse_pdf, parse_pdf_transactions
            account = session.get(Account, data.account_id)
            effective_password = data.pdf_password or (account.statement_pdf_password if account else None)
            _, raw_rows = parse_pdf(file_bytes, password=effective_password)
            existing_keys = _get_existing_keys(session, data.account_id)
            preview_rows = parse_pdf_transactions(raw_rows, existing_keys)
            local_currency = (account.currency if account and account.currency else "CLP")
            preview_rows = normalize_pdf_preview_rows(raw_rows, preview_rows, local_currency=local_currency)

        period_start, period_end = _detect_preview_period(preview_rows)

        saved = 0
        skipped = 0
        for row in preview_rows:
            if data.skip_duplicates and row.is_duplicate:
                skipped += 1
                continue
            if not row.date or row.amount is None:
                skipped += 1
                continue

            tx_date = _parse_statement_date(row.date)
            if not tx_date:
                skipped += 1
                continue

            suggestion = suggest_category(row.description or "", row.amount or 0)
            cat_id = None
            if suggestion["category"]:
                cat = session.exec(select(Category).where(Category.name == suggestion["category"])).first()
                if cat:
                    cat_id = cat.id

            raw_data = row.raw_data or {}
            transaction_type = row.transaction_type or suggestion.get("suggested_type") or "expense"

            # Installment metadata from parser
            inst_current = raw_data.get("installment_current")
            inst_total = raw_data.get("installment_total")
            inst_base: Optional[float] = None
            if inst_total and inst_total > 0 and row.amount is not None:
                inst_base = round(abs(row.amount) / inst_total, 2)

            # Unfactured purchase (0/N): mark as pending, not confirmed
            tx_status = "pending" if inst_current == 0 else "confirmed"

            t = Transaction(
                date=tx_date,
                description=row.description or "Sin descripción",
                amount=row.amount,
                transaction_type=transaction_type,
                account_id=data.account_id,
                source=import_record.file_type,
                category_id=cat_id,
                is_ant_expense=suggestion.get("is_ant_expense", False),
                is_fixed_expense=bool(raw_data.get("is_fixed_expense") or suggestion.get("is_fixed_expense")),
                is_debt=bool(raw_data.get("is_debt") or suggestion.get("is_debt") or inst_total is not None),
                is_transfer=transaction_type == "transfer",
                is_international=bool(row.is_international),
                is_paid=inst_current != 0,
                original_amount=row.original_amount,
                original_currency=row.original_currency,
                import_file_id=import_record.id,
                installment_current=inst_current,
                installment_total=inst_total,
                installment_base_amount=inst_base,
                status=tx_status,
            )
            session.add(t)
            saved += 1

        import_record.status = "completed"
        import_record.transaction_count = saved
        import_record.account_id = data.account_id
        import_record.period_start = period_start
        import_record.period_end = period_end
        session.add(import_record)
        session.commit()

        return {"saved": saved, "skipped": skipped, "import_file_id": import_id}
    except HTTPException:
        raise
    except Exception as e:
        import_record.status = "error"
        import_record.error_message = _describe_exception(e)
        session.add(import_record)
        session.commit()

        if _is_password_related_error(e):
            raise HTTPException(
                status_code=400,
                detail=(
                    "El PDF requiere clave o la clave es incorrecta. "
                    "Ingresa la clave del estado de cuenta y vuelve a confirmar."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Error al guardar: {_describe_exception(e)}")


@router.delete("/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_import(import_id: int, session: Session = Depends(get_session)):
    import_record = session.get(ImportFile, import_id)
    if not import_record:
        raise HTTPException(status_code=404, detail="Importación no encontrada")

    related_transactions = session.exec(
        select(Transaction).where(Transaction.import_file_id == import_id)
    ).all()
    for transaction in related_transactions:
        session.delete(transaction)

    stored_path = import_record.stored_file_path
    session.delete(import_record)
    session.commit()

    if stored_path and os.path.exists(stored_path):
        os.remove(stored_path)

    return None


@router.post("/pdf-password")
def set_pdf_password_for_account(
    account_id: int,
    password: str,
    session: Session = Depends(get_session),
):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    if not password.strip():
        raise HTTPException(status_code=400, detail="La clave no puede estar vacía")

    account.statement_pdf_password = password.strip()
    session.add(account)
    session.commit()
    return {"account_id": account_id, "has_password": True}


@router.get("/pdf-password/{account_id}")
def get_pdf_password_status(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return {"account_id": account_id, "has_password": bool(account.statement_pdf_password)}


@router.get("/monthly-summary")
def monthly_import_summary(
    month: int,
    year: int,
    account_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """
    Consolidated monthly summary across multiple imported statements.
    Includes totals, categorization coverage, and top categories.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month debe estar entre 1 y 12")

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    file_query = select(ImportFile).where(ImportFile.status == "completed")
    if account_id:
        file_query = file_query.where(ImportFile.account_id == account_id)

    import_files = session.exec(file_query).all()
    import_file_ids = [f.id for f in import_files if f.id is not None]

    tx_query = select(Transaction).where(
        and_(
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status != "ignored",
            Transaction.import_file_id.is_not(None),
        )
    )
    if account_id:
        tx_query = tx_query.where(Transaction.account_id == account_id)
    if import_file_ids:
        tx_query = tx_query.where(Transaction.import_file_id.in_(import_file_ids))

    transactions = session.exec(tx_query).all()

    income = sum(t.amount for t in transactions if t.transaction_type == "income")
    expenses = sum(abs(t.amount) for t in transactions if t.transaction_type == "expense")
    savings = income - expenses

    categorized = sum(1 for t in transactions if t.category_id is not None)
    uncategorized = len(transactions) - categorized

    category_totals: dict[int, float] = {}
    for t in transactions:
        if t.transaction_type == "expense" and t.category_id:
            category_totals[t.category_id] = category_totals.get(t.category_id, 0.0) + abs(t.amount)

    categories = session.exec(select(Category)).all()
    cat_map = {c.id: c for c in categories}
    top_categories = []
    for cat_id, amount in sorted(category_totals.items(), key=lambda x: -x[1])[:10]:
        cat = cat_map.get(cat_id)
        top_categories.append(
            {
                "category_id": cat_id,
                "category_name": cat.name if cat else "Sin categoría",
                "amount": round(amount, 2),
                "color": (cat.color if cat else None),
            }
        )

    files_in_period = [
        f for f in import_files if f.imported_at.date() >= start and f.imported_at.date() < end
    ]

    return {
        "period": {"month": month, "year": year},
        "account_id": account_id,
        "statement_files_count": len(files_in_period),
        "statement_files": [
            {
                "id": f.id,
                "filename": f.filename,
                "file_type": f.file_type,
                "account_id": f.account_id,
                "account_name": _get_account_name(session, f.account_id),
                "period_start": f.period_start,
                "period_end": f.period_end,
                "period_label": _format_period_label(f.period_start, f.period_end),
                "imported_at": f.imported_at,
                "transaction_count": f.transaction_count,
            }
            for f in sorted(files_in_period, key=lambda x: x.imported_at, reverse=True)
        ],
        "transactions_count": len(transactions),
        "categorized_count": categorized,
        "uncategorized_count": uncategorized,
        "categorization_rate": round((categorized / len(transactions) * 100), 1) if transactions else 0,
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "savings": round(savings, 2),
        "ant_expenses_count": sum(1 for t in transactions if t.is_ant_expense),
        "ant_expenses_amount": round(sum(abs(t.amount) for t in transactions if t.is_ant_expense), 2),
        "top_expense_categories": top_categories,
    }


def _get_existing_keys(session: Session, account_id: Optional[int]) -> set:
    query = select(Transaction)
    if account_id:
        query = query.where(Transaction.account_id == account_id)
    txs = session.exec(query).all()
    return {f"{t.date}|{t.description}|{abs(t.amount)}" for t in txs}


def _auto_map_excel_preview(raw_rows, columns, existing_keys) -> List[ImportPreviewRow]:
    """Try to auto-detect column mapping and build preview."""
    mapping = _auto_detect_mapping(columns)
    from app.services.importers.excel_importer import build_preview_rows
    return build_preview_rows(raw_rows, mapping, existing_keys)


def _auto_detect_mapping(columns: List[str]) -> ColumnMapping:
    """Heuristic column detection for common bank statement formats."""
    cols_lower = {c.lower(): c for c in columns}

    date_col = next((cols_lower[k] for k in cols_lower if any(w in k for w in ["fecha", "date", "fec"])), columns[0] if columns else "fecha")
    desc_col = next((cols_lower[k] for k in cols_lower if any(w in k for w in ["descripcion", "description", "glosa", "detalle", "concepto"])), columns[1] if len(columns) > 1 else "descripcion")
    amount_col = next((cols_lower[k] for k in cols_lower if any(w in k for w in ["monto", "amount", "valor", "importe", "cargo", "abono"])), columns[2] if len(columns) > 2 else "monto")

    return ColumnMapping(date_column=date_col, description_column=desc_col, amount_column=amount_col)


def _find_upload_file(original_filename: str) -> str:
    """Find the most recent upload matching the original filename."""
    for f in sorted(os.listdir(UPLOAD_DIR), reverse=True):
        if f.endswith(original_filename):
            return os.path.join(UPLOAD_DIR, f)
    raise HTTPException(status_code=404, detail="Archivo de importación no encontrado en disco")


def _get_account_name(session: Session, account_id: Optional[int]) -> Optional[str]:
    if not account_id:
        return None
    account = session.get(Account, account_id)
    return account.name if account else None


def _format_period_label(period_start: Optional[date], period_end: Optional[date]) -> Optional[str]:
    if not period_start and not period_end:
        return None
    if period_start and period_end:
        if period_start.year == period_end.year and period_start.month == period_end.month:
            return f"{period_start.month:02d}/{period_start.year}"
        return f"{period_start.strftime('%d/%m/%Y')} - {period_end.strftime('%d/%m/%Y')}"
    single = period_start or period_end
    return single.strftime('%d/%m/%Y') if single else None


def _enrich_import_file(import_record: ImportFile, session: Session) -> ImportFileRead:
    data = import_record.model_dump()
    data["account_name"] = _get_account_name(session, import_record.account_id)
    data["period_label"] = _format_period_label(import_record.period_start, import_record.period_end)
    return ImportFileRead(**data)


def _detect_preview_period(preview_rows: List[ImportPreviewRow]) -> tuple[Optional[date], Optional[date]]:
    parsed_dates = [
        parsed for parsed in (_parse_statement_date(row.date) for row in preview_rows) if parsed is not None
    ]
    if not parsed_dates:
        return None, None
    return min(parsed_dates), max(parsed_dates)


def _parse_statement_date(raw_date: Optional[str]) -> Optional[date]:
    """Parse bank statement dates robustly (dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, etc.)."""
    if not raw_date:
        return None

    text = raw_date.strip()
    if not text:
        return None

    # Remove time if present
    text = text.split(" ")[0]
    text = text.replace(".", "/").replace("-", "/")

    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y/%m/%d", "%Y/%d/%m", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    # Last attempt: native ISO parser
    try:
        return date.fromisoformat(raw_date[:10])
    except Exception:
        return None

import os
import shutil
import re
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


_INSTALLMENT_DESC_RE = re.compile(r"\b(?:cf|cuota)\s*(\d{1,3})\s*[-/]\s*(\d{1,3})\b", re.IGNORECASE)
_INCOME_DESC_RE = re.compile(
    r"\b(abono|deposito|dep[oó]sito|remuneraci[oó]n|sueldo|cashback|devoluci[oó]n|reembolso|pago\s+recibido)\b",
    re.IGNORECASE,
)
_CREDIT_LIMIT_LINE_RE = re.compile(r"\bcupo\s+total\b|\bl[ií]nea\s+de\s+cr[eé]dito\b", re.IGNORECASE)
_AVAILABLE_CREDIT_LINE_RE = re.compile(r"\bcupo\s+disponible\b|\bdisponible\s+para\s+compras\b", re.IGNORECASE)
_MONEY_TOKEN_RE = re.compile(r"\$?\s*-?[\d.]+(?:,\d+)?")


def _extract_installment_from_description(description: str) -> Optional[tuple[int, int]]:
    match = _INSTALLMENT_DESC_RE.search(description or "")
    if not match:
        return None
    current = int(match.group(1))
    total = int(match.group(2))
    if total < 2:
        return None
    if current < 0 or current > total:
        return None
    return current, total


def _looks_like_income_description(description: str) -> bool:
    return bool(_INCOME_DESC_RE.search(description or ""))


def _parse_clp_amount_from_text(text: str) -> Optional[float]:
    cleaned = (text or "").replace("$", "").replace(" ", "").strip()
    if not cleaned:
        return None
    negative = cleaned.startswith("-")
    raw = cleaned.lstrip("+-")
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif raw.count(".") >= 2:
        raw = raw.replace(".", "")
    elif raw.count(".") == 1:
        left, right = raw.split(".", 1)
        if len(right) == 3:
            raw = f"{left}{right}"
    try:
        value = float(raw)
        return -value if negative else value
    except ValueError:
        return None


def _largest_amount_in_line(line: str) -> Optional[float]:
    amounts: List[float] = []
    for token in _MONEY_TOKEN_RE.findall(line or ""):
        parsed = _parse_clp_amount_from_text(token)
        if parsed is not None:
            amounts.append(abs(parsed))
    if not amounts:
        return None
    return max(amounts)


def _extract_statement_credit_metrics(raw_rows: List[dict]) -> dict:
    """Extract statement-level credit metrics from PDF raw lines when present."""
    credit_limit = None
    available_credit = None

    for row in raw_rows:
        line = str(row.get("raw_line") or "").strip()
        if not line:
            continue

        if credit_limit is None and _CREDIT_LIMIT_LINE_RE.search(line):
            amount = _largest_amount_in_line(line)
            if amount is not None:
                credit_limit = amount

        if available_credit is None and _AVAILABLE_CREDIT_LINE_RE.search(line):
            amount = _largest_amount_in_line(line)
            if amount is not None:
                available_credit = amount

    return {
        "statement_credit_limit_clp": round(credit_limit, 2) if credit_limit is not None else None,
        "statement_available_credit_clp": round(available_credit, 2) if available_credit is not None else None,
    }


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
    import_type: Optional[str] = Form(default="estado_cuenta"),
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
        import_type=import_type or "estado_cuenta",
    )
    session.add(import_record)
    session.commit()
    session.refresh(import_record)

    # Parse and return preview
    try:
        if file_type == "excel":
            from app.services.importers.excel_importer import parse_excel

            columns, raw_rows = parse_excel(file_bytes, filename=filename)
            existing_keys = _get_existing_keys(session, account_id)
            account = session.get(Account, account_id) if account_id else None
            local_currency = (account.currency if account and account.currency else "CLP")

            preview_rows = _auto_map_excel_preview(raw_rows, columns, existing_keys)
            statement_credit_metrics = {
                "statement_credit_limit_clp": None,
                "statement_available_credit_clp": None,
            }
        else:
            from app.services.importers.pdf_importer import parse_pdf, parse_pdf_transactions

            account = session.get(Account, account_id) if account_id else None
            effective_password = pdf_password or (account.statement_pdf_password if account else None)

            if save_pdf_password and account and pdf_password:
                account.statement_pdf_password = pdf_password
                session.add(account)
                session.commit()

            columns, raw_rows = parse_pdf(file_bytes, password=effective_password)
            statement_credit_metrics = _extract_statement_credit_metrics(raw_rows)
            existing_keys = _get_existing_keys(session, account_id)
            local_currency = (account.currency if account and account.currency else "CLP")
            preview_rows = parse_pdf_transactions(raw_rows, existing_keys, local_currency=local_currency)
            preview_rows = normalize_pdf_preview_rows(raw_rows, preview_rows, local_currency=local_currency)

        dup_count = sum(1 for r in preview_rows if r.is_duplicate)

        period_start, period_end = _detect_preview_period(preview_rows)
        import_record.period_start = period_start
        import_record.period_end = period_end
        import_record.statement_credit_limit_clp = statement_credit_metrics.get("statement_credit_limit_clp")
        import_record.statement_available_credit_clp = statement_credit_metrics.get("statement_available_credit_clp")
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
        if import_record.stored_file_path and os.path.exists(import_record.stored_file_path):
            save_path = import_record.stored_file_path
        else:
            save_path = _find_upload_file(import_record.filename)
        with open(save_path, "rb") as f:
            file_bytes = f.read()

        if import_record.file_type == "excel":
            from app.services.importers.excel_importer import parse_excel, build_preview_rows

            columns, raw_rows = parse_excel(file_bytes, filename=import_record.filename)
            existing_keys = _get_existing_keys(session, data.account_id)
            account = session.get(Account, data.account_id)
            local_currency = (account.currency if account and account.currency else "CLP")

            mapping = data.column_mapping or _auto_detect_mapping(columns)
            preview_rows = build_preview_rows(raw_rows, mapping, existing_keys)
            statement_credit_metrics = {
                "statement_credit_limit_clp": None,
                "statement_available_credit_clp": None,
            }
        else:
            from app.services.importers.pdf_importer import parse_pdf, parse_pdf_transactions
            account = session.get(Account, data.account_id)
            effective_password = data.pdf_password or (account.statement_pdf_password if account else None)
            _, raw_rows = parse_pdf(file_bytes, password=effective_password)
            statement_credit_metrics = _extract_statement_credit_metrics(raw_rows)
            existing_keys = _get_existing_keys(session, data.account_id)
            local_currency = (account.currency if account and account.currency else "CLP")
            preview_rows = parse_pdf_transactions(raw_rows, existing_keys, local_currency=local_currency)
            preview_rows = normalize_pdf_preview_rows(raw_rows, preview_rows, local_currency=local_currency)

        unselected_count = 0
        if data.selected_row_indices is not None:
            selected_set = {int(idx) for idx in data.selected_row_indices}
            before_count = len(preview_rows)
            preview_rows = [row for row in preview_rows if row.row_index in selected_set]
            unselected_count = before_count - len(preview_rows)

        period_start, period_end = _detect_preview_period(preview_rows)

        # Derive statement_month (YYYY-MM) from period end or start
        ref_date = period_end or period_start
        stmt_month = f"{ref_date.year:04d}-{ref_date.month:02d}" if ref_date else None

        # Duplicate EC check: only enforced for 'estado_cuenta' imports
        effective_import_type = data.import_type or import_record.import_type or "estado_cuenta"
        if stmt_month and data.account_id and effective_import_type == "estado_cuenta":
            existing_import = session.exec(
                select(ImportFile).where(
                    and_(
                        ImportFile.account_id == data.account_id,
                        ImportFile.statement_month == stmt_month,
                        ImportFile.status == "completed",
                        ImportFile.id != import_id,
                        ImportFile.import_type == "estado_cuenta",
                    )
                )
            ).first()
            if existing_import:
                month_label = _format_period_label(existing_import.period_start, existing_import.period_end) or stmt_month
                raise HTTPException(
                    status_code=409,
                    detail=f"Ya existe un estado de cuenta confirmado para {month_label} en esta cuenta (importación #{existing_import.id}). Elimina el anterior antes de volver a importar.",
                )

        saved = 0
        skipped = unselected_count
        national_total_clp = 0.0
        international_total_clp = 0.0
        international_total_usd = 0.0
        payable_national_clp = 0.0
        payable_international_clp = 0.0
        account = session.get(Account, data.account_id)
        # Apply CC-specific income guard for credit card account statements and TC movements
        is_credit_card_account = bool(account and account.account_type == "tarjeta_credito")
        apply_cc_income_guard = is_credit_card_account and effective_import_type in ("estado_cuenta", "movimientos_tc")
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

            description = row.description or "Sin descripción"
            suggestion = suggest_category(description, row.amount or 0)
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
            # Use the per-installment amount stored by the parser (valor_cuota).
            # Do NOT derive it from row.amount/inst_total because row.amount is already
            # the cuota amount after the parser fix — dividing again would be wrong.
            inst_base: Optional[float] = raw_data.get("installment_base_amount") or None

            # Fallback installment detection from description patterns like "CF 02-03".
            parsed_installment = _extract_installment_from_description(description)
            if inst_current is None and inst_total is None and parsed_installment:
                inst_current, inst_total = parsed_installment

            is_installment = inst_total is not None

            # Guardrail: installments are always expense/debt movements.
            if is_installment:
                transaction_type = "expense"
            # For credit-card statements/TC movements, avoid classifying positive purchase rows as income
            # unless they clearly look like real inflows (abono/deposito/etc.).
            elif apply_cc_income_guard and transaction_type == "income" and not _looks_like_income_description(description):
                transaction_type = "expense"

            amount = float(row.amount or 0)
            local_amount = float(row.local_amount if row.local_amount is not None else amount)
            if transaction_type == "expense":
                amount = -abs(amount)
                local_amount = -abs(local_amount)
            elif transaction_type == "income":
                amount = abs(amount)
                local_amount = abs(local_amount)
            elif transaction_type == "transfer":
                amount = abs(amount)
                local_amount = abs(local_amount)

            # Unfactured purchase (0/N): mark as pending, not confirmed
            tx_status = "pending" if inst_current == 0 else "confirmed"

            t = Transaction(
                date=tx_date,
                description=description,
                amount=amount,
                local_amount=local_amount,
                transaction_type=transaction_type,
                account_id=data.account_id,
                source=import_record.file_type,
                category_id=cat_id,
                is_ant_expense=suggestion.get("is_ant_expense", False),
                is_fixed_expense=bool(raw_data.get("is_fixed_expense") or suggestion.get("is_fixed_expense")),
                is_debt=bool(raw_data.get("is_debt") or suggestion.get("is_debt") or is_installment),
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

            is_new_debt = inst_current == 0 and (inst_total or 0) > 1
            if transaction_type != "expense":
                # Import totals represent billed outflows only (not incomes/refunds).
                continue

            if row.is_international:
                usd_amount = row.original_amount if row.original_currency == "USD" and row.original_amount is not None else abs(amount)
                international_total_usd += abs(float(usd_amount))
                international_total_clp += abs(local_amount)
                if not is_new_debt:
                    payable_international_clp += abs(local_amount)
            else:
                national_total_clp += abs(amount)
                if not is_new_debt:
                    payable_national_clp += abs(amount)

        import_record.status = "completed"
        import_record.transaction_count = saved
        import_record.account_id = data.account_id
        import_record.period_start = period_start
        import_record.period_end = period_end
        import_record.statement_month = stmt_month
        import_record.import_type = effective_import_type
        import_record.statement_credit_limit_clp = statement_credit_metrics.get("statement_credit_limit_clp")
        import_record.statement_available_credit_clp = statement_credit_metrics.get("statement_available_credit_clp")
        import_record.national_total_clp = round(national_total_clp, 2)
        import_record.international_total_clp = round(international_total_clp, 2)
        import_record.international_total_usd = round(international_total_usd, 2)
        import_record.import_total_clp = round(national_total_clp + international_total_clp, 2)
        import_record.payable_national_clp = round(payable_national_clp, 2)
        import_record.payable_international_clp = round(payable_international_clp, 2)
        import_record.payable_total_clp = round(payable_national_clp + payable_international_clp, 2)

        if account and is_credit_card_account and effective_import_type == "estado_cuenta":
            statement_limit = import_record.statement_credit_limit_clp
            if statement_limit is not None and statement_limit > 0:
                # Keep TC credit limit aligned with the latest confirmed statement.
                account.balance = float(statement_limit)
                account.updated_at = datetime.utcnow()
                session.add(account)

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

    # Recompute from persisted transactions to keep historical imports consistent
    # even if totals columns were added after those imports were created.
    if import_record.id and import_record.status == "completed":
        totals = _compute_import_totals_from_transactions(session, import_record.id)
        if totals:
            data.update(totals)

    return ImportFileRead(**data)


def _compute_import_totals_from_transactions(session: Session, import_id: int) -> Optional[dict]:
    txs = session.exec(select(Transaction).where(Transaction.import_file_id == import_id)).all()
    if not txs:
        return None

    national_total_clp = 0.0
    international_total_clp = 0.0
    international_total_usd = 0.0
    payable_national_clp = 0.0
    payable_international_clp = 0.0

    for tx in txs:
        if tx.transaction_type != "expense":
            continue
        amount = float(tx.amount or 0)
        local_amount = float(tx.local_amount if tx.local_amount is not None else amount)
        is_new_debt = tx.installment_current == 0 and (tx.installment_total or 0) > 1

        if tx.is_international:
            usd_amount = tx.original_amount if tx.original_currency == "USD" and tx.original_amount is not None else abs(amount)
            international_total_usd += abs(float(usd_amount))
            international_total_clp += abs(local_amount)
            if not is_new_debt:
                payable_international_clp += abs(local_amount)
        else:
            national_total_clp += abs(amount)
            if not is_new_debt:
                payable_national_clp += abs(amount)

    return {
        "national_total_clp": round(national_total_clp, 2),
        "international_total_clp": round(international_total_clp, 2),
        "international_total_usd": round(international_total_usd, 2),
        "import_total_clp": round(national_total_clp + international_total_clp, 2),
        "payable_national_clp": round(payable_national_clp, 2),
        "payable_international_clp": round(payable_international_clp, 2),
        "payable_total_clp": round(payable_national_clp + payable_international_clp, 2),
    }


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

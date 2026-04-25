from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, and_

from app.core.database import get_session
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.budget import (
    BudgetCreate,
    BudgetRead,
    BudgetRecommendationApplyResponse,
    BudgetRecommendationItem,
    BudgetRecommendationResponse,
    BudgetUpdate,
)
from datetime import date

router = APIRouter(prefix="/budgets", tags=["Budgets"])

BASE_RULE_SPLIT = {
    "needs": 0.50,
    "wants": 0.30,
    "savings": 0.20,
}

CATEGORY_RULES = {
    "Vivienda": {"bucket": "needs", "share": 0.18, "rationale": "Mantener estable el costo habitacional."},
    "Servicios": {"bucket": "needs", "share": 0.07, "rationale": "Servicios basicos y cuentas del hogar."},
    "Alimentación": {"bucket": "needs", "share": 0.09, "rationale": "Supermercado y alimentacion base del mes."},
    "Transporte": {"bucket": "needs", "share": 0.05, "rationale": "Bencina, movilizacion y traslados necesarios."},
    "Educación": {"bucket": "needs", "share": 0.04, "rationale": "Colegio, mensualidades y gastos educacionales."},
    "Salud": {"bucket": "needs", "share": 0.04, "rationale": "Salud, farmacia y cobertura medica."},
    "Créditos": {"bucket": "needs", "share": 0.03, "rationale": "Pago ordenado de deudas y creditos."},
    "Compras": {"bucket": "wants", "share": 0.10, "rationale": "Compras discrecionales y vestuario."},
    "Ocio": {"bucket": "wants", "share": 0.08, "rationale": "Salidas, paseos y entretencion."},
    "Viajes": {"bucket": "wants", "share": 0.05, "rationale": "Paseos y viajes planificados."},
    "Suscripciones": {"bucket": "wants", "share": 0.04, "rationale": "Streaming y suscripciones del mes."},
    "Mascotas": {"bucket": "wants", "share": 0.03, "rationale": "Gastos variables de mascotas."},
}


def _compute_actual(budget: Budget, session: Session) -> float:
    start = date(budget.year, budget.month, 1)
    if budget.month == 12:
        end = date(budget.year + 1, 1, 1)
    else:
        end = date(budget.year, budget.month + 1, 1)

    txs = session.exec(
        select(Transaction).where(
            and_(
                Transaction.category_id == budget.category_id,
                Transaction.transaction_type == "expense",
                Transaction.date >= start,
                Transaction.date < end,
                Transaction.status != "ignored",
            )
        )
    ).all()
    return round(sum(abs(t.amount) for t in txs), 2)


def _enrich(b: Budget, session: Session) -> BudgetRead:
    cat = session.get(Category, b.category_id) if b.category_id else None
    actual = _compute_actual(b, session)
    diff = b.expected_amount - actual

    if actual == 0:
        bstatus = "ok"
    elif actual >= b.expected_amount:
        bstatus = "exceeded"
    elif actual >= b.expected_amount * 0.85:
        bstatus = "near_limit"
    else:
        bstatus = "ok"

    data = b.model_dump()
    data["category_name"] = cat.name if cat else None
    data["category_color"] = cat.color if cat else None
    data["actual_amount"] = actual
    data["difference"] = diff
    data["status"] = bstatus
    return BudgetRead(**data)


def _month_range(month: int, year: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def _average_income_last_n_months(session: Session, month: int, year: int, months: int = 3) -> float:
    totals: list[float] = []
    m, y = month, year
    for _ in range(months):
        start, end = _month_range(m, y)
        txs = session.exec(
            select(Transaction).where(
                and_(
                    Transaction.date >= start,
                    Transaction.date < end,
                    Transaction.transaction_type == "income",
                    Transaction.status != "ignored",
                )
            )
        ).all()
        totals.append(sum(abs(t.amount) for t in txs))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return round(sum(totals) / len(totals), 2) if totals else 0.0


def _average_expense_by_category_last_n_months(
    session: Session,
    category_id: int,
    month: int,
    year: int,
    months: int = 3,
) -> float:
    totals: list[float] = []
    m, y = month, year
    for _ in range(months):
        start, end = _month_range(m, y)
        txs = session.exec(
            select(Transaction).where(
                and_(
                    Transaction.category_id == category_id,
                    Transaction.date >= start,
                    Transaction.date < end,
                    Transaction.transaction_type == "expense",
                    Transaction.status != "ignored",
                )
            )
        ).all()
        totals.append(sum(abs(t.amount) for t in txs))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return round(sum(totals) / len(totals), 2) if totals else 0.0


def _build_budget_recommendations(session: Session, month: int, year: int) -> BudgetRecommendationResponse:
    categories = session.exec(select(Category).where(Category.parent_id == None).order_by(Category.name)).all()
    relevant_categories = [c for c in categories if c.name in CATEGORY_RULES]
    avg_income = _average_income_last_n_months(session, month, year)

    existing_budgets = session.exec(
        select(Budget).where(and_(Budget.month == month, Budget.year == year))
    ).all()
    existing_map = {b.category_id: b for b in existing_budgets}

    if avg_income <= 0:
        return BudgetRecommendationResponse(
            strategy_name="Sin datos suficientes",
            month=month,
            year=year,
            avg_monthly_income=0,
            needs_target=0,
            wants_target=0,
            savings_target=0,
            recommended_monthly_saving=0,
            recent_needs_ratio=0,
            insights=["Registra ingresos como sueldo, abonos o transferencias recibidas para obtener presupuestos sugeridos."],
            items=[],
        )

    recent_items: list[dict] = []
    recent_needs_spend = 0.0
    for category in relevant_categories:
        rule = CATEGORY_RULES[category.name]
        recent_avg = _average_expense_by_category_last_n_months(session, category.id, month, year)
        recent_items.append({"category": category, "rule": rule, "recent_avg": recent_avg})
        if rule["bucket"] == "needs":
            recent_needs_spend += recent_avg

    recent_needs_ratio = round((recent_needs_spend / avg_income), 3) if avg_income else 0.0
    needs_ratio = BASE_RULE_SPLIT["needs"]
    wants_ratio = BASE_RULE_SPLIT["wants"]
    savings_ratio = BASE_RULE_SPLIT["savings"]
    strategy_name = "Regla 50/30/20"
    insights = [
        "La recomendacion usa tu ingreso promedio reciente y tus gastos historicos para personalizar la regla financiera.",
    ]

    if recent_needs_ratio > 0.55:
        strategy_name = "Regla ajustada por gastos esenciales"
        needs_ratio = min(max(recent_needs_ratio, 0.55), 0.65)
        savings_ratio = 0.20 if (1 - needs_ratio) >= 0.35 else max(0.10, 1 - needs_ratio - 0.15)
        wants_ratio = max(1 - needs_ratio - savings_ratio, 0.15)
        insights.append(
            f"Tus necesidades estan consumiendo aproximadamente {recent_needs_ratio * 100:.1f}% de tus ingresos, por eso se ajusta la regla base."
        )
    else:
        insights.append("Tus gastos esenciales permiten trabajar con una meta de ahorro cercana al 20% mensual.")

    bucket_targets = {
        "needs": round(avg_income * needs_ratio, 0),
        "wants": round(avg_income * wants_ratio, 0),
        "savings": round(avg_income * savings_ratio, 0),
    }

    raw_recommendations: list[dict] = []
    for item in recent_items:
        category = item["category"]
        rule = item["rule"]
        recent_avg = item["recent_avg"]
        rule_target = avg_income * rule["share"]

        if rule["bucket"] == "needs":
            raw_amount = max(rule_target, recent_avg * 0.95) if recent_avg > 0 else rule_target
        else:
            raw_amount = min(max(rule_target * 0.85, recent_avg * 0.85), rule_target * 1.15) if recent_avg > 0 else rule_target

        raw_recommendations.append(
            {
                "category": category,
                "bucket": rule["bucket"],
                "raw_amount": raw_amount,
                "recent_avg": recent_avg,
                "rationale": rule["rationale"],
            }
        )

    for bucket in ("needs", "wants"):
        bucket_items = [item for item in raw_recommendations if item["bucket"] == bucket]
        bucket_total = sum(item["raw_amount"] for item in bucket_items)
        if bucket_total <= 0:
            continue
        scale = bucket_targets[bucket] / bucket_total
        for item in bucket_items:
            item["recommended_amount"] = round(item["raw_amount"] * scale, 0)

    recommendation_items: list[BudgetRecommendationItem] = []
    for item in raw_recommendations:
        category = item["category"]
        existing = existing_map.get(category.id)
        recommendation_items.append(
            BudgetRecommendationItem(
                category_id=category.id,
                category_name=category.name,
                bucket=item["bucket"],
                recommended_amount=float(item.get("recommended_amount", round(item["raw_amount"], 0))),
                recent_avg_spent=float(item["recent_avg"]),
                current_budget_amount=float(existing.expected_amount if existing else 0),
                rationale=item["rationale"],
            )
        )

    insights.append(
        f"Meta sugerida de ahorro mensual: ${bucket_targets['savings']:,.0f}. Registra ingresos y gastos consistentemente para afinar estas recomendaciones."
    )

    return BudgetRecommendationResponse(
        strategy_name=strategy_name,
        month=month,
        year=year,
        avg_monthly_income=avg_income,
        needs_target=float(bucket_targets["needs"]),
        wants_target=float(bucket_targets["wants"]),
        savings_target=float(bucket_targets["savings"]),
        recommended_monthly_saving=float(bucket_targets["savings"]),
        recent_needs_ratio=round(recent_needs_ratio * 100, 1),
        insights=insights,
        items=recommendation_items,
    )


@router.get("/", response_model=List[BudgetRead])
def list_budgets(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    query = select(Budget)
    if month:
        query = query.where(Budget.month == month)
    if year:
        query = query.where(Budget.year == year)
    budgets = session.exec(query.order_by(Budget.year.desc(), Budget.month.desc())).all()
    return [_enrich(b, session) for b in budgets]


@router.get("/recommendations", response_model=BudgetRecommendationResponse)
def get_budget_recommendations(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    session: Session = Depends(get_session),
):
    return _build_budget_recommendations(session, month, year)


@router.post("/recommendations/apply", response_model=BudgetRecommendationApplyResponse)
def apply_budget_recommendations(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    session: Session = Depends(get_session),
):
    recommendations = _build_budget_recommendations(session, month, year)
    existing = session.exec(select(Budget).where(and_(Budget.month == month, Budget.year == year))).all()
    existing_map = {budget.category_id: budget for budget in existing}

    created = 0
    updated = 0
    skipped = 0
    for item in recommendations.items:
        budget = existing_map.get(item.category_id)
        if budget:
            if round(budget.expected_amount, 0) == round(item.recommended_amount, 0):
                skipped += 1
                continue
            budget.expected_amount = item.recommended_amount
            budget.updated_at = datetime.utcnow()
            session.add(budget)
            updated += 1
        else:
            session.add(
                Budget(
                    month=month,
                    year=year,
                    category_id=item.category_id,
                    expected_amount=item.recommended_amount,
                )
            )
            created += 1

    session.commit()
    return BudgetRecommendationApplyResponse(created=created, updated=updated, skipped=skipped)


@router.post("/", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
def create_budget(data: BudgetCreate, session: Session = Depends(get_session)):
    # Check for duplicate
    existing = session.exec(
        select(Budget).where(
            and_(Budget.month == data.month, Budget.year == data.year, Budget.category_id == data.category_id)
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un presupuesto para esta categoría y período")
    budget = Budget(**data.model_dump())
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _enrich(budget, session)


@router.patch("/{budget_id}", response_model=BudgetRead)
def update_budget(budget_id: int, data: BudgetUpdate, session: Session = Depends(get_session)):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    for key, value in update_data.items():
        setattr(budget, key, value)
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _enrich(budget, session)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, session: Session = Depends(get_session)):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    session.delete(budget)
    session.commit()

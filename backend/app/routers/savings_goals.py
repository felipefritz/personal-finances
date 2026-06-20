import math
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, and_, select

from app.core.database import get_session
from app.models.account import Account
from app.models.savings_goal import SavingsGoal
from app.models.transaction import Transaction
from app.services.allocation_service import reserved_for_goal
from app.services.financial_policy import suggested_savings_capacity_from_cashflow
from app.schemas.savings_goal import (
    SavingsGoalCreate,
    SavingsDistributionAccountItem,
    SavingsAnnualProjectionMonth,
    SavingsAnnualProjectionResponse,
    SavingsDistributionGoalItem,
    SavingsDistributionResponse,
    SavingsGoalPlanRequest,
    SavingsGoalPlanResponse,
    SavingsGoalRead,
    SavingsGoalUpdate,
)

router = APIRouter(prefix="/savings-goals", tags=["Savings Goals"])


def _add_months(base: date, months: int) -> date:
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    return date(year, month, 1)


def _months_between(today: date, target: date) -> int:
    return max((target.year - today.year) * 12 + (target.month - today.month), 1)


def _monthly_net_capacity(session: Session, months: int = 3) -> float:
    today = date.today()
    month = today.month
    year = today.year
    balances: list[float] = []

    for _ in range(months):
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        txs = session.exec(
            select(Transaction).where(
                and_(
                    Transaction.date >= start,
                    Transaction.date < end,
                    Transaction.status != "ignored",
                )
            )
        ).all()
        income = sum(t.amount for t in txs if t.transaction_type == "income")
        expenses = sum(abs(t.amount) for t in txs if t.transaction_type == "expense")
        balances.append(income - expenses)

        month -= 1
        if month == 0:
            month = 12
            year -= 1

    if not balances:
        return 0.0

    avg_balance = max(sum(balances) / len(balances), 0)
    return suggested_savings_capacity_from_cashflow(avg_balance)


def _other_goals_commitment(goals: list[SavingsGoal], current_goal_id: Optional[int] = None) -> float:
    today = date.today()
    monthly = 0.0
    for g in goals:
        if g.status != "active":
            continue
        if current_goal_id and g.id == current_goal_id:
            continue

        remaining = max(g.target_amount - g.current_amount, 0)
        if remaining <= 0:
            continue

        if g.target_date and g.target_date > today:
            monthly += remaining / _months_between(today, g.target_date)
        else:
            monthly += remaining * 0.05

    return round(monthly, 2)


def _monthly_needed_for_goal(goal: SavingsGoal, today: date) -> float:
    remaining = max(goal.target_amount - goal.current_amount, 0)
    if remaining <= 0:
        return 0.0
    if goal.target_date and goal.target_date > today:
        return round(remaining / _months_between(today, goal.target_date), 2)
    return round(remaining * 0.05, 2)


def _distribute_amount(total_budget: float, weights: list[float]) -> list[float]:
    if total_budget <= 0 or not weights:
        return [0.0 for _ in weights]

    safe_weights = [max(w, 0.0) for w in weights]
    sum_weights = sum(safe_weights)
    if sum_weights <= 0:
        even = round(total_budget / len(weights), 2)
        result = [even for _ in weights]
        result[0] += round(total_budget - sum(result), 2)
        return result

    result = [round(total_budget * (w / sum_weights), 2) for w in safe_weights]
    delta = round(total_budget - sum(result), 2)
    if result:
        result[0] = round(result[0] + delta, 2)
    return result


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _iterate_months(start: date, end: date) -> list[date]:
    months: list[date] = []
    cursor = _month_start(start)
    target = _month_start(end)
    while cursor <= target:
        months.append(cursor)
        cursor = _add_months(cursor, 1)
    return months


def _build_plan(goal: SavingsGoal, session: Session) -> dict:
    today = date.today()
    remaining = max(goal.target_amount - goal.current_amount, 0)

    active_goals = session.exec(select(SavingsGoal).where(SavingsGoal.status == "active")).all()
    active_accounts = session.exec(select(Account).where(Account.is_active == True)).all()
    liquid_balance = round(sum(max(a.balance, 0) for a in active_accounts), 2)

    raw_commitment_others = _other_goals_commitment(active_goals, current_goal_id=goal.id)
    gross_capacity = _monthly_net_capacity(session)
    if gross_capacity <= 0 and liquid_balance > 0:
        # If there is no reliable cashflow history, infer a conservative monthly capacity from liquid balances.
        gross_capacity = round(liquid_balance * 0.02, 2)

    # Cap commitments from other goals to avoid fully blocking new plans when one objective is extremely aggressive.
    commitment_others = round(min(raw_commitment_others, gross_capacity * 0.6), 2)
    available_monthly = round(max(gross_capacity - commitment_others, 0), 2)

    monthly_needed = None
    if goal.target_date and goal.status == "active" and remaining > 0:
        monthly_needed = round(remaining / _months_between(today, goal.target_date), 0)

    if remaining <= 0 or goal.status == "completed":
        return {
            "monthly_needed": 0,
            "suggested_monthly_contribution": 0,
            "estimated_months_to_target": 0,
            "estimated_target_date": today,
            "feasibility_status": "completed",
            "available_monthly_savings": available_monthly,
            "other_goals_monthly_commitment": commitment_others,
            "available_liquid_balance": liquid_balance,
        }

    if monthly_needed is not None:
        if available_monthly >= monthly_needed:
            suggested_monthly = monthly_needed
            status = "on_track"
        elif available_monthly > 0:
            suggested_monthly = available_monthly
            status = "tight"
        else:
            suggested_monthly = 0
            status = "unfunded"
    else:
        suggested_monthly = available_monthly if available_monthly > 0 else round(max(remaining * 0.03, 0), 0)
        status = "planned" if suggested_monthly > 0 else "unfunded"

    if suggested_monthly <= 0:
        return {
            "monthly_needed": monthly_needed,
            "suggested_monthly_contribution": 0,
            "estimated_months_to_target": None,
            "estimated_target_date": None,
            "feasibility_status": status,
            "available_monthly_savings": available_monthly,
            "other_goals_monthly_commitment": commitment_others,
            "available_liquid_balance": liquid_balance,
        }

    estimated_months = max(math.ceil(remaining / suggested_monthly), 1)
    estimated_target_date = _add_months(today, estimated_months)

    return {
        "monthly_needed": monthly_needed,
        "suggested_monthly_contribution": round(suggested_monthly, 0),
        "estimated_months_to_target": estimated_months,
        "estimated_target_date": estimated_target_date,
        "feasibility_status": status,
        "available_monthly_savings": available_monthly,
        "other_goals_monthly_commitment": commitment_others,
        "available_liquid_balance": liquid_balance,
    }


def _enrich(goal: SavingsGoal, session: Session) -> SavingsGoalRead:
    data = goal.model_dump()
    target = goal.target_amount or 1
    data["progress_percent"] = round(min((goal.current_amount / target) * 100, 100), 1)
    data.update(_build_plan(goal, session))
    reserved = reserved_for_goal(session, goal.id or 0)
    data["reserved_amount"] = reserved
    data["total_available_amount"] = round(float(goal.current_amount or 0) + reserved, 2)
    data["remaining_after_reserved"] = round(max(float(goal.target_amount or 0) - data["total_available_amount"], 0), 2)
    return SavingsGoalRead(**data)


@router.get("/", response_model=List[SavingsGoalRead])
def list_savings_goals(session: Session = Depends(get_session)):
    goals = session.exec(select(SavingsGoal).order_by(SavingsGoal.priority)).all()
    return [_enrich(g, session) for g in goals]


@router.get("/distribution-plan", response_model=SavingsDistributionResponse)
def get_savings_distribution_plan(session: Session = Depends(get_session)):
    """
    Suggests a monthly savings distribution between active savings goals and
    active savings-oriented accounts.
    """
    today = date.today()

    goals = session.exec(
        select(SavingsGoal).where(SavingsGoal.status == "active").order_by(SavingsGoal.priority)
    ).all()
    goals = [g for g in goals if max(g.target_amount - g.current_amount, 0) > 0]

    savings_accounts = session.exec(
        select(Account).where(
            and_(
                Account.is_active == True,
                Account.account_type.in_(["ahorro", "inversion", "efectivo"]),
            )
        )
    ).all()

    projected_monthly = _monthly_net_capacity(session)
    liquid_balance = round(sum(max(a.balance, 0) for a in savings_accounts), 2)
    if projected_monthly <= 0 and liquid_balance > 0:
        # Conservative fallback: suggest moving 1% of current liquid savings per month.
        projected_monthly = round(liquid_balance * 0.01, 2)

    if projected_monthly <= 0:
        projected_monthly = 0.0

    has_goals = len(goals) > 0
    has_accounts = len(savings_accounts) > 0

    goals_budget = round(projected_monthly * 0.7, 2) if has_goals else 0.0
    accounts_budget = round(projected_monthly - goals_budget, 2) if has_accounts else 0.0

    # If one side does not exist, send the full amount to the existing side.
    if has_goals and not has_accounts:
        goals_budget = projected_monthly
        accounts_budget = 0.0
    elif has_accounts and not has_goals:
        goals_budget = 0.0
        accounts_budget = projected_monthly

    goal_items: list[SavingsDistributionGoalItem] = []
    if has_goals:
        weights: list[float] = []
        monthly_needs: list[float] = []

        for g in goals:
            need = _monthly_needed_for_goal(g, today)
            remaining = max(g.target_amount - g.current_amount, 0)
            priority_weight = max(1, 6 - int(g.priority or 3))
            if g.target_date and g.target_date > today:
                months_left = _months_between(today, g.target_date)
                urgency_weight = min(2.0, max(1.0, 12 / months_left))
            else:
                urgency_weight = 1.0

            monthly_needs.append(need)
            weights.append(max(need, 1.0) * priority_weight * urgency_weight)

        suggested_amounts = _distribute_amount(goals_budget, weights)
        for idx, g in enumerate(goals):
            remaining = round(max(g.target_amount - g.current_amount, 0), 2)
            suggested = round(min(suggested_amounts[idx], remaining), 2)
            need = monthly_needs[idx]
            feasibility = "on_track" if suggested >= need and need > 0 else "tight" if suggested > 0 else "unfunded"
            goal_items.append(
                SavingsDistributionGoalItem(
                    goal_id=g.id,
                    goal_name=g.name,
                    priority=g.priority,
                    target_date=g.target_date,
                    remaining_amount=remaining,
                    suggested_monthly_amount=suggested,
                    monthly_needed=need,
                    feasibility=feasibility,
                )
            )

        goals_budget = round(sum(item.suggested_monthly_amount for item in goal_items), 2)

    account_items: list[SavingsDistributionAccountItem] = []
    if has_accounts:
        # Prefer reinforcing accounts with lower balances by using inverse-balance weights.
        weights = [1.0 / (max(a.balance, 0) + 1.0) for a in savings_accounts]
        suggested_amounts = _distribute_amount(accounts_budget, weights)
        for idx, account in enumerate(savings_accounts):
            account_items.append(
                SavingsDistributionAccountItem(
                    account_id=account.id,
                    account_name=account.name,
                    account_type=account.account_type,
                    current_balance=round(account.balance, 2),
                    suggested_monthly_amount=round(max(suggested_amounts[idx], 0), 2),
                )
            )

        accounts_budget = round(sum(item.suggested_monthly_amount for item in account_items), 2)

    recommendations: list[str] = []
    if projected_monthly <= 0:
        recommendations.append("No hay ahorro mensual proyectado positivo. Revisa ingresos/gastos para liberar capacidad.")
    if not has_accounts:
        recommendations.append("No tienes cuentas tipo ahorro/inversion/efectivo activas para distribuir el ahorro por cuenta.")
    if not has_goals:
        recommendations.append("No tienes objetivos de ahorro activos. Crea una meta para asignar parte del ahorro automaticamente.")
    if projected_monthly > 0 and has_goals and has_accounts:
        recommendations.append("Regla sugerida: 70% del ahorro mensual a objetivos y 30% a fortalecer cuentas de ahorro liquidas.")

    return SavingsDistributionResponse(
        projected_monthly_savings=round(projected_monthly, 2),
        distribution_to_goals=round(goals_budget, 2),
        distribution_to_accounts=round(accounts_budget, 2),
        goals=goal_items,
        savings_accounts=account_items,
        recommendations=recommendations,
    )


@router.get("/annual-projection", response_model=SavingsAnnualProjectionResponse)
def get_savings_annual_projection(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
):
    today = date.today()
    start = start_date or date(today.year, 1, 1)
    end = end_date or date(today.year, 12, 31)

    if start > end:
        raise HTTPException(status_code=400, detail="start_date no puede ser mayor a end_date")

    month_marks = _iterate_months(start, end)
    if len(month_marks) > 24:
        raise HTTPException(status_code=400, detail="El rango maximo permitido es de 24 meses")

    plan = get_savings_distribution_plan(session)

    cumulative = 0.0
    months: list[SavingsAnnualProjectionMonth] = []
    for mark in month_marks:
        cumulative = round(cumulative + plan.projected_monthly_savings, 2)
        months.append(
            SavingsAnnualProjectionMonth(
                period=f"{mark.year:04d}-{mark.month:02d}",
                projected_savings=plan.projected_monthly_savings,
                to_goals=plan.distribution_to_goals,
                to_accounts=plan.distribution_to_accounts,
                cumulative_savings=cumulative,
            )
        )

    return SavingsAnnualProjectionResponse(
        start_date=start,
        end_date=end,
        months=months,
        total_projected_savings=round(sum(m.projected_savings for m in months), 2),
        total_to_goals=round(sum(m.to_goals for m in months), 2),
        total_to_accounts=round(sum(m.to_accounts for m in months), 2),
    )


@router.get("/{goal_id}", response_model=SavingsGoalRead)
def get_savings_goal(goal_id: int, session: Session = Depends(get_session)):
    goal = session.get(SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    return _enrich(goal, session)


@router.post("/plan", response_model=SavingsGoalPlanResponse)
def simulate_goal_plan(data: SavingsGoalPlanRequest, session: Session = Depends(get_session)):
    simulated_goal = SavingsGoal(**data.model_dump())
    plan = _build_plan(simulated_goal, session)

    target_date_text = (
        plan["estimated_target_date"].isoformat() if plan.get("estimated_target_date") else "sin fecha estimada"
    )
    message = (
        f"Para este objetivo deberias ahorrar aproximadamente ${plan['suggested_monthly_contribution']:,.0f} al mes "
        f"y llegarias en {plan.get('estimated_months_to_target') or 'N/A'} meses ({target_date_text})."
    )

    return SavingsGoalPlanResponse(**plan, message=message)


@router.post("/", response_model=SavingsGoalRead, status_code=status.HTTP_201_CREATED)
def create_savings_goal(data: SavingsGoalCreate, session: Session = Depends(get_session)):
    goal = SavingsGoal(**data.model_dump())
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _enrich(goal, session)


@router.patch("/{goal_id}", response_model=SavingsGoalRead)
def update_savings_goal(goal_id: int, data: SavingsGoalUpdate, session: Session = Depends(get_session)):
    goal = session.get(SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    for key, value in update_data.items():
        setattr(goal, key, value)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _enrich(goal, session)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_savings_goal(goal_id: int, session: Session = Depends(get_session)):
    goal = session.get(SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    session.delete(goal)
    session.commit()


@router.post("/{goal_id}/contribute")
def contribute_to_goal(goal_id: int, amount: float, session: Session = Depends(get_session)):
    """Add savings contribution to a goal."""
    goal = session.get(SavingsGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    goal.current_amount = min(goal.current_amount + amount, goal.target_amount)
    if goal.current_amount >= goal.target_amount:
        goal.status = "completed"
    goal.updated_at = datetime.utcnow()
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _enrich(goal, session)

import math
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, and_, select

from app.core.database import get_session
from app.models.account import Account
from app.models.savings_goal import SavingsGoal
from app.models.transaction import Transaction
from app.schemas.savings_goal import (
    SavingsGoalCreate,
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

    # Keep 20% operational buffer and suggest using 80% of average monthly free cashflow.
    return round(max(sum(balances) / len(balances), 0) * 0.8, 2)


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
    return SavingsGoalRead(**data)


@router.get("/", response_model=List[SavingsGoalRead])
def list_savings_goals(session: Session = Depends(get_session)):
    goals = session.exec(select(SavingsGoal).order_by(SavingsGoal.priority)).all()
    return [_enrich(g, session) for g in goals]


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

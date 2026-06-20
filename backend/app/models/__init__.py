# Import all models here so SQLModel registers them in metadata.
# Order matters: referenced tables must appear before tables with FKs.
from app.models.user import User
from app.models.account import Account
from app.models.category import Category
from app.models.import_file import ImportFile
from app.models.fixed_expense import FixedExpense
from app.models.transaction import Transaction
from app.models.savings_goal import SavingsGoal
from app.models.budget import Budget
from app.models.bank_connection import BankConnection
from app.models.recurring_income import RecurringIncome
from app.models.money_allocation import MoneyAllocation

__all__ = [
    "Account",
    "User",
    "Category",
    "ImportFile",
    "FixedExpense",
    "Transaction",
    "SavingsGoal",
    "Budget",
    "BankConnection",
    "RecurringIncome",
    "MoneyAllocation",
]

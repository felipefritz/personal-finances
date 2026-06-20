import type {
  Account,
  AccountCreate,
  AuthToken,
  Budget,
  BudgetCreate,
  Category,
  FixedExpense,
  FixedExpenseCreate,
  HomeSummary,
  ProjectionMonth,
  RecurringIncome,
  RecurringIncomeCreate,
  SavingsGoal,
  SavingsGoalCreate,
  Transaction,
  TransactionCreate,
  User,
} from '../types';

const defaultApiUrl = 'http://localhost:8000/api/v1';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, '');

type ApiOptions = {
  token?: string | null;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : 'No se pudo completar la solicitud';
    throw new Error(detail);
  }

  return payload as T;
}

export const api = {
  login(email: string, password: string) {
    return request<AuthToken>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  },
  register(email: string, password: string, fullName: string) {
    return request<AuthToken>('/auth/register', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    });
  },
  me(token: string) {
    return request<User>('/auth/me', { token });
  },
  home(token: string) {
    return request<HomeSummary>('/mobile/home', { token });
  },
  accounts(token: string) {
    return request<Account[]>('/mobile/accounts', { token });
  },
  createAccount(token: string, body: AccountCreate) {
    return request<Account>('/mobile/accounts', {
      token,
      method: 'POST',
      body,
    });
  },
  categories(token: string) {
    return request<Category[]>('/mobile/categories', { token });
  },
  transactions(token: string) {
    return request<Transaction[]>('/mobile/transactions', { token });
  },
  createTransaction(token: string, body: TransactionCreate) {
    return request<Transaction>('/mobile/transactions', {
      token,
      method: 'POST',
      body,
    });
  },
  budgets(token: string) {
    return request<Budget[]>('/mobile/budgets', { token });
  },
  createBudget(token: string, body: BudgetCreate) {
    return request<Budget>('/mobile/budgets', {
      token,
      method: 'POST',
      body,
    });
  },
  recurringIncomes(token: string) {
    return request<RecurringIncome[]>('/mobile/recurring-incomes', { token });
  },
  createRecurringIncome(token: string, body: RecurringIncomeCreate) {
    return request<RecurringIncome>('/mobile/recurring-incomes', {
      token,
      method: 'POST',
      body,
    });
  },
  fixedExpenses(token: string) {
    return request<FixedExpense[]>('/mobile/fixed-expenses', { token });
  },
  createFixedExpense(token: string, body: FixedExpenseCreate) {
    return request<FixedExpense>('/mobile/fixed-expenses', {
      token,
      method: 'POST',
      body,
    });
  },
  savingsGoals(token: string) {
    return request<SavingsGoal[]>('/mobile/savings-goals', { token });
  },
  createSavingsGoal(token: string, body: SavingsGoalCreate) {
    return request<SavingsGoal>('/mobile/savings-goals', {
      token,
      method: 'POST',
      body,
    });
  },
  projection(token: string) {
    return request<ProjectionMonth[]>('/mobile/projection', { token });
  },
};

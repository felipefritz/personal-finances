export type User = {
  id: number;
  email: string;
  full_name?: string | null;
  is_active: boolean;
};

export type AuthToken = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Account = {
  id: number;
  name: string;
  bank?: string | null;
  account_type: string;
  balance: number;
  currency: string;
  free_balance?: number | null;
  credit_limit?: number | null;
  available_credit?: number | null;
  card_last_four?: string | null;
  card_network?: string | null;
};

export type AccountCreate = {
  name: string;
  account_type: string;
  balance: number;
  bank?: string | null;
  currency?: string;
  card_last_four?: string | null;
  card_network?: string | null;
};

export type Category = {
  id: number;
  name: string;
  color?: string | null;
  parent_id?: number | null;
};

export type Transaction = {
  id: number;
  description: string;
  amount: number;
  date: string;
  transaction_type: string;
  category_id?: number | null;
  category_name?: string | null;
  category_color?: string | null;
  account_id?: number | null;
  account_name?: string | null;
  is_paid: boolean;
  status: string;
};

export type TransactionCreate = {
  description: string;
  amount: number;
  date: string;
  transaction_type: 'income' | 'expense';
  account_id?: number | null;
  category_id?: number | null;
  is_paid?: boolean;
};

export type Budget = {
  id: number;
  category_id: number;
  category_name: string;
  category_color?: string | null;
  expected_amount: number;
  actual_amount: number;
  reserved_amount: number;
  free_to_spend: number;
  status: string;
};

export type BudgetCreate = {
  month: number;
  year: number;
  category_id: number;
  expected_amount: number;
  is_recurring?: boolean;
};

export type RecurringIncome = {
  id: number;
  name: string;
  amount: number;
  income_type: string;
  day_of_month?: number | null;
  account_id?: number | null;
  account_name?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  last_applied_date?: string | null;
  is_active: boolean;
};

export type RecurringIncomeCreate = {
  name: string;
  amount: number;
  income_type: string;
  day_of_month?: number | null;
  account_id?: number | null;
  category_id?: number | null;
};

export type FixedExpense = {
  id: number;
  name: string;
  expected_amount: number;
  currency: string;
  expense_type: string;
  payment_day?: number | null;
  account_id?: number | null;
  account_name?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  remaining_installments?: number | null;
  total_installments?: number | null;
  is_active: boolean;
};

export type FixedExpenseCreate = {
  name: string;
  expected_amount: number;
  currency?: string;
  expense_type: string;
  payment_day?: number | null;
  account_id?: number | null;
  category_id?: number | null;
  total_installments?: number | null;
  remaining_installments?: number | null;
  amount_mode?: 'monthly' | 'total';
};

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  progress_percent: number;
  target_date?: string | null;
  priority: number;
  status: string;
  description?: string | null;
};

export type SavingsGoalCreate = {
  name: string;
  target_amount: number;
  current_amount?: number;
  target_date?: string | null;
  priority?: number;
  description?: string | null;
};

export type ProjectionMonth = {
  month: number;
  label: string;
  total_income: number;
  total_expenses: number;
  available_balance: number;
  total_suggested_savings: number;
  net_balance: number;
};

export type HomeSummary = {
  month: number;
  year: number;
  accounts: Account[];
  budgets: Budget[];
  recent_transactions: Transaction[];
  projection: ProjectionMonth[];
  total_balance: number;
  free_balance: number;
  total_income: number;
  total_expenses: number;
  available_balance: number;
  suggested_savings: number;
  net_balance: number;
};

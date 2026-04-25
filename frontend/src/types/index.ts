// ============================================================
// Shared TypeScript types for the Finanzas Personales app
// ============================================================

export interface Account {
  id: number;
  name: string;
  bank?: string;
  account_type: string;
  balance: number;
  currency: string;
  is_active: boolean;
  source: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  color?: string;
  icon?: string;
  is_system: boolean;
  created_at: string;
  children?: Category[];
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  transaction_type: 'income' | 'expense' | 'transfer';
  category_id?: number;
  subcategory_id?: number;
  account_id?: number;
  source: string;
  is_fixed_expense: boolean;
  is_ant_expense: boolean;
  is_transfer: boolean;
  is_debt: boolean;
  is_international: boolean;
  is_paid: boolean;
  original_amount?: number;
  original_currency?: string;
  comment?: string;
  tags?: string;
  status: string;
  fixed_expense_id?: number;
  import_file_id?: number;
  category_name?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionListResponse {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TransactionFilters {
  page?: number;
  page_size?: number;
  date_from?: string;
  date_to?: string;
  account_id?: number;
  category_id?: number;
  transaction_type?: string;
  source?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  is_fixed_expense?: boolean;
  is_ant_expense?: boolean;
  status?: string;
}

export interface FixedExpense {
  id: number;
  name: string;
  category_id?: number;
  expected_amount: number;
  payment_day?: number;
  account_id?: number;
  is_active: boolean;
  expense_type: string;
  category_name?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export interface RecurringIncome {
  id: number;
  name: string;
  amount: number;
  category_id?: number;
  account_id?: number;
  day_of_month?: number;
  income_type: string;
  is_active: boolean;
  category_name?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  target_date?: string;
  current_amount: number;
  priority: number;
  status: string;
  description?: string;
  progress_percent: number;
  monthly_needed?: number;
  suggested_monthly_contribution?: number;
  estimated_months_to_target?: number;
  estimated_target_date?: string;
  feasibility_status?: 'completed' | 'on_track' | 'tight' | 'unfunded' | 'planned';
  available_monthly_savings?: number;
  other_goals_monthly_commitment?: number;
  available_liquid_balance?: number;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoalPlanInput {
  name: string;
  target_amount: number;
  current_amount?: number;
  target_date?: string;
  priority?: number;
  status?: string;
}

export interface SavingsGoalPlanPreview {
  monthly_needed?: number;
  suggested_monthly_contribution: number;
  estimated_months_to_target?: number;
  estimated_target_date?: string;
  feasibility_status: 'completed' | 'on_track' | 'tight' | 'unfunded' | 'planned';
  available_monthly_savings: number;
  other_goals_monthly_commitment: number;
  available_liquid_balance: number;
  message: string;
}

export interface Budget {
  id: number;
  month: number;
  year: number;
  category_id: number;
  expected_amount: number;
  actual_amount: number;
  difference: number;
  status: 'ok' | 'near_limit' | 'exceeded';
  category_name?: string;
  category_color?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetRecommendationItem {
  category_id: number;
  category_name: string;
  bucket: 'needs' | 'wants';
  recommended_amount: number;
  recent_avg_spent: number;
  current_budget_amount: number;
  rationale: string;
}

export interface BudgetRecommendation {
  strategy_name: string;
  month: number;
  year: number;
  avg_monthly_income: number;
  needs_target: number;
  wants_target: number;
  savings_target: number;
  recommended_monthly_saving: number;
  recent_needs_ratio: number;
  insights: string[];
  items: BudgetRecommendationItem[];
}

export interface ImportFile {
  id: number;
  filename: string;
  file_type: string;
  status: string;
  error_message?: string;
  transaction_count: number;
  account_id?: number;
  account_name?: string;
  period_start?: string;
  period_end?: string;
  period_label?: string;
  imported_at: string;
}

export interface ImportPreviewRow {
  row_index: number;
  date?: string;
  description?: string;
  amount?: number;
  transaction_type?: string;
  is_duplicate: boolean;
  is_international: boolean;
  original_currency?: string;
  original_amount?: number;
  raw_data: Record<string, string>;
}

export interface ImportPreviewResponse {
  import_file_id: number;
  filename: string;
  file_type: string;
  columns: string[];
  preview_rows: ImportPreviewRow[];
  total_rows: number;
  duplicate_count: number;
}

export interface BankConnection {
  id: number;
  provider: string;
  display_name: string;
  status: string;
  last_sync?: string;
  account_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FintocConnectValidation {
  tested: boolean;
  accounts_count: number;
  sample_account_id?: string;
  sample_movements_count: number;
}

export interface FintocConnectResponse {
  connection_id: number;
  status: string;
  mock?: boolean;
  validation?: FintocConnectValidation;
}

// Dashboard
export interface DashboardSummary {
  period: { month: number; year: number };
  current_date?: string;
  generated_at?: string;
  total_balance: number;
  net_worth?: number;
  income: number;
  expenses: number;
  savings: number;
  savings_percent: number;
  fixed_expenses: number;
  variable_expenses: number;
  ant_expenses: number;
  debt_payments: number;
  projected_debt_payments?: number;
  prev_income: number;
  prev_expenses: number;
  income_change_pct?: number;
  expenses_change_pct?: number;
  accounts_count: number;
  accounts: AccountSummary[];
  category_breakdown: CategoryBreakdown[];
  monthly_trend: MonthlyTrend[];
  top_expenses: TopExpense[];
  savings_goals: GoalSummary[];
  transaction_count: number;
  projected_month_expenses?: number;
  projected_month_savings?: number;
  recommended_monthly_saving?: number;
  goals_monthly_required?: number;
  savings_gap_to_target?: number;
  potential_monthly_savings?: number;
  financial_health_status?: 'healthy' | 'watch' | 'risk';
}

export interface AccountSummary {
  id: number;
  name: string;
  balance: number;
  currency: string;
  account_type: string;
}

export interface CategoryBreakdown {
  category_id: number;
  category_name: string;
  color: string;
  amount: number;
}

export interface MonthlyTrend {
  month: number;
  year: number;
  label: string;
  income: number;
  expenses: number;
}

export interface TopExpense {
  id: number;
  date: string;
  description: string;
  amount: number;
  category_name: string;
  category_color: string;
}

export interface GoalSummary {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  progress_percent: number;
}

// Agent
export interface AgentRecommendation {
  type: 'info' | 'warning' | 'success' | 'danger';
  icon: string;
  title: string;
  message: string;
}

export interface AgentAnalysis {
  period: { month: number; year: number };
  summary: string;
  health_score: number;
  recommendations: AgentRecommendation[];
  alerts: Array<{ severity: string; message: string }>;
  findings: Array<{ type: string; rule: string; message: string }>;
  financial_data: {
    income: number;
    expenses: number;
    savings: number;
    savings_percent: number;
    ant_expenses: number;
    fixed_expenses: number;
    variable_expenses: number;
  };
}

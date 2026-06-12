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
  card_last_four?: string;
  card_network?: string;
  created_at: string;
  updated_at: string;
  // For tarjeta_credito: real-time balance computed from transactions (negative = debt)
  computed_balance?: number;
  // For tarjeta_credito
  credit_limit?: number;
  available_credit?: number;
  future_installments_commitment?: number;
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
  local_amount?: number;       // CLP equivalent for international transactions
  exchange_rate_usd?: number;  // CLP per 1 USD at time of conversion
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
  total_amount: number;
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
  sort_by?: 'date' | 'account' | 'amount';
  sort_order?: 'asc' | 'desc';
}

export interface FixedExpense {
  id: number;
  name: string;
  category_id?: number;
  expected_amount: number;
  currency: 'CLP' | 'UF';
  start_date?: string;
  payment_day?: number;
  account_id?: number;
  is_active: boolean;
  expense_type: string;
  total_installments?: number;
  remaining_installments?: number;
  category_name?: string;
  account_name?: string;
  expected_amount_clp?: number;
  remaining_debt_clp?: number;
  created_at: string;
  updated_at: string;
}

export interface FixedExpensePrepayPayload {
  installments: number;
}

export interface FixedExpensePrepayResult {
  fixed_expense: FixedExpense;
  prepaid_installments: number;
  previous_remaining_installments: number;
  remaining_installments: number;
  closed_debt: boolean;
}

export interface FixedExpensePrepayRevertPayload {
  installments: number;
}

export interface FixedExpensePrepayRevertResult {
  fixed_expense: FixedExpense;
  reverted_installments: number;
  previous_remaining_installments: number;
  remaining_installments: number;
  reopened_debt: boolean;
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

export interface SavingsDistributionGoalItem {
  goal_id: number;
  goal_name: string;
  priority: number;
  target_date?: string;
  remaining_amount: number;
  suggested_monthly_amount: number;
  monthly_needed?: number;
  feasibility: 'on_track' | 'tight' | 'unfunded';
}

export interface SavingsDistributionAccountItem {
  account_id: number;
  account_name: string;
  account_type: string;
  current_balance: number;
  suggested_monthly_amount: number;
}

export interface SavingsDistributionPlan {
  projected_monthly_savings: number;
  distribution_to_goals: number;
  distribution_to_accounts: number;
  goals: SavingsDistributionGoalItem[];
  savings_accounts: SavingsDistributionAccountItem[];
  recommendations: string[];
}

export interface SavingsAnnualProjectionMonth {
  period: string;
  projected_savings: number;
  to_goals: number;
  to_accounts: number;
  cumulative_savings: number;
}

export interface SavingsAnnualProjection {
  start_date: string;
  end_date: string;
  months: SavingsAnnualProjectionMonth[];
  total_projected_savings: number;
  total_to_goals: number;
  total_to_accounts: number;
}

export interface Budget {
  id: number;
  month: number;
  year: number;
  category_id: number;
  expected_amount: number;
  actual_amount: number;
  is_recurring: boolean;
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
  national_total_clp?: number;
  international_total_clp?: number;
  international_total_usd?: number;
  import_total_clp?: number;
  payable_national_clp?: number;
  payable_international_clp?: number;
  payable_total_clp?: number;
  import_type?: string;
  imported_at: string;
}

export interface ImportPreviewRow {
  row_index: number;
  date?: string;
  description?: string;
  amount?: number;
  local_amount?: number;  // CLP equivalent for international rows
  transaction_type?: string;
  is_duplicate: boolean;
  is_international: boolean;
  original_currency?: string;
  original_amount?: number;
  raw_data: Record<string, unknown>;
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
  has_access_token?: boolean;
  access_token_masked?: string;
  has_fintoc_secret_key?: boolean;
  fintoc_secret_key_masked?: string;
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

export interface FintocSyncedAccount {
  provider_account_id: string;
  provider_account_name: string;
  local_account_id?: number;
  local_account_name?: string;
  synced_count: number;
  saved_count: number;
  skipped_count: number;
}

export interface FintocProviderAccount {
  id: string;
  name: string;
  type?: string;
  currency?: string;
  balance_amount?: number;
  local_account_id?: number;
  local_account_name?: string;
  sync_enabled?: boolean;
}

export interface FintocSyncResponse {
  synced_count: number;
  saved_count: number;
  skipped_count: number;
  mock_mode?: boolean;
  connection_id: number;
  note: string;
  accounts: FintocSyncedAccount[];
}

// Dashboard
export interface DashboardSummary {
  period: { month: number; year: number };
  current_date?: string;
  generated_at?: string;
  total_balance: number;
  net_worth?: number;
  total_assets?: number;
  liquid_assets?: number;
  savings_assets?: number;
  investment_assets?: number;
  short_term_debt?: number;
  credit_card_total_limit?: number;
  credit_card_used_amount?: number;
  credit_card_available_amount?: number;
  mortgage_remaining_debt?: number;
  fixed_installment_debt?: number;
  total_debt_exposure?: number;
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
  cashflow_projection?: {
    next_30_days?: ShortTermCashflowProjection;
    next_90_days?: ShortTermCashflowProjection;
  };
  recommended_monthly_saving?: number;
  goals_monthly_required?: number;
  savings_gap_to_target?: number;
  potential_monthly_savings?: number;
  dashboard_insights?: DashboardInsight[];
  financial_health_score?: number;
  financial_health_status?: 'healthy' | 'watch' | 'risk';
  financial_health_breakdown?: FinancialHealthFactor[];
}

export interface DashboardInsight {
  severity: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  action?: string;
}

export interface FinancialHealthFactor {
  key: string;
  label: string;
  score: number;
  value: number;
  context: string;
}

export interface ShortTermCashflowProjection {
  days: number;
  start_date: string;
  end_date: string;
  projected_income: number;
  projected_expenses: number;
  projected_savings: number;
  projected_net_balance: number;
}

export interface AccountSummary {
  id: number;
  name: string;
  balance: number;
  currency: string;
  account_type: string;
  computed_balance?: number;
  credit_limit?: number;
  available_credit?: number;
  future_installments_commitment?: number;
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


// Projection
export interface SuggestedSaving {
  goal_id: number;
  goal_name: string;
  priority: number;
  amount: number;
}

export interface MonthlyBalance {
  month: number;
  year: number;
  label: string;
  is_actual: boolean;
  total_income: number;
  recurring_income_template: number;
  fixed_expenses: number;
  pending_installments: number;
  variable_expenses: number;
  variable_expenses_source?: 'budget' | 'historical_avg';
  total_expenses: number;
  available_balance: number;
  suggested_savings: SuggestedSaving[];
  total_suggested_savings: number;
  net_balance: number;
}

export interface AnnualProjection {
  year: number;
  months: MonthlyBalance[];
}

export interface ActiveInstallment {
  id: number;
  date: string;
  description: string;
  installment_current: number;
  installment_total: number;
  monthly_amount: number;
  remaining_installments: number;
  total_remaining: number;
  schedule: string[];
  is_new_debt: boolean;
}

export interface InstallmentPrepayPayload {
  installments: number;
}

export interface InstallmentPrepayResult {
  transaction_id: number;
  prepaid_installments: number;
  previous_remaining_installments: number;
  remaining_installments: number;
  closed_debt: boolean;
}

export interface InstallmentPrepayRevertPayload {
  installments: number;
}

export interface InstallmentPrepayRevertResult {
  transaction_id: number;
  reverted_installments: number;
  previous_remaining_installments: number;
  remaining_installments: number;
  reopened_debt: boolean;
}

export interface BudgetRules {
  year?: number;
  month?: number;
  monthly_income: number;
  income_source: 'real' | 'template' | 'projection';
  samples_months: number;
  rules_5030_20: {
    target_needs: number;
    target_wants: number;
    target_savings: number;
    actual_needs: number;
    actual_wants: number;
    actual_savings: number;
    needs_pct: number;
    wants_pct: number;
    savings_pct: number;
  };
  debt_pressure: {
    future_monthly_installments: number;
    debt_ratio_pct: number;
  };
  suggested_allocation: {
    fixed_expenses: number;
    installments: number;
    wants: number;
    savings: number;
  };
  warnings: string[];
}

export interface AccountBreakdownItem {
  account_id: number;
  account_name: string;
  income: number;
  fixed_expenses: number;
  variable_expenses: number;
  installments: number;
  transactions: Array<{
    date: string;
    description: string;
    amount: number;
    type: string;
    category: number;
    is_fixed: boolean;
    is_debt: boolean;
  }>;
}

export interface MonthBreakdown {
  year: number;
  month: number;
  breakdown: AccountBreakdownItem[];
}

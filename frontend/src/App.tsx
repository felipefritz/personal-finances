import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import FixedExpensesPage from './pages/FixedExpensesPage';
import SavingsGoalsPage from './pages/SavingsGoalsPage';
import BudgetsPage from './pages/BudgetsPage';
import ImportsPage from './pages/ImportsPage';
import AgentPage from './pages/AgentPage';
import BankConnectionsPage from './pages/BankConnectionsPage';
import RecurringIncomesPage from './pages/RecurringIncomesPage';
import ProjectionPage from './pages/ProjectionPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="fixed-expenses" element={<FixedExpensesPage />} />
          <Route path="recurring-incomes" element={<RecurringIncomesPage />} />
        <Route path="savings-goals" element={<SavingsGoalsPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="proyeccion" element={<ProjectionPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="agent" element={<AgentPage />} />
        <Route path="bank-connections" element={<BankConnectionsPage />} />
      </Route>
    </Routes>
  );
}

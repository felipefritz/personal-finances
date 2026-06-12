import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import PlanningPage from './pages/PlanningPage';
import ImportsPage from './pages/ImportsPage';
import BankConnectionsPage from './pages/BankConnectionsPage';
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
        <Route path="planning" element={<PlanningPage />} />
        <Route path="proyeccion" element={<ProjectionPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="bank-connections" element={<BankConnectionsPage />} />
        {/* Redirects from removed routes */}
        <Route path="fixed-expenses" element={<Navigate to="/planning?tab=fixed" replace />} />
        <Route path="recurring-incomes" element={<Navigate to="/planning?tab=incomes" replace />} />
        <Route path="budgets" element={<Navigate to="/planning?tab=budgets" replace />} />
        <Route path="savings-goals" element={<Navigate to="/planning?tab=goals" replace />} />
        <Route path="savings-plan" element={<Navigate to="/proyeccion?tab=ahorro" replace />} />
      </Route>
    </Routes>
  );
}

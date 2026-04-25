import { Navigate, RouteObject } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import DashboardPage from '../pages/DashboardPage';
import AccountsPage from '../pages/AccountsPage';
import TransactionsPage from '../pages/TransactionsPage';
import CategoriesPage from '../pages/CategoriesPage';
import FixedExpensesPage from '../pages/FixedExpensesPage';
import SavingsGoalsPage from '../pages/SavingsGoalsPage';
import BudgetsPage from '../pages/BudgetsPage';
import ImportsPage from '../pages/ImportsPage';
import AgentPage from '../pages/AgentPage';
import BankConnectionsPage from '../pages/BankConnectionsPage';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'fixed-expenses', element: <FixedExpensesPage /> },
      { path: 'savings-goals', element: <SavingsGoalsPage /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'imports', element: <ImportsPage /> },
      { path: 'agent', element: <AgentPage /> },
      { path: 'bank-connections', element: <BankConnectionsPage /> },
    ],
  },
];

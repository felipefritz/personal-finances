import { Box, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import FixedExpensesTab from '../components/planning/FixedExpensesTab';
import RecurringIncomesTab from '../components/planning/RecurringIncomesTab';
import BudgetsTab from '../components/planning/BudgetsTab';
import SavingsGoalsTab from '../components/planning/SavingsGoalsTab';

const TABS = [
  { key: 'fixed', label: 'Gastos fijos' },
  { key: 'incomes', label: 'Ingresos' },
  { key: 'budgets', label: 'Presupuestos' },
  { key: 'goals', label: 'Metas de ahorro' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function PlanningPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'fixed';

  const handleChange = (_: unknown, value: TabKey) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <Box>
      <PageHeader
        title="Presupuestos y metas"
        subtitle="Ordena ingresos, gastos fijos, límites mensuales y objetivos de ahorro"
      />
      <Tabs
        value={activeTab}
        onChange={handleChange}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      {activeTab === 'fixed' && <FixedExpensesTab />}
      {activeTab === 'incomes' && <RecurringIncomesTab />}
      {activeTab === 'budgets' && <BudgetsTab />}
      {activeTab === 'goals' && <SavingsGoalsTab />}
    </Box>
  );
}

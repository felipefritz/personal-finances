import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { getAnnualProjection } from '../api/projections';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ProjectionKpis from '../components/projection/ProjectionKpis';
import AnnualChart from '../components/projection/AnnualChart';
import MonthlyTable from '../components/projection/MonthlyTable';
import InstallmentsPanel from '../components/projection/InstallmentsPanel';
import BudgetRulesPanel from '../components/projection/BudgetRulesPanel';
import SavingsPlanPanel from '../components/projection/SavingsPlanPanel';
import type { MonthlyBalance } from '../types';

const TABS = [
  { key: 'anual', label: 'Proyección anual' },
  { key: 'regla', label: 'Regla de presupuesto' },
  { key: 'ahorro', label: 'Plan de ahorro' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ProjectionPage() {
  const now = new Date();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'anual';

  const [year, setYear] = useState(now.getFullYear());
  const [includeInternalTransfers, setIncludeInternalTransfers] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['projection', year, includeInternalTransfers],
    queryFn: () => getAnnualProjection(year, undefined, includeInternalTransfers),
  });

  const handleTabChange = (_: unknown, value: TabKey) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  const months = (data?.months ?? []) as MonthlyBalance[];
  const negativeMonths = months.filter((m) => m.net_balance < 0).length;
  const totalSavings = months.reduce((s, m) => s + m.total_suggested_savings, 0);
  const budgetRulesMonth = selectedMonth ?? now.getMonth() + 1;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} mb={2}>
        <Box flexGrow={1} minWidth={220}>
          <Typography variant="h5" fontWeight={700}>
            Proyección financiera
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Anticipa meses ajustados, cuotas pendientes y ahorro posible.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={includeInternalTransfers}
              onChange={(e) => setIncludeInternalTransfers(e.target.checked)}
            />
          }
          label="Mostrar traspasos internos"
        />
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Año</InputLabel>
          <Select value={year} label="Año" onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      {activeTab === 'anual' && (
        isLoading ? (
          <LoadingSpinner />
        ) : error || !data ? (
          <Alert severity="error">Error al cargar la proyección.</Alert>
        ) : (
          <>
            {negativeMonths > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {negativeMonths} {negativeMonths === 1 ? 'mes tiene' : 'meses tienen'} saldo neto negativo.
                Considera revisar cuotas pendientes o ajustar gastos fijos.
              </Alert>
            )}
            <ProjectionKpis months={months} year={year} />
            <AnnualChart months={months} year={year} />
            <MonthlyTable
              months={months}
              year={year}
              includeInternalTransfers={includeInternalTransfers}
              selectedMonth={selectedMonth}
              onSelectedMonthChange={setSelectedMonth}
            />
            <InstallmentsPanel totalSuggestedSavings={totalSavings} />
          </>
        )
      )}

      {activeTab === 'regla' && (
        <BudgetRulesPanel
          year={year}
          month={budgetRulesMonth}
          includeInternalTransfers={includeInternalTransfers}
        />
      )}

      {activeTab === 'ahorro' && <SavingsPlanPanel />}
    </Box>
  );
}

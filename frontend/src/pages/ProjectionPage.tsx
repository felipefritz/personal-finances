import { Fragment, useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Switch,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import SavingsIcon from '@mui/icons-material/Savings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  getAnnualProjection,
  getActiveInstallments,
  getBudgetRules,
  getMonthBreakdown,
  prepayInstallmentDebt,
  revertInstallmentPrepay,
} from '../api/projections';
import { formatCurrency } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type {
  MonthlyBalance,
  ActiveInstallment,
  BudgetRules,
  MonthBreakdown,
  AccountBreakdownItem,
} from '../types';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUDGET_RULE_PROFILES = [
  { id: 'r503020', label: '50/30/20 (Balanceada)', needs: 50, wants: 30, savings: 20 },
  { id: 'r602515', label: '60/25/15 (Conservadora)', needs: 60, wants: 25, savings: 15 },
  { id: 'r701515', label: '70/15/15 (Ajuste fuerte)', needs: 70, wants: 15, savings: 15 },
] as const;

function KpiCard({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color?: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700} color={color}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

interface BudgetRuleCardProps {
  title: string;
  subtitle: string;
  targetPct: number;
  target: number;
  actual: number;
  actualPct: number;
  color: string;
  higherIsBetter?: boolean;
  helpText?: string;
  onOpenDetail?: () => void;
  targetLabel?: string;
}

function BudgetRuleCard({ title, subtitle, targetPct, target, actual, actualPct, color, higherIsBetter, helpText, onOpenDetail, targetLabel }: BudgetRuleCardProps) {
  const isOk = higherIsBetter ? actualPct >= targetPct * 0.8 : actualPct <= targetPct * 1.1;
  const barWidth = Math.min(actualPct / targetPct, 1.5); // cap at 150%
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={700}>{title}</Typography>
              {helpText && (
                <Tooltip title={helpText}>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Tooltip>
              )}
              {onOpenDetail && (
                <Button size="small" variant="text" onClick={onOpenDetail} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                  Como se calcula
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Chip
            size="small"
            label={`${actualPct}%`}
            sx={{ bgcolor: isOk ? 'success.light' : 'error.light', color: isOk ? 'success.dark' : 'error.dark', fontWeight: 700 }}
          />
        </Stack>
        {/* Progress bar */}
        <Box sx={{ mt: 1.5, mb: 1, position: 'relative', height: 10, bgcolor: 'grey.200', borderRadius: 5 }}>
          <Box sx={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${Math.min(barWidth * 100, 100)}%`,
            bgcolor: isOk ? color : 'error.main',
            borderRadius: 5,
            transition: 'width 0.5s',
          }} />
          {/* Target marker */}
          <Box sx={{ position: 'absolute', left: '100%', top: -2, height: 14, width: 2, bgcolor: 'text.secondary', borderRadius: 1, transform: 'translateX(-2px)' }} />
        </Box>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">Actual: {formatCurrency(actual)}</Typography>
          <Typography variant="caption" color="text.secondary">{targetLabel ?? `Meta ${targetPct}%`}: {formatCurrency(target)}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

type AllocationDetailKey = 'needs' | 'wants' | 'savings';

export default function ProjectionPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [includeInternalTransfers, setIncludeInternalTransfers] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<(typeof BUDGET_RULE_PROFILES)[number]['id']>('r503020');
  const [allocationDetailOpen, setAllocationDetailOpen] = useState<AllocationDetailKey | null>(null);
  const [monthBreakdowns, setMonthBreakdowns] = useState<Map<string, MonthBreakdown>>(new Map());
  const [loadingBreakdown, setLoadingBreakdown] = useState<string | null>(null);
  const [showVariableExpenses, setShowVariableExpenses] = useState(false);
  const [prepayTarget, setPrepayTarget] = useState<ActiveInstallment | null>(null);
  const [prepayMode, setPrepayMode] = useState<'prepay' | 'revert'>('prepay');
  const [prepayInstallments, setPrepayInstallments] = useState<number>(1);
  const [prepaySummary, setPrepaySummary] = useState<string | null>(null);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['projection', year, includeInternalTransfers],
    queryFn: () => getAnnualProjection(year, undefined, includeInternalTransfers),
  });

  const { data: installments = [] } = useQuery({
    queryKey: ['active-installments'],
    queryFn: () => getActiveInstallments(),
  });

  const prepayMut = useMutation({
    mutationFn: ({ id, installmentsToPrepay }: { id: number; installmentsToPrepay: number }) => (
      prepayInstallmentDebt(id, { installments: installmentsToPrepay })
    ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['active-installments'] });
      qc.invalidateQueries({ queryKey: ['projection'] });
      qc.invalidateQueries({ queryKey: ['budget-rules'] });
      if (selectedMonth) {
        qc.invalidateQueries({ queryKey: ['month-breakdown'] });
      }

      if (prepayTarget) {
        setPrepaySummary(
          `Prepago aplicado en ${prepayTarget.description}: ${result.prepaid_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });

  const revertPrepayMut = useMutation({
    mutationFn: ({ id, installmentsToRevert }: { id: number; installmentsToRevert: number }) => (
      revertInstallmentPrepay(id, { installments: installmentsToRevert })
    ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['active-installments'] });
      qc.invalidateQueries({ queryKey: ['projection'] });
      qc.invalidateQueries({ queryKey: ['budget-rules'] });
      if (selectedMonth) {
        qc.invalidateQueries({ queryKey: ['month-breakdown'] });
      }

      if (prepayTarget) {
        setPrepaySummary(
          `Reversa aplicada en ${prepayTarget.description}: ${result.reverted_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });

  const budgetRulesMonth = selectedMonth ?? now.getMonth() + 1;

  const { data: budgetRules } = useQuery({
    queryKey: ['budget-rules', year, budgetRulesMonth, includeInternalTransfers],
    queryFn: () => getBudgetRules(undefined, year, budgetRulesMonth, includeInternalTransfers),
  });

  const recommendedRuleId = useMemo<(typeof BUDGET_RULE_PROFILES)[number]['id']>(() => {
    if (!budgetRules) return 'r503020';
    const needsPct = budgetRules.rules_5030_20.needs_pct;
    const debtPct = budgetRules.debt_pressure.debt_ratio_pct;
    if (debtPct >= 30 || needsPct >= 60) return 'r701515';
    if (needsPct >= 52) return 'r602515';
    return 'r503020';
  }, [budgetRules]);

  useEffect(() => {
    setSelectedRuleId(recommendedRuleId);
  }, [recommendedRuleId, year, budgetRulesMonth]);

  // Limpiar expandidos cuando cambia el año
  useEffect(() => {
    setSelectedMonth(null);
    setMonthBreakdowns(new Map());
  }, [year, includeInternalTransfers]);

  const toggleMonthExpanded = async (month: number) => {
    const key = `${year}-${month}`;
    if (selectedMonth === month) {
      setSelectedMonth(null);
    } else {
      // Cargar desglose si no está en caché
      if (!monthBreakdowns.has(key)) {
        try {
          setLoadingBreakdown(key);
          const breakdown = await getMonthBreakdown(year, month, includeInternalTransfers);
          setMonthBreakdowns((m) => new Map(m).set(key, breakdown));
        } catch (err) {
          console.error('Error loading month breakdown:', err);
        } finally {
          setLoadingBreakdown(null);
        }
      }
      setSelectedMonth(month);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <Alert severity="error">Error al cargar la proyección.</Alert>;

  const months = data.months as MonthlyBalance[];

  // KPI summaries
  const totalIncome = months.reduce((s, m) => s + m.total_income, 0);
  const totalExpenses = months.reduce((s, m) => s + m.total_expenses, 0);
  const totalInstallments = months.reduce((s, m) => s + m.pending_installments, 0);
  const totalSavings = months.reduce((s, m) => s + m.total_suggested_savings, 0);
  const totalNet = months.reduce((s, m) => s + m.net_balance, 0);
  const negativeMonths = months.filter((m) => m.net_balance < 0).length;

  // Chart data
  const chartData = months.map((m) => ({
    name: MONTH_SHORT[m.month - 1],
    isActual: m.is_actual,
    Ingresos: m.total_income,
    'Gtos Fijos': m.fixed_expenses,
    'Gtos TC/Variables': m.variable_expenses,
    Cuotas: m.pending_installments,
    'Ahorro sugerido': m.total_suggested_savings,
  }));

  const monthlyRows = months.map((m) => {
    if (showVariableExpenses) return { id: m.month, ...m };
    // Exclude variable expenses: adjust totals for display
    const varExp = m.variable_expenses ?? 0;
    return {
      id: m.month,
      ...m,
      variable_expenses: 0,
      total_expenses: m.total_expenses - varExp,
      available_balance: m.available_balance + varExp,
      net_balance: m.net_balance + varExp,
    };
  });

  const monthlyColumns: GridColDef[] = [
    {
      field: 'expand',
      headerName: '',
      width: 54,
      sortable: false,
      filterable: false,
      align: 'center',
      renderCell: (params) => {
        const month = params.row.month as number;
        const isExpanded = selectedMonth === month;
        return (
          <IconButton size="small" onClick={() => toggleMonthExpanded(month)}>
            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        );
      },
    },
    {
      field: 'label',
      headerName: 'Mes',
      minWidth: 150,
      flex: 1,
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        return (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
            <Typography variant="body2">{row.label}</Typography>
            {!row.is_actual && (
              <Chip label="proyectado" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
            )}
          </Stack>
        );
      },
    },
    {
      field: 'total_income',
      headerName: 'Ingresos',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography variant="body2" color="success.main" sx={{ width: '100%', textAlign: 'right' }}>
          {formatCurrency(params.row.total_income)}
        </Typography>
      ),
    },
    {
      field: 'fixed_expenses',
      headerName: 'Gtos Fijos',
      minWidth: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
    },
    {
      field: 'pending_installments',
      headerName: 'Cuotas',
      minWidth: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography
          variant="body2"
          color={params.row.pending_installments > 0 ? 'warning.main' : 'text.primary'}
          sx={{ width: '100%', textAlign: 'right' }}
        >
          {formatCurrency(params.row.pending_installments)}
        </Typography>
      ),
    },
    {
      field: 'variable_expenses',
      headerName: 'Gtos Variables',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        const src = row.variable_expenses_source;
        const tooltip = src === 'budget'
          ? 'Basado en presupuestos recurrentes'
          : src === 'historical_avg'
          ? 'Promedio histórico últimos 3 meses'
          : 'Real: transacciones del mes';
        return (
          <Tooltip title={tooltip} placement="top">
            <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ width: '100%' }}>
              <Typography variant="body2">
                {formatCurrency(row.variable_expenses)}
              </Typography>
              {src && (
                <Chip
                  label={src === 'budget' ? 'Ppto' : 'Hist'}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: src === 'budget' ? 'info.light' : 'grey.200',
                    color: src === 'budget' ? 'info.dark' : 'text.secondary',
                    px: 0.5,
                  }}
                />
              )}
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      field: 'total_expenses',
      headerName: 'Total gastos',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography variant="body2" color="error.main" sx={{ width: '100%', textAlign: 'right' }}>
          {formatCurrency(params.row.total_expenses)}
        </Typography>
      ),
    },
    {
      field: 'available_balance',
      headerName: 'Saldo disponible',
      minWidth: 150,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography
          variant="body2"
          color={params.row.available_balance >= 0 ? 'text.primary' : 'error.main'}
          sx={{ width: '100%', textAlign: 'right' }}
        >
          {formatCurrency(params.row.available_balance)}
        </Typography>
      ),
    },
    {
      field: 'total_suggested_savings',
      headerName: 'Ahorro sugerido',
      minWidth: 165,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        return (
          <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5} sx={{ width: '100%' }}>
            <Typography variant="body2" color="primary.main">
              {formatCurrency(row.total_suggested_savings)}
            </Typography>
            {row.suggested_savings.length > 0 && (
              <Tooltip title={row.suggested_savings.map((s) => `${s.goal_name}: ${formatCurrency(s.amount)}`).join(' | ')}>
                <InfoOutlinedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              </Tooltip>
            )}
          </Stack>
        );
      },
    },
    {
      field: 'net_balance',
      headerName: 'Saldo neto',
      minWidth: 150,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const value = params.row.net_balance as number;
        const Icon = value >= 0 ? TrendingUpIcon : TrendingDownIcon;
        const color = value >= 0 ? 'success.main' : 'error.main';
        return (
          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ width: '100%' }}>
            <Icon sx={{ fontSize: 16, color }} />
            <Typography variant="body2" fontWeight={700} color={color}>
              {formatCurrency(value)}
            </Typography>
          </Stack>
        );
      },
    },
  ];

  const selectedMonthData = selectedMonth ? months.find((m) => m.month === selectedMonth) : undefined;
  const selectedBreakdownKey = selectedMonth ? `${year}-${selectedMonth}` : null;
  const selectedBreakdown = selectedBreakdownKey ? monthBreakdowns.get(selectedBreakdownKey) : undefined;
  const prepayMonthlyAmount = prepayTarget?.monthly_amount ?? 0;
  const prepayCurrentRemainingInstallments = prepayTarget?.remaining_installments ?? 0;
  const prepayCurrentTotalDebt = prepayCurrentRemainingInstallments * prepayMonthlyAmount;
  const prepayRemainingInstallmentsAfter = prepayMode === 'prepay'
    ? Math.max(prepayCurrentRemainingInstallments - prepayInstallments, 0)
    : prepayCurrentRemainingInstallments + prepayInstallments;
  const prepayTotalDebtAfter = prepayRemainingInstallmentsAfter * prepayMonthlyAmount;
  const selectedRule = BUDGET_RULE_PROFILES.find((r) => r.id === selectedRuleId) ?? BUDGET_RULE_PROFILES[0];
  const currentMonthlyIncome = budgetRules?.monthly_income ?? 0;
  const currentNeeds = budgetRules ? budgetRules.suggested_allocation.fixed_expenses + budgetRules.suggested_allocation.installments : 0;
  const currentWants = budgetRules?.suggested_allocation.wants ?? 0;
  const currentSavings = budgetRules?.suggested_allocation.savings ?? 0;
  const currentNeedsPct = currentMonthlyIncome > 0 ? Number(((currentNeeds / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const currentWantsPct = currentMonthlyIncome > 0 ? Number(((currentWants / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const currentSavingsPct = currentMonthlyIncome > 0 ? Number(((currentSavings / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const wantsRuleTarget = Math.round((currentMonthlyIncome * selectedRule.wants) / 100);
  const wantsPracticalCap = Math.max(0, Math.min(wantsRuleTarget, currentWants));

  return (
    <Box>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} mb={3}>
        <Typography variant="h5" fontWeight={700} flexGrow={1}>
          Proyección Anual
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={includeInternalTransfers}
              onChange={(e) => setIncludeInternalTransfers(e.target.checked)}
            />
          }
          label="Incluir traspasos internos Fintoc"
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

      {/* Negative balance alert */}
      {negativeMonths > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {negativeMonths} {negativeMonths === 1 ? 'mes tiene' : 'meses tienen'} saldo neto negativo.
          Considera revisar cuotas pendientes o ajustar gastos fijos.
        </Alert>
      )}

      {prepaySummary && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {prepaySummary}
        </Alert>
      )}

      {prepayMut.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No se pudo aplicar el prepago de cuotas.
        </Alert>
      )}

      {revertPrepayMut.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No se pudo revertir el prepago de cuotas.
        </Alert>
      )}

      {/* KPIs */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Ingresos totales" value={formatCurrency(totalIncome)} subtitle={`${year}`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Gastos totales" value={formatCurrency(totalExpenses)} subtitle="fijos + cuotas" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Cuotas pendientes" value={formatCurrency(totalInstallments)} subtitle="proyección del año" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Ahorro sugerido" value={formatCurrency(totalSavings)} subtitle="suma anual de metas" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            title="Saldo neto anual"
            value={formatCurrency(totalNet)}
            color={totalNet >= 0 ? 'success.main' : 'error.main'}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard
            title="Meses en rojo"
            value={`${negativeMonths} / 12`}
            color={negativeMonths > 0 ? 'error.main' : 'success.main'}
          />
        </Grid>
      </Grid>

      {/* Stacked bar chart */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Balance mensual {year}
            <Tooltip title="Las barras grises son meses con datos reales; las coloreadas son proyectados.">
              <InfoOutlinedIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
            </Tooltip>
          </Typography>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
              <RechartsTooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
              />
              <Legend />
              <Bar dataKey="Ingresos" stackId="income" fill="#2e7d32" />
              <Bar dataKey="Gtos Fijos" stackId="expenses" fill="#d32f2f" />
              <Bar dataKey="Gtos TC/Variables" stackId="expenses" fill="#6d4c41" />
              <Bar dataKey="Cuotas" stackId="expenses" fill="#f57c00" />
              <Bar dataKey="Ahorro sugerido" stackId="savings" fill="#1976d2" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, mb: 0.5 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Detalle mensual
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showVariableExpenses}
                  onChange={(e) => setShowVariableExpenses(e.target.checked)}
                />
              }
              label={<Typography variant="caption" color="text.secondary">Incluir gastos variables</Typography>}
              labelPlacement="start"
              sx={{ mr: 0, ml: 0 }}
            />
          </Stack>
          <Box sx={{ width: '100%', height: 580 }}>
            <DataGrid
              rows={monthlyRows}
              columns={monthlyColumns}
              columnVisibilityModel={{ variable_expenses: showVariableExpenses }}
              disableRowSelectionOnClick
              hideFooter
              rowHeight={46}
              getRowClassName={(params) => (params.row.net_balance < 0 ? 'row-negative-balance' : '')}
              sx={{
                border: 0,
                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: 'primary.50',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                },
                '& .MuiDataGrid-cell': {
                  borderBottomColor: 'divider',
                },
                '& .row-negative-balance': {
                  bgcolor: 'error.50',
                },
                '& .MuiDataGrid-row': {
                  opacity: 1,
                },
              }}
            />
          </Box>

          {selectedMonth && (
            <Box sx={{ mt: 2, px: 1 }}>
              {loadingBreakdown === selectedBreakdownKey ? (
                <Typography variant="body2" color="text.secondary">
                  Cargando desglose...
                </Typography>
              ) : selectedBreakdown && selectedMonthData ? (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                    Desglose por cuenta — {selectedMonthData.label}
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                          <TableCell>Cuenta</TableCell>
                          <TableCell align="right">Ingresos</TableCell>
                          <TableCell align="right">Gtos Fijos</TableCell>
                          <TableCell align="right">Gtos Variables</TableCell>
                          <TableCell align="right">Cuotas</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedBreakdown.breakdown.map((acc: AccountBreakdownItem) => (
                          <Fragment key={acc.account_id}>
                            <TableRow key={`row-${acc.account_id}`} sx={{ fontSize: '0.85rem', bgcolor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 500 }}>{acc.account_name}</TableCell>
                              <TableCell align="right" sx={{ color: 'success.main' }}>
                                {formatCurrency(acc.income)}
                              </TableCell>
                              <TableCell align="right">{formatCurrency(acc.fixed_expenses)}</TableCell>
                              <TableCell align="right">{formatCurrency(acc.variable_expenses)}</TableCell>
                              <TableCell align="right">{formatCurrency(acc.installments)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                {formatCurrency(acc.income + acc.fixed_expenses + acc.variable_expenses + acc.installments)}
                              </TableCell>
                            </TableRow>
                            {acc.transactions && acc.transactions.length > 0 && (
                              <TableRow key={`tx-${acc.account_id}`} sx={{ bgcolor: '#fafafa' }}>
                                <TableCell colSpan={6} sx={{ p: 1 }}>
                                  <Box sx={{ pl: 2, pr: 1 }}>
                                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                                      {acc.transactions.length} movimientos
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 150, overflowY: 'auto' }}>
                                      {acc.transactions.map((tx: any, idx: number) => (
                                        <Box
                                          key={idx}
                                          sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', p: 0.5, bgcolor: 'white', borderRadius: '3px' }}
                                        >
                                          <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
                                            <strong>{tx.date}</strong> {tx.description.substring(0, 25)}...
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{ fontWeight: 600, color: tx.amount >= 0 ? 'success.main' : 'error.main', minWidth: 100, textAlign: 'right' }}
                                          >
                                            {formatCurrency(tx.amount)}
                                          </Typography>
                                        </Box>
                                      ))}
                                    </Box>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                        <TableRow sx={{ bgcolor: 'grey.100', fontWeight: 600 }}>
                          <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.income, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.fixed_expenses, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.variable_expenses, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.installments, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatCurrency(
                              selectedBreakdown.breakdown.reduce(
                                (s, a) => s + a.income + a.fixed_expenses + a.variable_expenses + a.installments,
                                0,
                              ),
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No hay datos disponibles
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
      {/* ── Reglas de presupuesto 50/30/20 ───────────────────────────── */}
      {budgetRules && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <SavingsIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={600}>
                Regla financiera — distribución mensual
              </Typography>
              <Tooltip title={`Basado en ${budgetRules.income_source === 'projection' ? 'proyección del mes seleccionado' : `promedio de los últimos ${budgetRules.samples_months} meses`}. Ingreso: ${budgetRules.income_source === 'real' ? 'real' : budgetRules.income_source === 'projection' ? 'proyección mensual' : 'ingresos recurrentes configurados'}.`}>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Tooltip>
              <Box flexGrow={1} />
              <FormControl size="small" sx={{ minWidth: 210 }}>
                <InputLabel>Regla</InputLabel>
                <Select value={selectedRuleId} label="Regla" onChange={(e) => setSelectedRuleId(e.target.value as (typeof BUDGET_RULE_PROFILES)[number]['id'])}>
                  {BUDGET_RULE_PROFILES.map((rule) => (
                    <MenuItem key={rule.id} value={rule.id}>{rule.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Puedes cambiar la regla desde este selector. La etiqueta Recomendada se calcula automaticamente segun deuda y peso de necesidades.">
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </Tooltip>
              <Chip size="small" label={`Recomendada: ${BUDGET_RULE_PROFILES.find((r) => r.id === recommendedRuleId)?.label ?? '50/30/20'}`} color="warning" variant="outlined" />
              <Chip
                size="small"
                label={`Ingreso base: ${formatCurrency(budgetRules.monthly_income)}/mes`}
                color="success"
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Mes analizado: ${MONTH_SHORT[(budgetRules.month ?? budgetRulesMonth) - 1]} ${budgetRules.year ?? year}`}
                color="primary"
                variant="outlined"
              />
            </Stack>

            {budgetRules.warnings.length > 0 && (
              <Stack spacing={0.5} mb={2}>
                {budgetRules.warnings.map((w, i) => (
                  <Alert key={i} severity="warning" sx={{ py: 0.5 }}>{w}</Alert>
                ))}
              </Stack>
            )}

            <Grid container spacing={2} mb={3}>
              {/* NEEDS */}
              <Grid item xs={12} md={4}>
                <BudgetRuleCard
                  title="Necesidades"
                  subtitle="Distribución sugerida comprometida"
                  targetPct={selectedRule.needs}
                  target={Math.round((budgetRules.monthly_income * selectedRule.needs) / 100)}
                  actual={currentNeeds}
                  actualPct={currentNeedsPct}
                  color="#d32f2f"
                  helpText="Incluye gastos fijos y cuotas/deudas comprometidas del mes."
                  onOpenDetail={() => setAllocationDetailOpen('needs')}
                />
              </Grid>
              {/* WANTS */}
              <Grid item xs={12} md={4}>
                <BudgetRuleCard
                  title="Deseos / Variables"
                  subtitle={`Tope real por caja. Regla ${selectedRule.wants}% referencial: ${formatCurrency(wantsRuleTarget)}`}
                  targetPct={currentWantsPct}
                  target={wantsPracticalCap}
                  actual={currentWants}
                  actualPct={currentWantsPct}
                  color="#ed6c02"
                  helpText="Se calcula como el saldo libre del mes despues de cubrir necesidades y ahorro sugerido."
                  onOpenDetail={() => setAllocationDetailOpen('wants')}
                  targetLabel="Tope real"
                />
              </Grid>
              {/* SAVINGS */}
              <Grid item xs={12} md={4}>
                <BudgetRuleCard
                  title="Ahorro"
                  subtitle="Ahorro sugerido según capacidad"
                  targetPct={selectedRule.savings}
                  target={Math.round((budgetRules.monthly_income * selectedRule.savings) / 100)}
                  actual={currentSavings}
                  actualPct={currentSavingsPct}
                  color="#2e7d32"
                  higherIsBetter
                  helpText="Monto sugerido para transferir a ahorro este mes sin comprometer caja operativa."
                  onOpenDetail={() => setAllocationDetailOpen('savings')}
                />
              </Grid>
            </Grid>

            {/* Asignación sugerida */}
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Distribución sugerida considerando cuotas actuales
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Categoría</TableCell>
                    <TableCell align="right">Monto sugerido</TableCell>
                    <TableCell align="right">% del ingreso</TableCell>
                    <TableCell>Detalle</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <span>Gastos fijos (arriendo, servicios)</span>
                        <Tooltip title="Parte de necesidades: gastos comprometidos del mes.">
                          <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        </Tooltip>
                        <Button size="small" variant="text" onClick={() => setAllocationDetailOpen('needs')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                          Como se calcula
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(budgetRules.suggested_allocation.fixed_expenses)}</TableCell>
                    <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.fixed_expenses / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                    <TableCell><Chip size="small" label="Comprometido" color="error" variant="outlined" /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Cuotas en curso</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'warning.main' }}>{formatCurrency(budgetRules.suggested_allocation.installments)}</TableCell>
                    <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.installments / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${budgetRules.debt_pressure.debt_ratio_pct}% deuda`} color={budgetRules.debt_pressure.debt_ratio_pct > 30 ? 'error' : 'warning'} variant="outlined" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <span>Gastos variables / deseos</span>
                        <Tooltip title="Este valor viene del saldo libre proyectado del mes (net balance), es decir, lo que queda utilizable despues de necesidades y ahorro sugerido.">
                          <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        </Tooltip>
                        <Button size="small" variant="text" onClick={() => setAllocationDetailOpen('wants')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                          Como se calcula
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(budgetRules.suggested_allocation.wants)}</TableCell>
                    <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.wants / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                    <TableCell><Chip size="small" label="Flexible" color="default" variant="outlined" /></TableCell>
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'success.50' }}>
                    <TableCell sx={{ fontWeight: 700, color: 'success.dark' }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <span>Ahorro objetivo ({selectedRule.savings}%)</span>
                        <Tooltip title="Ahorro sugerido por el sistema considerando capacidad de caja y metas activas.">
                          <InfoOutlinedIcon sx={{ fontSize: 14, color: 'success.dark' }} />
                        </Tooltip>
                        <Button size="small" variant="text" color="success" onClick={() => setAllocationDetailOpen('savings')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                          Como se calcula
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'success.dark' }}>{formatCurrency(budgetRules.suggested_allocation.savings)}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.dark' }}>
                      {budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.savings / budgetRules.monthly_income * 100).toFixed(1) : 0}%
                    </TableCell>
                    <TableCell><Chip size="small" label="Meta" color="success" variant="outlined" /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Dialog
              open={Boolean(allocationDetailOpen)}
              onClose={() => setAllocationDetailOpen(null)}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>
                {allocationDetailOpen === 'needs' && 'Como se calcula: Necesidades'}
                {allocationDetailOpen === 'wants' && 'Como se calcula: Deseos / Variables'}
                {allocationDetailOpen === 'savings' && 'Como se calcula: Ahorro'}
              </DialogTitle>
              <DialogContent dividers>
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    Fuente del ingreso base: {budgetRules.income_source === 'projection' ? 'proyeccion del mes seleccionado' : budgetRules.income_source === 'real' ? `promedio de los ultimos ${budgetRules.samples_months} meses` : 'ingresos recurrentes configurados'}.
                  </Typography>
                  <Typography variant="body2">
                    Ingreso base mensual: <strong>{formatCurrency(currentMonthlyIncome)}</strong>
                  </Typography>

                  {allocationDetailOpen === 'needs' && (
                    <>
                      <Typography variant="body2">Gastos fijos: {formatCurrency(budgetRules.suggested_allocation.fixed_expenses)}</Typography>
                      <Typography variant="body2">Cuotas en curso: {formatCurrency(budgetRules.suggested_allocation.installments)}</Typography>
                      <Typography variant="body2">
                        Formula aplicada: Necesidades = Gastos fijos + Cuotas = {formatCurrency(currentNeeds)} ({currentNeedsPct}%)
                      </Typography>
                      <Typography variant="body2">
                        Meta segun regla {selectedRule.label}: {selectedRule.needs}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.needs) / 100))}
                      </Typography>
                    </>
                  )}

                  {allocationDetailOpen === 'wants' && (
                    <>
                      <Typography variant="body2">Necesidades del mes: {formatCurrency(currentNeeds)}</Typography>
                      <Typography variant="body2">Ahorro sugerido: {formatCurrency(currentSavings)}</Typography>
                      <Typography variant="body2">
                        Formula aplicada: Deseos/Variables = Saldo libre utilizable del mes despues de necesidades y ahorro = {formatCurrency(currentWants)} ({currentWantsPct}%)
                      </Typography>
                      <Typography variant="body2">
                        Meta segun regla {selectedRule.label}: {selectedRule.wants}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.wants) / 100))}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        La meta porcentual es una referencia ideal. El monto realmente gastable se limita al saldo libre del mes.
                      </Typography>
                    </>
                  )}

                  {allocationDetailOpen === 'savings' && (
                    <>
                      <Typography variant="body2">
                        Ahorro sugerido por motor de proyeccion (capacidad de caja y metas activas): {formatCurrency(currentSavings)} ({currentSavingsPct}%)
                      </Typography>
                      <Typography variant="body2">
                        Meta segun regla {selectedRule.label}: {selectedRule.savings}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.savings) / 100))}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        El monto final puede ser menor a la meta porcentual si el sistema protege caja operativa o limita ahorro por disponibilidad mensual.
                      </Typography>
                    </>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAllocationDetailOpen(null)}>Cerrar</Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Active installments breakdown */}
      {installments.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                Deudas en cuotas activas
              </Typography>
              <Chip
                size="small"
                label={`${installments.length} deuda${installments.length !== 1 ? 's' : ''} · ${formatCurrency(installments.reduce((s, i) => s + i.monthly_amount, 0))}/mes`}
                color="warning"
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Ahorro anual sugerido: ${formatCurrency(totalSavings)}`}
                color="success"
                variant="outlined"
              />
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="center">Cuotas</TableCell>
                    <TableCell align="right">Cuota mensual</TableCell>
                    <TableCell align="right">Total restante</TableCell>
                    <TableCell>Calendario</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {installments.map((inst: ActiveInstallment) => (
                    <TableRow key={inst.id}>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {inst.is_new_debt && (
                            <Tooltip title="Nueva deuda: primera cuota aún no facturada">
                              <NewReleasesIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                            </Tooltip>
                          )}
                          <Box>
                            <Typography variant="body2">{inst.description}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              desde {new Date(inst.date).toLocaleDateString('es-CL')}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={`${inst.installment_current}/${inst.installment_total}`}
                          color={inst.is_new_debt ? 'warning' : 'default'}
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary" display="block">
                          {inst.remaining_installments} restantes
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'warning.main' }}>
                        {formatCurrency(inst.monthly_amount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(inst.total_remaining)}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ maxWidth: 320 }}>
                          {inst.schedule.slice(0, 6).map((m: string) => (
                            <Chip key={m} size="small" label={m} variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                          ))}
                          {inst.schedule.length > 6 && (
                            <Chip size="small" label={`+${inst.schedule.length - 6} más`} variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<PaymentsOutlinedIcon fontSize="small" />}
                          onClick={() => {
                            setPrepayTarget(inst);
                            setPrepayMode('prepay');
                            setPrepayInstallments(1);
                          }}
                          sx={{ mr: 0.5 }}
                        >
                          Prepagar
                        </Button>
                        <Button
                          size="small"
                          startIcon={<UndoIcon fontSize="small" />}
                          onClick={() => {
                            setPrepayTarget(inst);
                            setPrepayMode('revert');
                            setPrepayInstallments(1);
                          }}
                        >
                          Revertir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Dialog open={prepayTarget !== null} onClose={() => setPrepayTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{prepayMode === 'prepay' ? 'Prepagar compra en cuotas' : 'Revertir prepago de compra en cuotas'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2">
              {prepayTarget?.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Cuotas pendientes actuales: {prepayTarget?.remaining_installments ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Monto pendiente actual: {formatCurrency(prepayCurrentTotalDebt)}
            </Typography>
            <TextField
              label={prepayMode === 'prepay' ? 'Cuotas a prepagar' : 'Cuotas a restaurar'}
              type="number"
              inputProps={{
                min: 1,
                max: prepayMode === 'prepay' ? (prepayTarget?.remaining_installments ?? 1) : 120,
              }}
              value={prepayInstallments}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const raw = Number(e.target.value);
                const max = prepayMode === 'prepay' ? (prepayTarget?.remaining_installments ?? 1) : 120;
                if (!Number.isFinite(raw)) {
                  setPrepayInstallments(1);
                  return;
                }
                setPrepayInstallments(Math.min(max, Math.max(1, Math.floor(raw))));
              }}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Luego del prepago quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`
                : `Luego de la reversa quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Monto pendiente luego del prepago: ${formatCurrency(prepayTotalDebtAfter)}`
                : `Monto pendiente luego de la reversa: ${formatCurrency(prepayTotalDebtAfter)}`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrepayTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!prepayTarget || prepayMut.isPending || revertPrepayMut.isPending}
            onClick={() => {
              if (!prepayTarget) return;
              if (prepayMode === 'prepay') {
                prepayMut.mutate({ id: prepayTarget.id, installmentsToPrepay: prepayInstallments });
              } else {
                revertPrepayMut.mutate({ id: prepayTarget.id, installmentsToRevert: prepayInstallments });
              }
            }}
          >
            {prepayMode === 'prepay' ? 'Confirmar prepago' : 'Confirmar reversa'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

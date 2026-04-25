import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
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
import { getAnnualProjection } from '../api/projections';
import { formatCurrency } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { MonthlyBalance } from '../types';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

function NetBalanceCell({ value }: { value: number }) {
  const color = value >= 0 ? 'success.main' : 'error.main';
  const Icon = value >= 0 ? TrendingUpIcon : TrendingDownIcon;
  return (
    <TableCell align="right" sx={{ fontWeight: 700 }}>
      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
        <Icon sx={{ fontSize: 16, color }} />
        <Typography variant="body2" fontWeight={700} color={color}>
          {formatCurrency(value)}
        </Typography>
      </Stack>
    </TableCell>
  );
}

export default function ProjectionPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['projection', year],
    queryFn: () => getAnnualProjection(year),
  });

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
    Cuotas: m.pending_installments,
    Variables: m.variable_expenses,
    'Ahorro sugerido': m.total_suggested_savings,
  }));

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700} flexGrow={1}>
          Proyección Anual
        </Typography>
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

      {/* KPIs */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Ingresos totales" value={formatCurrency(totalIncome)} subtitle={`${year}`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KpiCard title="Gastos totales" value={formatCurrency(totalExpenses)} subtitle="fijos + cuotas + variables" />
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
              <Bar dataKey="Ingresos" stackId="b" fill="#2e7d32" />
              <Bar dataKey="Gtos Fijos" stackId="a" fill="#d32f2f" />
              <Bar dataKey="Cuotas" stackId="a" fill="#f57c00" />
              <Bar dataKey="Variables" stackId="a" fill="#ed6c02" opacity={0.75} />
              <Bar dataKey="Ahorro sugerido" stackId="a" fill="#1976d2" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Detalle mensual
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mes</TableCell>
                  <TableCell align="right">Ingresos</TableCell>
                  <TableCell align="right">Gtos Fijos</TableCell>
                  <TableCell align="right">Cuotas</TableCell>
                  <TableCell align="right">Variables</TableCell>
                  <TableCell align="right">Total gastos</TableCell>
                  <TableCell align="right">Saldo disponible</TableCell>
                  <TableCell align="right">Ahorro sugerido</TableCell>
                  <TableCell align="right">Saldo neto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {months.map((m) => (
                  <TableRow
                    key={m.month}
                    sx={{
                      bgcolor: m.net_balance < 0 ? 'error.50' : 'inherit',
                      opacity: m.is_actual ? 1 : 0.8,
                    }}
                  >
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <span>{m.label}</span>
                        {!m.is_actual && (
                          <Chip label="proyectado" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {formatCurrency(m.total_income)}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(m.fixed_expenses)}</TableCell>
                    <TableCell align="right" sx={{ color: m.pending_installments > 0 ? 'warning.main' : 'inherit' }}>
                      {formatCurrency(m.pending_installments)}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(m.variable_expenses)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      {formatCurrency(m.total_expenses)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: m.available_balance >= 0 ? 'text.primary' : 'error.main' }}>
                      {formatCurrency(m.available_balance)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'primary.main' }}>
                      {formatCurrency(m.total_suggested_savings)}
                      {m.suggested_savings.length > 0 && (
                        <Tooltip
                          title={m.suggested_savings.map((s) => `${s.goal_name}: ${formatCurrency(s.amount)}`).join(' | ')}
                        >
                          <InfoOutlinedIcon sx={{ fontSize: 13, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <NetBalanceCell value={m.net_balance} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

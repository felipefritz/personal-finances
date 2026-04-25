import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getDashboardSummary } from '../api/dashboard';
import { formatCurrency, formatPercent, MONTH_NAMES } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#0288d1', '#7b1fa2'];

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700}>
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

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', month, year],
    queryFn: () => getDashboardSummary(month, year),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <Alert severity="error">Error al cargar el dashboard.</Alert>;

  const pieData = data.category_breakdown.slice(0, 8).map((c) => ({
    name: c.category_name,
    value: Math.abs(c.amount),
  }));

  const barData = data.monthly_trend.map((t) => ({
    name: MONTH_NAMES[t.month - 1].slice(0, 3),
    Ingresos: t.income,
    Gastos: Math.abs(t.expenses),
  }));

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700} flexGrow={1}>
          Dashboard
        </Typography>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Mes</InputLabel>
          <Select value={month} label="Mes" onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <MenuItem key={i} value={i + 1}>{m}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel>Año</InputLabel>
          <Select value={year} label="Año" onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard title="Balance Total" value={formatCurrency(data.total_balance)} />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard title="Ingresos" value={formatCurrency(data.income)} />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard title="Gastos" value={formatCurrency(data.expenses)} />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard
            title="Ahorro"
            value={formatCurrency(data.savings)}
            subtitle={`${formatPercent(data.savings_percent)} del ingreso`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard
            title="Proyección Deuda Mensual"
            value={formatCurrency(data.projected_debt_payments ?? data.debt_payments ?? 0)}
            subtitle="Promedio de los últimos 3 meses"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={3}>
          <KpiCard
            title="Ahorro Potencial"
            value={formatCurrency(data.potential_monthly_savings ?? 0)}
            subtitle="Recorte sugerido en gastos optimizables"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Gastos por Categoria
              </Typography>
              {pieData.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4}>Sin datos</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" labelLine={false}>
                      {pieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Tendencia Mensual
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  <Legend />
                  <Bar dataKey="Ingresos" fill="#2e7d32" />
                  <Bar dataKey="Gastos" fill="#d32f2f" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Top Gastos del Mes
              </Typography>
              <List dense disablePadding>
                {data.top_expenses.slice(0, 8).map((tx, i) => (
                  <div key={tx.id}>
                    <ListItem disablePadding sx={{ py: 0.5 }}>
                      <ListItemText primary={`${i + 1}. ${tx.description}`} secondary={tx.category_name} />
                      <Typography variant="body2" fontWeight={600} color="error.main" ml={1}>
                        {formatCurrency(Math.abs(tx.amount))}
                      </Typography>
                    </ListItem>
                    {i < data.top_expenses.length - 1 && <Divider />}
                  </div>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Objetivos de Ahorro
              </Typography>
              <Stack spacing={1.5}>
                {data.savings_goals.map((goal) => (
                  <Box key={goal.id}>
                    <Typography variant="body2">{goal.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)} ({goal.progress_percent.toFixed(1)}%)
                    </Typography>
                  </Box>
                ))}
                {data.savings_goals.length === 0 && (
                  <Typography color="text.secondary" textAlign="center" py={2}>Sin objetivos configurados</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

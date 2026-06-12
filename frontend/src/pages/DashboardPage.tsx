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
  Chip,
  LinearProgress,
  useTheme,
  Avatar,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SavingsIcon from '@mui/icons-material/Savings';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { getDashboardSummary } from '../api/dashboard';
import { ACCOUNT_TYPES, formatCurrency, formatPercent, MONTH_NAMES } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';

const CHART_COLORS = ['#6366f1', '#2dd4bf', '#f59e0b', '#f43f5e', '#06b6d4', '#a78bfa', '#34d399', '#fb923c'];

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  trend?: { value: string; positive: boolean };
}

function KpiCard({ title, value, subtitle, icon, iconBg, trend }: KpiCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, fontSize: '0.65rem' }}>
              {title}
            </Typography>
            <Typography variant="h5" fontWeight={700} mt={0.5} sx={{ lineHeight: 1.2 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Stack direction="row" alignItems="center" spacing={0.3} mt={0.5}>
                {trend.positive ? (
                  <TrendingUpIcon sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <TrendingDownIcon sx={{ fontSize: 14, color: 'error.main' }} />
                )}
                <Typography variant="caption" color={trend.positive ? 'success.main' : 'error.main'} fontWeight={600}>
                  {trend.value}
                </Typography>
              </Stack>
            )}
          </Box>
          <Avatar sx={{ bgcolor: iconBg, width: 44, height: 44, borderRadius: 2 }}>
            {icon}
          </Avatar>
        </Stack>
      </CardContent>
    </Card>
  );
}

function HealthScoreCard({ score, status, breakdown }: { score: number; status: string; breakdown?: Array<{ label: string; score: number; context: string }> }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#f43f5e';
  const statusLabel = status === 'healthy' ? 'Saludable' : status === 'watch' ? 'Vigilar' : 'Atención';
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle1" fontWeight={700}>Health Score</Typography>
          <Chip label={statusLabel} size="small" sx={{ bgcolor: color + '22', color, fontWeight: 700, border: `1px solid ${color}44` }} />
        </Stack>
        <Stack direction="row" alignItems="center" spacing={3} mb={2}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <Box sx={{
              width: 80, height: 80, borderRadius: '50%',
              background: `conic-gradient(${color} ${score * 3.6}deg, rgba(100,116,139,0.15) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="h6" fontWeight={800} color={color}>{score}</Typography>
              </Box>
            </Box>
          </Box>
          <Stack spacing={0.5} flex={1}>
            {(breakdown ?? []).slice(0, 4).map((f) => (
                <Box key={f.label}>
                <Stack direction="row" justifyContent="space-between" mb={0.25}>
                  <Typography variant="caption" color="text.secondary">{f.label}</Typography>
                  <Typography variant="caption" fontWeight={600} color={f.score >= 70 ? 'success.main' : f.score >= 45 ? 'warning.main' : 'error.main'}>{f.score}</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(f.score, 100)}
                  sx={{
                    height: 4, borderRadius: 2,
                    bgcolor: 'rgba(100,116,139,0.15)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: f.score >= 70 ? '#22c55e' : f.score >= 45 ? '#f59e0b' : '#f43f5e',
                      borderRadius: 2,
                    },
                  }}
                />
              </Box>
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

const getAccountTypeLabel = (accountType: string) =>
  ACCOUNT_TYPES.find((item) => item.value === accountType)?.label ?? accountType;

export default function DashboardPage() {
  const now = new Date();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
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

  const assetCompositionData = [
    {
      name: 'Liquidez operativa',
      value: Math.max((data.liquid_assets ?? 0) - (data.savings_assets ?? 0), 0),
      color: '#1976d2',
    },
    {
      name: 'Ahorro en cuentas',
      value: Math.max(data.savings_assets ?? 0, 0),
      color: '#2e7d32',
    },
    {
      name: 'Inversiones',
      value: Math.max(data.investment_assets ?? 0, 0),
      color: '#ed6c02',
    },
  ].filter((item) => item.value > 0);

  const totalTrackedAssets = assetCompositionData.reduce((sum, item) => sum + item.value, 0);
  const accountDisplayAmount = (account: (typeof data.accounts)[number]) => (
    account.account_type === 'tarjeta_credito'
      ? (account.available_credit ?? account.balance)
      : account.balance
  );
  const accountsSorted = [...data.accounts].sort(
    (left, right) => Math.abs(accountDisplayAmount(right)) - Math.abs(accountDisplayAmount(left)),
  );

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const next30 = data.cashflow_projection?.next_30_days;
  const next90 = data.cashflow_projection?.next_90_days;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" mb={3} flexWrap="wrap" gap={1}>
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

      {/* Fila 1: Health Score + KPIs de posición */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={4}>
          <HealthScoreCard
            score={data.financial_health_score ?? 0}
            status={data.financial_health_status ?? 'watch'}
            breakdown={data.financial_health_breakdown}
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <Grid container spacing={2} height="100%">
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Patrimonio Neto"
                value={formatCurrency(data.net_worth ?? data.total_balance)}
                subtitle="Activos − deuda CP"
                icon={<AccountBalanceWalletIcon sx={{ fontSize: 22 }} />}
                iconBg="#6366f122"
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Liquidez"
                value={formatCurrency(data.liquid_assets ?? data.total_balance)}
                subtitle="Cuentas corrientes y ahorro"
                icon={<MonetizationOnIcon sx={{ fontSize: 22 }} />}
                iconBg="#2dd4bf22"
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Inversiones"
                value={formatCurrency(data.investment_assets ?? 0)}
                subtitle="Capital invertido"
                icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                iconBg="#22c55e22"
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Deuda Total"
                value={formatCurrency(data.total_debt_exposure ?? 0)}
                subtitle="Tarjetas + cuotas fijas"
                icon={<CreditCardIcon sx={{ fontSize: 22 }} />}
                iconBg="#f43f5e22"
                trend={(data.total_debt_exposure ?? 0) > 0 ? undefined : undefined}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Cupo TC Disponible"
                value={formatCurrency(data.credit_card_available_amount ?? 0)}
                subtitle="Disponible en tarjetas"
                icon={<CreditCardIcon sx={{ fontSize: 22 }} />}
                iconBg="#22c55e22"
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <KpiCard
                title="Cupo TC Total"
                value={formatCurrency(data.credit_card_total_limit ?? 0)}
                subtitle="Limite total tarjetas"
                icon={<CreditCardIcon sx={{ fontSize: 22 }} />}
                iconBg="#6366f122"
              />
            </Grid>
            <Grid item xs={6} sm={4} md={4}>
              <KpiCard
                title="Ingresos del Mes"
                value={formatCurrency(data.income)}
                icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                iconBg="#22c55e22"
              />
            </Grid>
            <Grid item xs={6} sm={4} md={4}>
              <KpiCard
                title="Gastos del Mes"
                value={formatCurrency(data.expenses)}
                icon={<TrendingDownIcon sx={{ fontSize: 22 }} />}
                iconBg="#f59e0b22"
              />
            </Grid>
            <Grid item xs={12} sm={4} md={4}>
              <KpiCard
                title="Tasa de Ahorro"
                value={formatPercent(data.savings_percent)}
                subtitle={formatCurrency(data.savings)}
                icon={<SavingsIcon sx={{ fontSize: 22 }} />}
                iconBg="#a78bfa22"
                trend={{ value: `${data.savings_percent >= 20 ? 'Meta 20%' : 'Bajo meta'}`, positive: data.savings_percent >= 20 }}
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Insights */}
      {(data.dashboard_insights?.length ?? 0) > 0 && (
        <Grid container spacing={2} mb={2}>
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                  <HealthAndSafetyIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                  <Typography variant="subtitle1" fontWeight={700}>Insights</Typography>
                </Stack>
                <Grid container spacing={1.5}>
                  {(data.dashboard_insights ?? []).map((insight, index) => {
                    const borderColor = insight.severity === 'success' ? '#22c55e' : insight.severity === 'warning' ? '#f59e0b' : insight.severity === 'error' ? '#f43f5e' : '#6366f1';
                    return (
                      <Grid item xs={12} md={6} key={`${insight.title}-${index}`}>
                        <Box sx={{ borderLeft: `3px solid ${borderColor}`, pl: 1.5, py: 0.5 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.3}>
                            <Typography variant="body2" fontWeight={700}>{insight.title}</Typography>
                            <Chip
                              size="small"
                              label={insight.severity === 'success' ? 'Bien' : insight.severity === 'warning' ? 'Atención' : insight.severity === 'error' ? 'Urgente' : 'Info'}
                              sx={{ height: 18, fontSize: '0.6rem', bgcolor: borderColor + '22', color: borderColor, border: `1px solid ${borderColor}44` }}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary" display="block">{insight.message}</Typography>
                          {insight.action && (
                            <Typography variant="caption" color="primary.main" display="block" mt={0.3}>→ {insight.action}</Typography>
                          )}
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Gráficos + Cuentas */}
      <Grid container spacing={2} mb={2}>
        {/* Cuentas */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Cuentas</Typography>
              <List dense disablePadding>
                {accountsSorted.map((account, index) => (
                  <div key={account.id}>
                    <ListItem disablePadding sx={{ py: 0.75 }}>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={500}>{account.name}</Typography>}
                        secondary={(
                          <Typography variant="caption" color="text.disabled">
                            {getAccountTypeLabel(account.account_type)}
                            {account.account_type === 'tarjeta_credito' && (
                              <> · Cupo total {formatCurrency(account.credit_limit ?? account.balance, account.currency)}</>
                            )}
                          </Typography>
                        )}
                      />
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        ml={1}
                        color={account.account_type === 'tarjeta_credito' ? 'success.main' : (account.balance < 0 ? 'error.main' : 'text.primary')}
                      >
                        {formatCurrency(accountDisplayAmount(account), account.currency)}
                      </Typography>
                    </ListItem>
                    {index < accountsSorted.length - 1 && <Divider />}
                  </div>
                ))}
                {accountsSorted.length === 0 && (
                  <Typography color="text.secondary" textAlign="center" py={3} variant="body2">Sin cuentas activas</Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Tendencia mensual */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Tendencia Mensual</Typography>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gastos por categoría + Objetivos de ahorro */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={1}>Gastos por Categoría</Typography>
              {pieData.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4} variant="body2">Sin datos</Typography>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" labelLine={false}>
                        {pieData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip formatter={(val: number) => formatCurrency(val)} contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: 'none', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Stack spacing={0.5} mt={0.5}>
                    {pieData.slice(0, 6).map((item, index) => (
                      <Stack key={item.name} direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_COLORS[index % CHART_COLORS.length], flexShrink: 0 }} />
                          <Typography variant="caption" noWrap maxWidth={140}>{item.name}</Typography>
                        </Stack>
                        <Typography variant="caption" fontWeight={600}>{formatCurrency(item.value)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Grid container spacing={2}>
            {/* Objetivos */}
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Objetivos de Ahorro</Typography>
                  {data.savings_goals.length === 0 ? (
                    <Typography color="text.secondary" textAlign="center" py={2} variant="body2">Sin objetivos configurados</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {data.savings_goals.slice(0, 5).map((goal) => {
                        const pct = Math.min(goal.progress_percent, 100);
                        const barColor = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#6366f1';
                        return (
                          <Box key={goal.id}>
                            <Stack direction="row" justifyContent="space-between" mb={0.4}>
                              <Typography variant="body2" fontWeight={500}>{goal.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{pct.toFixed(0)}%</Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{
                                height: 6, borderRadius: 3,
                                bgcolor: 'rgba(100,116,139,0.15)',
                                '& .MuiLinearProgress-bar': { bgcolor: barColor, borderRadius: 3 },
                              }}
                            />
                            <Stack direction="row" justifyContent="space-between" mt={0.3}>
                              <Typography variant="caption" color="text.disabled">{formatCurrency(goal.current_amount)}</Typography>
                              <Typography variant="caption" color="text.disabled">{formatCurrency(goal.target_amount)}</Typography>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
            {/* Top Gastos */}
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" fontWeight={700} mb={1}>Top Gastos del Mes</Typography>
                  <List dense disablePadding>
                    {data.top_expenses.slice(0, 6).map((tx, i) => (
                      <div key={tx.id}>
                        <ListItem disablePadding sx={{ py: 0.5 }}>
                          <Typography variant="caption" color="text.disabled" sx={{ mr: 1, minWidth: 16 }}>{i + 1}</Typography>
                          <ListItemText
                            primary={<Typography variant="body2" noWrap maxWidth={200}>{tx.description}</Typography>}
                            secondary={<Typography variant="caption" color="text.disabled">{tx.category_name}</Typography>}
                          />
                          <Typography variant="body2" fontWeight={700} color="error.main" ml={1} flexShrink={0}>
                            {formatCurrency(Math.abs(tx.amount))}
                          </Typography>
                        </ListItem>
                        {i < Math.min(data.top_expenses.length, 6) - 1 && <Divider />}
                      </div>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Flujo de caja proyectado */}
      {(next30 || next90) && (
        <Grid container spacing={2} mb={2}>
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle1" fontWeight={700}>Flujo de Caja Proyectado</Typography>
                  {next30 && next30.projected_net_balance < 0 && (
                    <Chip size="small" color="warning" label="Presión en próximos 30 días" />
                  )}
                </Stack>
                <Grid container spacing={2}>
                  {next30 && (
                    <Grid item xs={12} md={6}>
                      <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight={700} letterSpacing="0.06em">Próximos 30 días</Typography>
                        <Typography variant="h5" fontWeight={700} mt={0.5} color={next30.projected_net_balance >= 0 ? 'success.main' : 'error.main'}>
                          {formatCurrency(next30.projected_net_balance)}
                        </Typography>
                        <Stack spacing={0.5} mt={1.5}>
                          {[['Ingresos', next30.projected_income, 'success.main'], ['Gastos', next30.projected_expenses, 'text.secondary'], ['Ahorro sugerido', next30.projected_savings, 'primary.main']].map(([label, val, color]) => (
                            <Stack key={label as string} direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">{label}</Typography>
                              <Typography variant="body2" fontWeight={600} color={color as string}>{formatCurrency(val as number)}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Box>
                    </Grid>
                  )}
                  {next90 && (
                    <Grid item xs={12} md={6}>
                      <Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight={700} letterSpacing="0.06em">Próximos 90 días</Typography>
                        <Typography variant="h5" fontWeight={700} mt={0.5} color={next90.projected_net_balance >= 0 ? 'success.main' : 'error.main'}>
                          {formatCurrency(next90.projected_net_balance)}
                        </Typography>
                        <Stack spacing={0.5} mt={1.5}>
                          {[['Ingresos', next90.projected_income, 'success.main'], ['Gastos', next90.projected_expenses, 'text.secondary'], ['Ahorro sugerido', next90.projected_savings, 'primary.main']].map(([label, val, color]) => (
                            <Stack key={label as string} direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">{label}</Typography>
                              <Typography variant="body2" fontWeight={600} color={color as string}>{formatCurrency(val as number)}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

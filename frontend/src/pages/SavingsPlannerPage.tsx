import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FlagIcon from '@mui/icons-material/Flag';

import { getSavingsAnnualProjection, getSavingsDistributionPlan } from '../api/savingsGoals';
import type {
  SavingsAnnualProjectionMonth,
  SavingsDistributionAccountItem,
  SavingsDistributionGoalItem,
} from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

function FeasibilityChip({ value }: { value: 'on_track' | 'tight' | 'unfunded' }) {
  if (value === 'on_track') return <Chip size="small" color="success" label="Factible" variant="outlined" />;
  if (value === 'tight') return <Chip size="small" color="warning" label="Ajustado" variant="outlined" />;
  return <Chip size="small" color="error" label="Sin capacidad" variant="outlined" />;
}

export default function SavingsPlannerPage() {
  const currentYear = new Date().getFullYear();
  const [startMonth, setStartMonth] = useState(`${currentYear}-01`);
  const [endMonth, setEndMonth] = useState(`${currentYear}-12`);
  const [savingsMultiplier, setSavingsMultiplier] = useState(1.0);

  const startDate = useMemo(() => `${startMonth}-01`, [startMonth]);
  const endDate = useMemo(() => `${endMonth}-01`, [endMonth]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['savings-distribution-plan'],
    queryFn: getSavingsDistributionPlan,
  });

  const {
    data: annualProjection,
    isLoading: annualLoading,
    error: annualError,
    refetch: refetchAnnual,
  } = useQuery({
    queryKey: ['savings-annual-projection', startDate, endDate],
    queryFn: () => getSavingsAnnualProjection(startDate, endDate),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <Alert severity="error">No se pudo cargar el plan de ahorro.</Alert>;

  return (
    <Box>
      <PageHeader
        title="Plan de Ahorro"
        subtitle="Distribución mensual sugerida entre objetivos y cuentas de ahorro"
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <SavingsIcon color="primary" />
                <Typography variant="body2" color="text.secondary">Ahorro mensual proyectado</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700}>{formatCurrency(data.projected_monthly_savings)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <FlagIcon color="success" />
                <Typography variant="body2" color="text.secondary">Asignación a objetivos</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="success.main">{formatCurrency(data.distribution_to_goals)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <AccountBalanceWalletIcon color="warning" />
                <Typography variant="body2" color="text.secondary">Asignación a cuentas</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} color="warning.main">{formatCurrency(data.distribution_to_accounts)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={1}>Distribución por objetivos</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Objetivo</TableCell>
                  <TableCell align="right">Restante</TableCell>
                  <TableCell align="right">Necesario / mes</TableCell>
                  <TableCell align="right">Sugerido / mes</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.goals.map((goal: SavingsDistributionGoalItem) => (
                  <TableRow key={goal.goal_id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{goal.goal_name}</Typography>
                      {goal.target_date && (
                        <Typography variant="caption" color="text.secondary">
                          Fecha objetivo: {formatDate(goal.target_date)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(goal.remaining_amount)}</TableCell>
                    <TableCell align="right">{formatCurrency(goal.monthly_needed ?? 0)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(goal.suggested_monthly_amount)}</TableCell>
                    <TableCell><FeasibilityChip value={goal.feasibility} /></TableCell>
                  </TableRow>
                ))}
                {data.goals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">No hay objetivos activos para distribuir.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={1}>Distribución por cuentas de ahorro</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cuenta</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Saldo actual</TableCell>
                  <TableCell align="right">Sugerido / mes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.savings_accounts.map((account: SavingsDistributionAccountItem) => (
                  <TableRow key={account.account_id}>
                    <TableCell>{account.account_name}</TableCell>
                    <TableCell>{account.account_type}</TableCell>
                    <TableCell align="right">{formatCurrency(account.current_balance)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(account.suggested_monthly_amount)}</TableCell>
                  </TableRow>
                ))}
                {data.savings_accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">No hay cuentas de ahorro/inversión/efectivo activas.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {data.recommendations.length > 0 && (
        <Stack spacing={1}>
          {data.recommendations.map((msg) => (
            <Alert key={msg} severity="info">{msg}</Alert>
          ))}
        </Stack>
      )}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
            spacing={2}
            mb={2}
          >
            <Typography variant="subtitle1" fontWeight={700}>Proyección anual de ahorro</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Desde"
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Hasta"
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <Button variant="outlined" onClick={() => refetchAnnual()}>Actualizar</Button>
            </Stack>
          </Stack>

          {annualLoading && <LoadingSpinner />}
          {annualError && <Alert severity="error">No se pudo cargar la proyección anual para el rango seleccionado.</Alert>}

          {annualProjection && (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                  <Typography variant="body2" color="text.secondary">Total ahorro proyectado</Typography>
                  <Typography variant="h6" fontWeight={700}>{formatCurrency(annualProjection.total_projected_savings)}</Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="body2" color="text.secondary">Total a objetivos</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">{formatCurrency(annualProjection.total_to_goals)}</Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="body2" color="text.secondary">Total a cuentas</Typography>
                  <Typography variant="h6" fontWeight={700} color="warning.main">{formatCurrency(annualProjection.total_to_accounts)}</Typography>
                </Grid>
              </Grid>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mes</TableCell>
                      <TableCell align="right">Ahorro proyectado</TableCell>
                      <TableCell align="right">A objetivos</TableCell>
                      <TableCell align="right">A cuentas</TableCell>
                      <TableCell align="right">Acumulado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {annualProjection.months.map((m: SavingsAnnualProjectionMonth) => (
                      <TableRow key={m.period}>
                        <TableCell>{m.period}</TableCell>
                        <TableCell align="right">{formatCurrency(m.projected_savings)}</TableCell>
                        <TableCell align="right">{formatCurrency(m.to_goals)}</TableCell>
                        <TableCell align="right">{formatCurrency(m.to_accounts)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(m.cumulative_savings)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Timeline simulation */}
      {data.goals.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>
              Simulador de plazos
            </Typography>

            <Box sx={{ mb: 3 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Multiplicador de ahorro mensual: <strong>{savingsMultiplier.toFixed(1)}x</strong>
                  </Typography>
                  <Slider
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={savingsMultiplier}
                    onChange={(_e, val) => setSavingsMultiplier(val as number)}
                    marks={[
                      { value: 0.5, label: '0.5x' },
                      { value: 1, label: '1x' },
                      { value: 2, label: '2x' },
                      { value: 3, label: '3x' },
                    ]}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${(v as number).toFixed(1)}x`}
                  />
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    Ajusta el multiplicador para simular diferentes montos de ahorro mensual
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Objetivo</TableCell>
                    <TableCell align="right">Restante</TableCell>
                    <TableCell align="right">Ahorro sugerido</TableCell>
                    <TableCell align="right">Ahorro simulado</TableCell>
                    <TableCell align="right">Tiempo actual</TableCell>
                    <TableCell align="right">Tiempo simulado</TableCell>
                    <TableCell align="right">Ahorro</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.goals.map((goal: SavingsDistributionGoalItem) => {
                    const simulatedMonthly = goal.suggested_monthly_amount * savingsMultiplier;
                    const currentMonths = goal.remaining_amount > 0 ? Math.ceil(goal.remaining_amount / goal.suggested_monthly_amount) : 0;
                    const simulatedMonths = goal.remaining_amount > 0 && simulatedMonthly > 0 ? Math.ceil(goal.remaining_amount / simulatedMonthly) : 0;
                    const monthsSaved = currentMonths - simulatedMonths;
                    const monthsColor = monthsSaved > 0 ? 'success.main' : 'inherit';

                    return (
                      <TableRow key={goal.goal_id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{goal.goal_name}</Typography>
                          {goal.target_date && (
                            <Typography variant="caption" color="text.secondary">
                              Objetivo: {formatDate(goal.target_date)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(goal.remaining_amount)}</TableCell>
                        <TableCell align="right">{formatCurrency(goal.suggested_monthly_amount)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={savingsMultiplier !== 1 ? 'primary.main' : 'inherit'}>
                            {formatCurrency(simulatedMonthly)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack alignItems="flex-end">
                            <Typography variant="body2" fontWeight={700}>{currentMonths} meses</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {Math.ceil(currentMonths / 12)} años
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Stack alignItems="flex-end">
                            <Typography variant="body2" fontWeight={700} color={savingsMultiplier !== 1 ? 'primary.main' : 'inherit'}>
                              {simulatedMonths} meses
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {Math.ceil(simulatedMonths / 12)} años
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={monthsColor}>
                            {monthsSaved > 0 ? `-${monthsSaved} meses` : monthsSaved < 0 ? `+${Math.abs(monthsSaved)} meses` : 'Sin cambio'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}


import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { getDashboardSummary } from '../../api/dashboard';
import { formatCurrency } from '../../utils/formatters';

export default function FinancialPulse() {
  const dashboardQ = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: () => getDashboardSummary(),
    refetchInterval: 60_000,
  });

  if (dashboardQ.isLoading) return null;
  if (dashboardQ.isError || !dashboardQ.data) return null;

  const d = dashboardQ.data as any;

  return (
    <Alert
      severity={d.financial_health_status === 'healthy' ? 'success' : d.financial_health_status === 'watch' ? 'warning' : 'error'}
      sx={{ borderRadius: 0 }}
    >
      <Box>
        <Typography variant="body2" fontWeight={700}>
          Pulso financiero ({d.period?.month}/{d.period?.year})
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mt={0.5} flexWrap="wrap">
          <Chip size="small" label={`Score: ${d.financial_health_score ?? 0}/100`} color={d.financial_health_status === 'healthy' ? 'success' : d.financial_health_status === 'watch' ? 'warning' : 'error'} />
          <Chip size="small" label={`Patrimonio: ${formatCurrency(d.net_worth ?? d.total_balance ?? 0)}`} />
          <Chip size="small" label={`Cupo TC disponible: ${formatCurrency(d.credit_card_available_amount ?? 0)}`} color="success" />
          <Chip size="small" label={`Cupo TC total: ${formatCurrency(d.credit_card_total_limit ?? 0)}`} />
          <Chip size="small" label={`Hipoteca: ${formatCurrency(d.mortgage_remaining_debt ?? 0)}`} />
          <Chip size="small" label={`Deuda fija dinamica: ${formatCurrency(d.fixed_installment_debt ?? 0)}`} color={(d.fixed_installment_debt ?? 0) > 0 ? 'warning' : 'default'} />
          <Chip size="small" label={`Ahorro mes: ${formatCurrency(d.savings ?? 0)}`} />
          <Chip size="small" label={`Meta sugerida ahorro: ${formatCurrency(d.recommended_monthly_saving ?? 0)}`} color="primary" />
          <Chip size="small" label={`Gasto proyectado mes: ${formatCurrency(d.projected_month_expenses ?? 0)}`} />
          <Chip size="small" label={`Brecha ahorro: ${formatCurrency(d.savings_gap_to_target ?? 0)}`} color={(d.savings_gap_to_target ?? 0) > 0 ? 'warning' : 'success'} />
        </Stack>
      </Box>
    </Alert>
  );
}

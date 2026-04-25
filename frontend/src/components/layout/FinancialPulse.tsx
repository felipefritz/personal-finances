import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { getDashboardSummary } from '../../api/dashboard';
import { getAgentAnalysis } from '../../api/agent';
import { formatCurrency } from '../../utils/formatters';

export default function FinancialPulse() {
  const dashboardQ = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: () => getDashboardSummary(),
    refetchInterval: 60_000,
  });

  const agentQ = useQuery({
    queryKey: ['agent-pulse'],
    queryFn: () => getAgentAnalysis(),
    refetchInterval: 60_000,
  });

  if (dashboardQ.isLoading || agentQ.isLoading) return null;
  if (dashboardQ.isError || agentQ.isError || !dashboardQ.data || !agentQ.data) return null;

  const d = dashboardQ.data as any;
  const a = agentQ.data;
  const topRecs = (a.recommendations || []).slice(0, 2);

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
          <Chip size="small" label={`Patrimonio: ${formatCurrency(d.net_worth ?? d.total_balance ?? 0)}`} />
          <Chip size="small" label={`Ahorro mes: ${formatCurrency(d.savings ?? 0)}`} />
          <Chip size="small" label={`Meta sugerida ahorro: ${formatCurrency(d.recommended_monthly_saving ?? 0)}`} color="primary" />
          <Chip size="small" label={`Gasto proyectado mes: ${formatCurrency(d.projected_month_expenses ?? 0)}`} />
          <Chip size="small" label={`Brecha ahorro: ${formatCurrency(d.savings_gap_to_target ?? 0)}`} color={(d.savings_gap_to_target ?? 0) > 0 ? 'warning' : 'success'} />
        </Stack>
        {topRecs.length > 0 && (
          <Stack spacing={0.5} mt={1}>
            {topRecs.map((r, i) => (
              <Typography key={i} variant="caption" display="block">
                • {r.title}: {r.message}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>
    </Alert>
  );
}

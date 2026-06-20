import { useQuery } from '@tanstack/react-query';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { getDashboardSummary } from '../../api/dashboard';
import { formatCurrency } from '../../utils/formatters';
import type { DashboardSummary } from '../../types';

function Metric({
  label,
  value,
  tone = 'neutral',
  helper,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  helper?: string;
}) {
  const colorMap = {
    neutral: 'text.primary',
    good: 'success.main',
    warn: 'warning.main',
    bad: 'error.main',
  } as const;

  return (
    <Box sx={{ minWidth: { xs: '45%', sm: 150 }, flex: { xs: '1 1 45%', md: '0 0 auto' } }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800} color={colorMap[tone]} noWrap>
        {value}
      </Typography>
      {helper && (
        <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
          {helper}
        </Typography>
      )}
    </Box>
  );
}

export default function FinancialPulse() {
  const dashboardQ = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: () => getDashboardSummary(),
    refetchInterval: 60_000,
  });

  if (dashboardQ.isLoading) return null;
  if (dashboardQ.isError || !dashboardQ.data) return null;

  const d = dashboardQ.data as DashboardSummary;
  const status = d.financial_health_status ?? 'watch';
  const statusLabel = status === 'healthy' ? 'En orden' : status === 'risk' ? 'Revisar hoy' : 'Vigilar';
  const statusColor = status === 'healthy' ? 'success' : status === 'risk' ? 'error' : 'warning';
  const availableCash = d.liquid_assets ?? d.total_balance ?? 0;
  const cardDebt = d.credit_card_used_amount ?? d.short_term_debt ?? 0;
  const monthResult = d.effective_savings ?? d.savings ?? 0;
  const next30 = d.cashflow_projection?.next_30_days?.projected_net_balance;

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 2.5, md: 3 },
        py: 1.25,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 1, md: 2 }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { md: 190 } }}>
          <Chip
            size="small"
            color={statusColor}
            label={statusLabel}
            sx={{ fontWeight: 800 }}
          />
          <Typography variant="body2" fontWeight={700}>
            Pulso {d.period?.month}/{d.period?.year}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={{ xs: 1.5, md: 3 }} flexWrap="wrap" useFlexGap sx={{ width: '100%' }}>
          <Metric label="Dinero disponible" value={formatCurrency(availableCash)} />
          <Metric
            label="Deuda en tarjetas"
            value={formatCurrency(cardDebt)}
            tone={cardDebt > 0 ? 'bad' : 'good'}
            helper={`Cupo libre ${formatCurrency(d.credit_card_available_amount ?? 0)}`}
          />
          <Metric
            label="Resultado del mes"
            value={formatCurrency(monthResult)}
            tone={monthResult >= 0 ? 'good' : 'bad'}
            helper={`Meta ahorro ${formatCurrency(d.recommended_monthly_saving ?? 0)}`}
          />
          <Metric
            label="Caja próximos 30 días"
            value={typeof next30 === 'number' ? formatCurrency(next30) : 'Sin proyección'}
            tone={typeof next30 === 'number' ? (next30 >= 0 ? 'good' : 'bad') : 'neutral'}
          />
        </Stack>
      </Stack>
    </Box>
  );
}

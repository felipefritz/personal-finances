import { Card, CardContent, Grid, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/formatters';
import type { MonthlyBalance } from '../../types';

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

export default function ProjectionKpis({ months, year }: { months: MonthlyBalance[]; year: number }) {
  const totalIncome = months.reduce((s, m) => s + m.total_income, 0);
  const totalExpenses = months.reduce((s, m) => s + m.total_expenses, 0);
  const totalInstallments = months.reduce((s, m) => s + m.pending_installments, 0);
  const totalSavings = months.reduce((s, m) => s + m.total_suggested_savings, 0);
  const totalNet = months.reduce((s, m) => s + m.net_balance, 0);
  const negativeMonths = months.filter((m) => m.net_balance < 0).length;

  return (
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
  );
}

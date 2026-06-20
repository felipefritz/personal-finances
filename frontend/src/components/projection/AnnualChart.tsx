import { Card, CardContent, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import type { MonthlyBalance } from '../../types';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function AnnualChart({ months, year }: { months: MonthlyBalance[]; year: number }) {
  const chartData = months.map((m) => ({
    name: MONTH_SHORT[m.month - 1],
    isActual: m.is_actual,
    Ingresos: m.total_income,
    'Gtos Fijos': m.fixed_expenses,
    'Gtos TC/Variables': m.variable_expenses,
    Cuotas: m.pending_installments,
    'Ahorro sugerido': m.total_suggested_savings,
    'Disponible día a día': m.available_balance,
    'Caja final': m.net_balance,
  }));

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Balance mensual {year}
          <Tooltip title="Disponible día a día es la caja que queda después de ingresos menos gastos y cuotas, antes del ahorro sugerido. Caja final descuenta además el ahorro planificado.">
            <InfoOutlinedIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
          </Tooltip>
        </Typography>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
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
            <Line
              type="monotone"
              dataKey="Disponible día a día"
              stroke="#00acc1"
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="Caja final"
              stroke="#7e57c2"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { useAuthedResource } from '../api/useAuthedResource';
import { EmptyState } from '../components/EmptyState';
import { FinanceTable } from '../components/FinanceTable';
import { HelpTip } from '../components/HelpTip';
import { LoadingBlock } from '../components/LoadingBlock';
import { MiniBarChart } from '../components/MiniBarChart';
import { Screen } from '../components/Screen';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { spacing, useTheme } from '../theme/theme';
import type { ProjectionMonth } from '../types';
import { formatCurrency } from '../utils/formatters';

export function ProjectionScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const loader = useCallback((token: string) => api.projection(token), []);
  const { data, error, isLoading, isRefreshing, refresh } = useAuthedResource<ProjectionMonth[]>(loader);

  if (isLoading && !data) {
    return (
      <Screen title="Proyeccion" subtitle="Disponible estimado mes a mes.">
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  const nextMonth = data?.[0];
  const chartData = (data ?? []).slice(0, 8).map((month) => ({
    label: month.label.slice(0, 3),
    value: month.available_balance,
    secondaryValue: month.total_expenses,
  }));

  return (
    <Screen
      title="Proyeccion"
      subtitle="Separa plata disponible de pagos comprometidos."
      refreshing={isRefreshing}
      onRefresh={refresh}
    >
      {error ? <LoadingBlock error={error} /> : null}

      {nextMonth ? (
        <View style={styles.grid}>
          <StatCard
            label="Disponible proximo mes"
            value={formatCurrency(nextMonth.available_balance)}
            helper="Despues de fijos y gasto variable"
            tone={nextMonth.available_balance >= 0 ? 'good' : 'danger'}
          />
          <StatCard
            label="Caja final"
            value={formatCurrency(nextMonth.net_balance)}
            helper="Resultado proyectado total"
            tone={nextMonth.net_balance >= 0 ? 'good' : 'danger'}
          />
        </View>
      ) : null}

      <HelpTip
        title="Disponible no es saldo total"
        body="Esta vista intenta mostrar cuánto queda para el día a día después de ingresos, pagos fijos, cuotas y ahorro sugerido."
      />

      {!data || data.length === 0 ? (
        <EmptyState title="Sin proyeccion" body="Agrega ingresos, gastos fijos y presupuestos para proyectar los proximos meses." />
      ) : (
        <>
          <SectionCard>
            <MiniBarChart
              title="Presion mensual"
              data={chartData}
              primaryLabel="Disponible"
              secondaryLabel="Comprometido"
            />
          </SectionCard>
          {data.map((month) => (
            <SectionCard key={month.month}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthTitle}>{month.label}</Text>
                <Text style={[styles.monthAmount, month.available_balance >= 0 ? styles.good : styles.bad]}>
                  {formatCurrency(month.available_balance)}
                </Text>
              </View>
              <FinanceTable
                rows={[
                  { label: 'Ingresos', value: formatCurrency(month.total_income), tone: 'good' },
                  { label: 'Comprometido', value: formatCurrency(month.total_expenses), detail: 'Fijos, cuotas y gasto esperado.', tone: 'warn' },
                  { label: 'Ahorro sugerido', value: formatCurrency(month.total_suggested_savings) },
                  { label: 'Caja final', value: formatCurrency(month.net_balance), tone: month.net_balance >= 0 ? 'good' : 'bad' },
                ]}
              />
            </SectionCard>
          ))}
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  monthTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  monthAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  good: {
    color: colors.success,
  },
  bad: {
    color: colors.danger,
  },
  breakdown: {
    gap: spacing.sm,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  breakdownLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
});

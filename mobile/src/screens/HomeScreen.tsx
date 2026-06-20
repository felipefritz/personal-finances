import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { useAuthedResource } from '../api/useAuthedResource';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { FinanceTable } from '../components/FinanceTable';
import { HelpTip } from '../components/HelpTip';
import { LoadingBlock } from '../components/LoadingBlock';
import { MiniBarChart } from '../components/MiniBarChart';
import { Screen } from '../components/Screen';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { radii, spacing, useTheme } from '../theme/theme';
import type { HomeSummary } from '../types';
import { formatCurrency, formatPercent, monthYearLabel } from '../utils/formatters';

type HomeScreenProps = {
  onOpenTab: (tab: 'transactions' | 'budgets' | 'projection' | 'accounts') => void;
};

export function HomeScreen({ onOpenTab }: HomeScreenProps) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const loader = useCallback((token: string) => api.home(token), []);
  const { data, error, isLoading, isRefreshing, refresh } = useAuthedResource<HomeSummary>(loader);

  if (isLoading && !data) {
    return (
      <Screen title="Inicio" subtitle="Tu resumen financiero del mes.">
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen title="Inicio" subtitle="Tu resumen financiero del mes." refreshing={isRefreshing} onRefresh={refresh}>
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  const nextMonth = data.projection[0];
  const tightBudgets = data.budgets
    .filter((budget) => budget.expected_amount > 0 && budget.actual_amount / budget.expected_amount >= 0.8)
    .slice(0, 3);
  const financialScore = Math.max(
    0,
    Math.min(
      100,
      55 +
        (data.free_balance > 0 ? 15 : -20) +
        (data.net_balance > 0 ? 15 : -15) +
        (tightBudgets.length === 0 ? 10 : -tightBudgets.length * 5) +
        (nextMonth?.available_balance > 0 ? 5 : -10),
    ),
  );
  const projectionChart = data.projection.slice(0, 6).map((month) => ({
    label: month.label.slice(0, 3),
    value: month.available_balance,
    secondaryValue: month.total_expenses,
  }));

  return (
    <Screen
      title={`Hola${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
      subtitle={`Resumen de ${monthYearLabel(data.year, data.month)}`}
      refreshing={isRefreshing}
      onRefresh={refresh}
      action={
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Salir</Text>
        </Pressable>
      }
    >
      {error ? <LoadingBlock error={error} /> : null}

      <View style={styles.grid}>
        <StatCard
          label="Disponible"
          value={formatCurrency(data.free_balance)}
          helper="Para gastos del dia a dia"
          tone={data.free_balance >= 0 ? 'good' : 'danger'}
        />
        <StatCard
          label="Comprometido"
          value={formatCurrency(data.total_expenses)}
          helper="Gastos del mes"
          tone="warn"
        />
        <StatCard
          label="Resultado mes"
          value={formatCurrency(data.net_balance)}
          helper="Ingresos menos gastos"
          tone={data.net_balance >= 0 ? 'good' : 'danger'}
        />
        <StatCard
          label="Ahorro sugerido"
          value={formatCurrency(data.suggested_savings)}
          helper="Meta simple del mes"
          tone="default"
        />
      </View>

      <SectionCard title="Siguiente paso">
        <Text style={styles.bodyText}>
          {nextMonth
            ? `Para ${nextMonth.label.toLowerCase()}, te quedarian ${formatCurrency(
                nextMonth.available_balance,
              )} disponibles despues de ingresos, pagos fijos y gasto variable esperado.`
            : 'Agrega ingresos, cuentas y gastos para construir una proyeccion util.'}
        </Text>
        <View style={styles.quickActions}>
          <Pressable onPress={() => onOpenTab('transactions')} style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>Agregar gasto</Text>
          </Pressable>
          <Pressable onPress={() => onOpenTab('projection')} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Ver proyeccion</Text>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="Pulso financiero">
        <View style={styles.scoreRow}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>{financialScore}</Text>
            <Text style={styles.scoreLabel}>/100</Text>
          </View>
          <View style={styles.scoreText}>
            <Text style={styles.scoreTitle}>
              {financialScore >= 75 ? 'Mes ordenado' : financialScore >= 55 ? 'Mes controlable' : 'Mes apretado'}
            </Text>
            <Text style={styles.scoreBody}>
              {financialScore >= 75
                ? 'Tienes margen para sostener gastos y ahorrar sin forzar la caja.'
                : financialScore >= 55
                  ? 'Conviene revisar presupuestos y evitar gastos grandes no planificados.'
                  : 'Prioriza pagos obligatorios y reduce gasto variable hasta recuperar disponible.'}
            </Text>
          </View>
        </View>
      </SectionCard>

      <HelpTip
        title="Cómo leer esta pantalla"
        body="Disponible es dinero libre para usar. Comprometido son pagos y gastos del mes. El pulso combina ambos para avisarte si el mes viene sano o apretado."
      />

      <SectionCard>
        <MiniBarChart
          title="Disponible vs. comprometido"
          data={projectionChart}
          primaryLabel="Disponible"
          secondaryLabel="Comprometido"
        />
      </SectionCard>

      <SectionCard title="Diagnostico del mes">
        <FinanceTable
          rows={[
            {
              label: 'Saldo libre',
              value: formatCurrency(data.free_balance),
              detail: 'Dinero disponible en cuentas despues de reservas.',
              tone: data.free_balance >= 0 ? 'good' : 'bad',
            },
            {
              label: 'Flujo mensual',
              value: formatCurrency(data.net_balance),
              detail: 'Resultado despues de ingresos, gastos y ahorro sugerido.',
              tone: data.net_balance >= 0 ? 'good' : 'bad',
            },
            {
              label: 'Presupuestos activos',
              value: String(data.budgets.length),
              detail: tightBudgets.length > 0 ? `${tightBudgets.length} requieren atencion.` : 'Sin alertas fuertes.',
              tone: tightBudgets.length > 0 ? 'warn' : 'good',
            },
            {
              label: 'Proximo disponible',
              value: nextMonth ? formatCurrency(nextMonth.available_balance) : '-',
              detail: 'Lo que queda para dia a dia en el siguiente mes.',
              tone: nextMonth && nextMonth.available_balance >= 0 ? 'good' : 'bad',
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Movimientos recientes">
        {data.recent_transactions.length === 0 ? (
          <EmptyState title="Sin movimientos aun" body="Registra tus gastos e ingresos para ver tu pulso mensual." />
        ) : (
          data.recent_transactions.map((transaction) => (
            <View key={transaction.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{transaction.description}</Text>
                <Text style={styles.rowMeta}>{transaction.category_name || transaction.account_name || 'Sin categoria'}</Text>
              </View>
              <Text style={[styles.amount, transaction.transaction_type === 'expense' ? styles.negative : styles.positive]}>
                {transaction.transaction_type === 'expense' ? '-' : '+'}
                {formatCurrency(transaction.amount)}
              </Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Presupuestos a mirar">
        {tightBudgets.length === 0 ? (
          <Text style={styles.bodyText}>No hay presupuestos cerca del limite. Bien ahi, manten el ritmo.</Text>
        ) : (
          tightBudgets.map((budget) => (
            <View key={budget.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{budget.category_name}</Text>
                <Text style={styles.rowMeta}>
                  {formatPercent((budget.actual_amount / budget.expected_amount) * 100)} usado
                </Text>
              </View>
              <Text style={styles.amount}>{formatCurrency(budget.expected_amount - budget.actual_amount)}</Text>
            </View>
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  logoutButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  logoutText: {
    color: colors.text,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  bodyText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreCircle: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 43,
    borderWidth: 6,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  scoreValue: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  scoreLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  scoreText: {
    flex: 1,
    gap: 4,
  },
  scoreTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  scoreBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    color: colors.onPrimary,
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryActionText: {
    color: colors.text,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  amount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  negative: {
    color: colors.danger,
  },
  positive: {
    color: colors.success,
  },
});

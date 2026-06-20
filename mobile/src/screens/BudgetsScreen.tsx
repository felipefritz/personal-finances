import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import { useAuthedResource } from '../api/useAuthedResource';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { HelpTip } from '../components/HelpTip';
import { LoadingBlock } from '../components/LoadingBlock';
import { Screen } from '../components/Screen';
import { SectionCard } from '../components/SectionCard';
import { radii, spacing, useTheme } from '../theme/theme';
import type { Account, Budget, Category, FixedExpense, RecurringIncome, SavingsGoal } from '../types';
import { formatCurrency, formatPercent, todayIsoDate } from '../utils/formatters';

type PlanningData = {
  budgets: Budget[];
  categories: Category[];
  accounts: Account[];
  recurringIncomes: RecurringIncome[];
  fixedExpenses: FixedExpense[];
  savingsGoals: SavingsGoal[];
};

type ActiveForm = 'budget' | 'income' | 'fixed' | 'goal' | null;

const expenseTypes = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'credito', label: 'Credito' },
  { value: 'colegio', label: 'Colegio' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'suscripcion', label: 'Suscripcion' },
  { value: 'otro', label: 'Otro' },
];

const incomeTypes = [
  { value: 'sueldo', label: 'Sueldo' },
  { value: 'honorarios', label: 'Honorarios' },
  { value: 'arriendo', label: 'Arriendo' },
  { value: 'otro', label: 'Otro' },
];

function parseAmount(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function BudgetsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const loader = useCallback(async (authToken: string): Promise<PlanningData> => {
    const [budgets, categories, accounts, recurringIncomes, fixedExpenses, savingsGoals] = await Promise.all([
      api.budgets(authToken),
      api.categories(authToken),
      api.accounts(authToken),
      api.recurringIncomes(authToken),
      api.fixedExpenses(authToken),
      api.savingsGoals(authToken),
    ]);
    return { budgets, categories, accounts, recurringIncomes, fixedExpenses, savingsGoals };
  }, []);
  const { data, error, isLoading, isRefreshing, refresh } = useAuthedResource<PlanningData>(loader);

  const defaultPeriod = useMemo(currentMonthYear, []);
  const [budgetCategoryId, setBudgetCategoryId] = useState<number | null>(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetMonth, setBudgetMonth] = useState(String(defaultPeriod.month));
  const [budgetYear, setBudgetYear] = useState(String(defaultPeriod.year));

  const [incomeName, setIncomeName] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeType, setIncomeType] = useState('sueldo');
  const [incomeDay, setIncomeDay] = useState('1');
  const [incomeAccountId, setIncomeAccountId] = useState<number | null>(null);

  const [fixedName, setFixedName] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [fixedType, setFixedType] = useState('servicio');
  const [fixedDay, setFixedDay] = useState('5');
  const [fixedAccountId, setFixedAccountId] = useState<number | null>(null);
  const [fixedCategoryId, setFixedCategoryId] = useState<number | null>(null);
  const [amountMode, setAmountMode] = useState<'monthly' | 'total'>('monthly');
  const [installments, setInstallments] = useState('');

  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalDate, setGoalDate] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);

  async function runSave(key: string, action: () => Promise<void>) {
    setFormError(null);
    setSavingKey(key);
    try {
      await action();
      await refresh();
      setActiveForm(null);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'No se pudo guardar.');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveBudget() {
    if (!token || !budgetCategoryId) {
      setFormError('Elige una categoria para el presupuesto.');
      return;
    }
    const amount = parseAmount(budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Ingresa un monto de presupuesto mayor a cero.');
      return;
    }
    await runSave('budget', async () => {
      await api.createBudget(token, {
        category_id: budgetCategoryId,
        expected_amount: amount,
        month: Number(budgetMonth),
        year: Number(budgetYear),
        is_recurring: true,
      });
      setBudgetAmount('');
    });
  }

  async function saveIncome() {
    if (!token || !incomeName.trim()) {
      setFormError('Escribe un nombre para el ingreso.');
      return;
    }
    const amount = parseAmount(incomeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Ingresa un monto de ingreso mayor a cero.');
      return;
    }
    await runSave('income', async () => {
      await api.createRecurringIncome(token, {
        name: incomeName,
        amount,
        income_type: incomeType,
        day_of_month: Number(incomeDay) || null,
        account_id: incomeAccountId,
      });
      setIncomeName('');
      setIncomeAmount('');
    });
  }

  async function saveFixedExpense() {
    if (!token || !fixedName.trim()) {
      setFormError('Escribe un nombre para el gasto fijo.');
      return;
    }
    const amount = parseAmount(fixedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Ingresa un monto de gasto mayor a cero.');
      return;
    }
    const totalInstallments = amountMode === 'total' ? Number(installments) || null : null;
    await runSave('fixed', async () => {
      await api.createFixedExpense(token, {
        name: fixedName,
        expected_amount: amount,
        expense_type: fixedType,
        payment_day: Number(fixedDay) || null,
        account_id: fixedAccountId,
        category_id: fixedCategoryId,
        amount_mode: amountMode,
        total_installments: totalInstallments,
        remaining_installments: totalInstallments,
        currency: 'CLP',
      });
      setFixedName('');
      setFixedAmount('');
      setInstallments('');
    });
  }

  async function saveGoal() {
    if (!token || !goalName.trim()) {
      setFormError('Escribe un nombre para la meta.');
      return;
    }
    const target = parseAmount(goalTarget);
    const current = parseAmount(goalCurrent || '0') || 0;
    if (!Number.isFinite(target) || target <= 0) {
      setFormError('Ingresa un monto objetivo mayor a cero.');
      return;
    }
    await runSave('goal', async () => {
      await api.createSavingsGoal(token, {
        name: goalName,
        target_amount: target,
        current_amount: current,
        target_date: goalDate || null,
        priority: 1,
      });
      setGoalName('');
      setGoalTarget('');
      setGoalCurrent('');
      setGoalDate('');
    });
  }

  if (isLoading && !data) {
    return (
      <Screen title="Planes" subtitle="Presupuestos, ingresos, fijos y metas.">
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  const categories = data?.categories ?? [];
  const accounts = data?.accounts ?? [];
  const monthlyIncome = (data?.recurringIncomes ?? []).reduce((sum, income) => sum + income.amount, 0);
  const fixedCommitment = (data?.fixedExpenses ?? []).reduce((sum, fixed) => sum + fixed.expected_amount, 0);
  const budgetLimit = (data?.budgets ?? []).reduce((sum, budget) => sum + budget.expected_amount, 0);
  const goalsRemaining = (data?.savingsGoals ?? []).reduce(
    (sum, goal) => sum + Math.max(goal.target_amount - goal.current_amount, 0),
    0,
  );

  return (
    <Screen
      title="Planes"
      subtitle="Arma tu mes: ingresos, limites, pagos y objetivos."
      refreshing={isRefreshing}
      onRefresh={refresh}
    >
      {error ? <LoadingBlock error={error} /> : null}
      {formError ? <Text style={styles.formError}>{formError}</Text> : null}

      <SectionCard title="Tu plan financiero">
        <View style={styles.summaryGrid}>
          <MetricPill label="Ingresos fijos" value={formatCurrency(monthlyIncome)} tone="good" />
          <MetricPill label="Pagos fijos" value={formatCurrency(fixedCommitment)} tone="bad" />
          <MetricPill label="Presupuestos" value={formatCurrency(budgetLimit)} tone="default" />
          <MetricPill label="Metas por cubrir" value={formatCurrency(goalsRemaining)} tone="warn" />
        </View>
        <Text style={styles.helperText}>
          Construye tu mes en este orden: primero ingresos, luego pagos obligatorios, despues presupuestos y finalmente metas.
        </Text>
      </SectionCard>

      <SectionCard title="Agregar al plan">
        <View style={styles.actionGrid}>
          <PlanAction
            title="Presupuesto"
            detail="Limite por categoria"
            active={activeForm === 'budget'}
            onPress={() => setActiveForm(activeForm === 'budget' ? null : 'budget')}
          />
          <PlanAction
            title="Ingreso fijo"
            detail="Sueldo u honorarios"
            active={activeForm === 'income'}
            onPress={() => setActiveForm(activeForm === 'income' ? null : 'income')}
          />
          <PlanAction
            title="Gasto o cuota"
            detail="Pago mensual o credito"
            active={activeForm === 'fixed'}
            onPress={() => setActiveForm(activeForm === 'fixed' ? null : 'fixed')}
          />
          <PlanAction
            title="Meta"
            detail="Ahorro con objetivo"
            active={activeForm === 'goal'}
            onPress={() => setActiveForm(activeForm === 'goal' ? null : 'goal')}
          />
        </View>
      </SectionCard>

      <HelpTip
        title="Orden recomendado"
        body="Carga ingresos, luego pagos obligatorios, después presupuestos y al final metas. Así el disponible queda más realista."
      />

      {activeForm === 'budget' ? <SectionCard title="Nuevo presupuesto">
        <View style={styles.inputRow}>
          <TextInput value={budgetMonth} onChangeText={setBudgetMonth} placeholder="Mes" keyboardType="numeric" style={[styles.input, styles.smallInput]} />
          <TextInput value={budgetYear} onChangeText={setBudgetYear} placeholder="Ano" keyboardType="numeric" style={[styles.input, styles.yearInput]} />
          <TextInput value={budgetAmount} onChangeText={setBudgetAmount} placeholder="Monto" keyboardType="numeric" style={[styles.input, styles.flexInput]} />
        </View>
        <Text style={styles.selectorLabel}>Categoria</Text>
        <ChipList
          items={categories.map((cat) => ({ id: cat.id, label: cat.name, color: cat.color || colors.border }))}
          selectedId={budgetCategoryId}
          onSelect={setBudgetCategoryId}
        />
        <PrimaryButton label={savingKey === 'budget' ? 'Guardando...' : 'Guardar presupuesto'} onPress={saveBudget} />
      </SectionCard> : null}

      {activeForm === 'income' ? <SectionCard title="Nuevo ingreso fijo">
        <TextInput value={incomeName} onChangeText={setIncomeName} placeholder="Ej: Sueldo" placeholderTextColor={colors.muted} style={styles.input} />
        <View style={styles.inputRow}>
          <TextInput value={incomeAmount} onChangeText={setIncomeAmount} placeholder="Monto" keyboardType="numeric" style={[styles.input, styles.flexInput]} />
          <TextInput value={incomeDay} onChangeText={setIncomeDay} placeholder="Dia" keyboardType="numeric" style={[styles.input, styles.smallInput]} />
        </View>
        <Segment items={incomeTypes} selected={incomeType} onSelect={setIncomeType} />
        <Text style={styles.selectorLabel}>Cuenta destino</Text>
        <ChipList items={accounts.map((acc) => ({ id: acc.id, label: acc.name }))} selectedId={incomeAccountId} onSelect={setIncomeAccountId} />
        <PrimaryButton label={savingKey === 'income' ? 'Guardando...' : 'Guardar ingreso'} onPress={saveIncome} />
      </SectionCard> : null}

      {activeForm === 'fixed' ? <SectionCard title="Nuevo gasto fijo o cuota">
        <TextInput value={fixedName} onChangeText={setFixedName} placeholder="Ej: CAE, arriendo, internet" placeholderTextColor={colors.muted} style={styles.input} />
        <View style={styles.inputRow}>
          <TextInput value={fixedAmount} onChangeText={setFixedAmount} placeholder={amountMode === 'total' ? 'Monto total' : 'Cuota mensual'} keyboardType="numeric" style={[styles.input, styles.flexInput]} />
          <TextInput value={fixedDay} onChangeText={setFixedDay} placeholder="Dia" keyboardType="numeric" style={[styles.input, styles.smallInput]} />
        </View>
        <Segment
          items={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'total', label: 'Credito/cuotas' },
          ]}
          selected={amountMode}
          onSelect={(value) => setAmountMode(value as 'monthly' | 'total')}
        />
        {amountMode === 'total' ? (
          <TextInput value={installments} onChangeText={setInstallments} placeholder="Cantidad de cuotas" keyboardType="numeric" style={styles.input} />
        ) : null}
        <Segment items={expenseTypes} selected={fixedType} onSelect={setFixedType} />
        <Text style={styles.selectorLabel}>Categoria</Text>
        <ChipList items={categories.map((cat) => ({ id: cat.id, label: cat.name, color: cat.color || colors.border }))} selectedId={fixedCategoryId} onSelect={setFixedCategoryId} />
        <Text style={styles.selectorLabel}>Cuenta de pago</Text>
        <ChipList items={accounts.map((acc) => ({ id: acc.id, label: acc.name }))} selectedId={fixedAccountId} onSelect={setFixedAccountId} />
        <PrimaryButton label={savingKey === 'fixed' ? 'Guardando...' : 'Guardar gasto fijo'} onPress={saveFixedExpense} />
      </SectionCard> : null}

      {activeForm === 'goal' ? <SectionCard title="Nueva meta de ahorro">
        <TextInput value={goalName} onChangeText={setGoalName} placeholder="Ej: Fondo emergencia" placeholderTextColor={colors.muted} style={styles.input} />
        <View style={styles.inputRow}>
          <TextInput value={goalTarget} onChangeText={setGoalTarget} placeholder="Objetivo" keyboardType="numeric" style={[styles.input, styles.flexInput]} />
          <TextInput value={goalCurrent} onChangeText={setGoalCurrent} placeholder="Actual" keyboardType="numeric" style={[styles.input, styles.flexInput]} />
        </View>
        <TextInput value={goalDate} onChangeText={setGoalDate} placeholder={`${todayIsoDate()} o vacio`} placeholderTextColor={colors.muted} style={styles.input} />
        <PrimaryButton label={savingKey === 'goal' ? 'Guardando...' : 'Guardar meta'} onPress={saveGoal} />
      </SectionCard> : null}

      <SectionCard title="Presupuestos del mes">
        {!data || data.budgets.length === 0 ? (
          <EmptyState title="Sin presupuestos" body="Crea limites por categoria para saber cuanto puedes gastar." />
        ) : (
          data.budgets.map((budget) => {
            const usagePercent = budget.expected_amount > 0 ? (budget.actual_amount / budget.expected_amount) * 100 : 0;
            const usage = Math.min(100, Math.max(0, usagePercent));
            const remaining = budget.expected_amount - budget.actual_amount;
            const isOver = remaining < 0;
            return (
              <View key={budget.id} style={styles.planBlock}>
                <View style={styles.titleRow}>
                  <View style={[styles.dot, { backgroundColor: budget.category_color || colors.primary }]} />
                  <View style={styles.titleText}>
                    <Text style={styles.name}>{budget.category_name}</Text>
                    <Text style={styles.meta}>{formatPercent(usagePercent)} usado</Text>
                  </View>
                  <Text style={[styles.remaining, isOver && styles.over]}>{formatCurrency(remaining)}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${usage}%`, backgroundColor: isOver ? colors.danger : usage >= 80 ? colors.warning : colors.success }]} />
                </View>
              </View>
            );
          })
        )}
      </SectionCard>

      <SectionCard title="Ingresos fijos">
        {(data?.recurringIncomes ?? []).length === 0 ? (
          <Text style={styles.mutedText}>Aun no tienes ingresos fijos.</Text>
        ) : (
          data?.recurringIncomes.map((income) => (
            <SimpleRow key={income.id} title={income.name} meta={income.account_name || income.income_type} value={formatCurrency(income.amount)} tone="good" />
          ))
        )}
      </SectionCard>

      <SectionCard title="Gastos fijos y cuotas">
        {(data?.fixedExpenses ?? []).length === 0 ? (
          <Text style={styles.mutedText}>Aun no tienes pagos fijos.</Text>
        ) : (
          data?.fixedExpenses.map((fixed) => (
            <SimpleRow
              key={fixed.id}
              title={fixed.name}
              meta={fixed.remaining_installments ? `${fixed.remaining_installments} cuotas restantes` : fixed.expense_type}
              value={formatCurrency(fixed.expected_amount)}
              tone="bad"
            />
          ))
        )}
      </SectionCard>

      <SectionCard title="Metas">
        {(data?.savingsGoals ?? []).length === 0 ? (
          <Text style={styles.mutedText}>Aun no tienes metas de ahorro.</Text>
        ) : (
          data?.savingsGoals.map((goal) => (
            <SimpleRow
              key={goal.id}
              title={goal.name}
              meta={`${formatPercent(goal.progress_percent)} logrado`}
              value={formatCurrency(goal.target_amount - goal.current_amount)}
              tone="default"
            />
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

function Segment({
  items,
  selected,
  onSelect,
}: {
  items: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.segmentWrap}>
      {items.map((item) => (
        <Pressable key={item.value} onPress={() => onSelect(item.value)} style={[styles.segmentButton, selected === item.value && styles.segmentActive]}>
          <Text style={[styles.segmentText, selected === item.value && styles.segmentTextActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PlanAction({
  title,
  detail,
  active,
  onPress,
}: {
  title: string;
  detail: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable onPress={onPress} style={[styles.actionCard, active && styles.actionCardActive]}>
      <View style={[styles.actionMark, active && styles.actionMarkActive]} />
      <View style={styles.actionTextBlock}>
        <Text style={[styles.actionTitle, active && styles.actionTitleActive]}>{title}</Text>
        <Text style={[styles.actionDetail, active && styles.actionDetailActive]}>{detail}</Text>
      </View>
      <Text style={[styles.actionPlus, active && styles.actionTitleActive]}>{active ? '-' : '+'}</Text>
    </Pressable>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'good' | 'bad' | 'warn';
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.metricPill,
        tone === 'good' ? styles.metricGood : tone === 'bad' ? styles.metricBad : tone === 'warn' ? styles.metricWarn : null,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ChipList({
  items,
  selectedId,
  onSelect,
}: {
  items: Array<{ id: number; label: string; color?: string }>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (items.length === 0) {
    return <Text style={styles.mutedText}>No hay opciones disponibles.</Text>;
  }
  return (
    <View style={styles.chips}>
      {items.slice(0, 16).map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onSelect(selectedId === item.id ? null : item.id)}
          style={[styles.chip, item.color ? { borderColor: item.color } : null, selectedId === item.id && styles.activeChip]}
        >
          <Text style={[styles.chipText, selectedId === item.id && styles.activeChipText]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable onPress={onPress} style={styles.saveButton}>
      <Text style={styles.saveText}>{label}</Text>
    </Pressable>
  );
}

function SimpleRow({
  title,
  meta,
  value,
  tone,
}: {
  title: string;
  meta: string;
  value: string;
  tone: 'good' | 'bad' | 'default';
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.simpleRow}>
      <View style={styles.titleText}>
        <Text style={styles.name}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Text style={[styles.simpleValue, tone === 'good' ? styles.good : tone === 'bad' ? styles.over : null]}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  formError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#f1b8ae',
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricPill: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 70,
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metricGood: {
    borderColor: colors.success,
    backgroundColor: colors.primarySoft,
  },
  metricBad: {
    borderColor: colors.danger,
  },
  metricWarn: {
    borderColor: colors.warning,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  actionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  actionMark: {
    width: 8,
    alignSelf: 'stretch',
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  actionMarkActive: {
    backgroundColor: colors.onPrimary,
  },
  actionTextBlock: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  actionTitleActive: {
    color: colors.onPrimary,
  },
  actionDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  actionDetailActive: {
    color: colors.onPrimary,
    opacity: 0.82,
  },
  actionPlus: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexInput: {
    flex: 1,
  },
  smallInput: {
    width: 74,
  },
  yearInput: {
    width: 92,
  },
  selectorLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  activeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  activeChipText: {
    color: colors.onPrimary,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: colors.onPrimary,
  },
  saveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  saveText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  remaining: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  over: {
    color: colors.danger,
  },
  good: {
    color: colors.success,
  },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSoft,
  },
  progressFill: {
    height: 10,
    borderRadius: radii.sm,
  },
  planBlock: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mutedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  simpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  simpleValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import { useAuthedResource } from '../api/useAuthedResource';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { FinanceTable } from '../components/FinanceTable';
import { HelpTip } from '../components/HelpTip';
import { LoadingBlock } from '../components/LoadingBlock';
import { Screen } from '../components/Screen';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { radii, spacing, useTheme } from '../theme/theme';
import type { Account, Category, Transaction } from '../types';
import { formatCurrency, todayIsoDate } from '../utils/formatters';

type TransactionsData = {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
};

export function TransactionsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loader = useCallback(async (authToken: string): Promise<TransactionsData> => {
    const [transactions, categories, accounts] = await Promise.all([
      api.transactions(authToken),
      api.categories(authToken),
      api.accounts(authToken),
    ]);
    return { transactions, categories, accounts };
  }, []);

  const { data, error, isLoading, isRefreshing, refresh } = useAuthedResource<TransactionsData>(loader);
  const filteredCategories = useMemo(() => data?.categories ?? [], [data?.categories]);

  async function saveTransaction() {
    if (!token) {
      return;
    }

    const parsedAmount = Number(amount.replace(/\./g, '').replace(',', '.'));
    if (!description.trim()) {
      setFormError('Escribe una descripcion corta.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Ingresa un monto mayor a cero.');
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      await api.createTransaction(token, {
        description,
        amount: parsedAmount,
        date,
        transaction_type: type,
        account_id: accountId,
        category_id: categoryId,
      });
      setDescription('');
      setAmount('');
      setDate(todayIsoDate());
      setIsFormOpen(false);
      await refresh();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el movimiento.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !data) {
    return (
      <Screen title="Gastos" subtitle="Registra ingresos y salidas sin perder el hilo.">
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Movimientos"
      subtitle="Registra solo lo necesario y mira el flujo sin ruido."
      refreshing={isRefreshing}
      onRefresh={refresh}
    >
      {error ? <LoadingBlock error={error} /> : null}

      <View style={styles.grid}>
        <StatCard
          label="Ingresos"
          value={formatCurrency((data?.transactions ?? []).filter((tx) => tx.transaction_type === 'income').reduce((sum, tx) => sum + tx.amount, 0))}
          tone="good"
        />
        <StatCard
          label="Gastos"
          value={formatCurrency((data?.transactions ?? []).filter((tx) => tx.transaction_type === 'expense').reduce((sum, tx) => sum + tx.amount, 0))}
          tone="danger"
        />
      </View>

      <SectionCard title="Registrar">
        <View style={styles.actionGrid}>
          <Pressable
            onPress={() => {
              setType('expense');
              setIsFormOpen((current) => (type === 'expense' ? !current : true));
            }}
            style={[styles.actionCard, isFormOpen && type === 'expense' && styles.actionCardActive]}
          >
            <Text style={[styles.actionTitle, isFormOpen && type === 'expense' && styles.actionTitleActive]}>Gasto</Text>
            <Text style={[styles.actionMeta, isFormOpen && type === 'expense' && styles.actionMetaActive]}>Compra, pago o salida</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setType('income');
              setIsFormOpen((current) => (type === 'income' ? !current : true));
            }}
            style={[styles.actionCard, isFormOpen && type === 'income' && styles.actionCardActive]}
          >
            <Text style={[styles.actionTitle, isFormOpen && type === 'income' && styles.actionTitleActive]}>Ingreso</Text>
            <Text style={[styles.actionMeta, isFormOpen && type === 'income' && styles.actionMetaActive]}>Sueldo, venta o abono</Text>
          </Pressable>
        </View>
      </SectionCard>

      <HelpTip
        title="No necesitas registrar todo perfecto"
        body="Empieza por gastos grandes y recurrentes. Con eso la proyección ya se vuelve útil para decidir."
      />

      {isFormOpen ? <SectionCard title={type === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso'}>
        <View style={styles.segment}>
          <Pressable onPress={() => setType('expense')} style={[styles.segmentButton, type === 'expense' && styles.activeSegment]}>
            <Text style={[styles.segmentText, type === 'expense' && styles.activeSegmentText]}>Gasto</Text>
          </Pressable>
          <Pressable onPress={() => setType('income')} style={[styles.segmentButton, type === 'income' && styles.activeSegment]}>
            <Text style={[styles.segmentText, type === 'income' && styles.activeSegmentText]}>Ingreso</Text>
          </Pressable>
        </View>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Descripcion"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <View style={styles.inputRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="Monto"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.input, styles.flexInput]}
          />
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.dateInput]}
          />
        </View>

        <Text style={styles.selectorLabel}>Cuenta</Text>
        <View style={styles.chips}>
          {(data?.accounts ?? []).map((account) => (
            <Pressable
              key={account.id}
              onPress={() => setAccountId(accountId === account.id ? null : account.id)}
              style={[styles.chip, accountId === account.id && styles.activeChip]}
            >
              <Text style={[styles.chipText, accountId === account.id && styles.activeChipText]}>{account.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.selectorLabel}>Categoria</Text>
        <View style={styles.chips}>
          {filteredCategories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
              style={[
                styles.chip,
                { borderColor: category.color || colors.border },
                categoryId === category.id && styles.activeChip,
              ]}
            >
              <Text style={[styles.chipText, categoryId === category.id && styles.activeChipText]}>{category.name}</Text>
            </Pressable>
          ))}
        </View>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        <Pressable disabled={isSaving} onPress={saveTransaction} style={styles.saveButton}>
          <Text style={styles.saveText}>{isSaving ? 'Guardando...' : 'Guardar movimiento'}</Text>
        </Pressable>
      </SectionCard> : null}

      <SectionCard title="Ultimos movimientos">
        {!data || data.transactions.length === 0 ? (
          <EmptyState title="Aun no hay movimientos" body="Empieza por registrar los gastos frecuentes del mes." />
        ) : (
          <FinanceTable
            rows={data.transactions.map((transaction) => ({
              label: transaction.description,
              detail: `${transaction.date} · ${transaction.category_name || transaction.account_name || 'Sin categoria'}`,
              value: `${transaction.transaction_type === 'expense' ? '-' : '+'}${formatCurrency(transaction.amount)}`,
              tone: transaction.transaction_type === 'expense' ? 'bad' : 'good',
            }))}
          />
        )}
      </SectionCard>
    </Screen>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  actionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  actionTitleActive: {
    color: colors.onPrimary,
  },
  actionMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  actionMetaActive: {
    color: colors.onPrimary,
    opacity: 0.82,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  activeSegment: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '800',
  },
  activeSegmentText: {
    color: colors.text,
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
  dateInput: {
    width: 130,
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
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
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

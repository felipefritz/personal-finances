import { useCallback, useState } from 'react';
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
import { spacing, useTheme } from '../theme/theme';
import type { Account } from '../types';
import { formatCurrency } from '../utils/formatters';

const accountTypes = [
  { value: 'corriente', label: 'Corriente' },
  { value: 'vista', label: 'Vista' },
  { value: 'ahorro', label: 'Ahorro' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'inversion', label: 'Inversion' },
  { value: 'tarjeta_credito', label: 'Credito' },
];

const defaultBanks = [
  'Banco de Chile',
  'Banco Estado',
  'Santander',
  'BCI',
  'Scotiabank',
  'Itaú',
  'Banco Falabella',
  'Banco Ripley',
  'Consorcio',
  'Security',
  'BICE',
  'Tenpo',
  'Mach',
  'Mercado Pago',
];

export function AccountsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const loader = useCallback((token: string) => api.accounts(token), []);
  const { data, error, isLoading, isRefreshing, refresh } = useAuthedResource<Account[]>(loader);
  const [name, setName] = useState('');
  const [selectedBank, setSelectedBank] = useState(defaultBanks[0]);
  const [customBank, setCustomBank] = useState('');
  const [balance, setBalance] = useState('');
  const [accountType, setAccountType] = useState('corriente');
  const [cardLastFour, setCardLastFour] = useState('');
  const [cardNetwork, setCardNetwork] = useState('visa');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);

  const total = (data ?? []).reduce(
    (acc, account) => ({
      current: acc.current + account.balance,
      available: acc.available + (account.free_balance ?? account.available_credit ?? account.balance),
      reserved: acc.reserved + Math.max(account.balance - (account.free_balance ?? account.balance), 0),
    }),
    { current: 0, available: 0, reserved: 0 },
  );
  const bankOptions = Array.from(
    new Set([...defaultBanks, ...(data ?? []).map((account) => account.bank).filter(Boolean) as string[]]),
  );
  const resolvedBank = selectedBank === 'Otro banco' ? customBank.trim() : selectedBank;
  const isCreditCard = accountType === 'tarjeta_credito';
  const groupedByBank = (data ?? []).reduce<Record<string, Account[]>>((groups, account) => {
    const bankName = account.bank || 'Sin banco';
    groups[bankName] = groups[bankName] ? [...groups[bankName], account] : [account];
    return groups;
  }, {});

  if (isLoading && !data) {
    return (
      <Screen title="Cuentas" subtitle="Saldos reales y plata reservada.">
        <LoadingBlock error={error} />
      </Screen>
    );
  }

  async function saveAccount() {
    if (!token) {
      return;
    }
    const parsedBalance = Number(balance.replace(/\./g, '').replace(',', '.')) || 0;
    if (!name.trim()) {
      setFormError('Escribe un nombre para la cuenta.');
      return;
    }
    if (!resolvedBank) {
      setFormError('Elige o agrega un banco.');
      return;
    }
    if (isCreditCard && cardLastFour.trim() && !/^\d{4}$/.test(cardLastFour.trim())) {
      setFormError('Los ultimos 4 digitos deben ser exactamente 4 numeros.');
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      await api.createAccount(token, {
        name,
        bank: resolvedBank,
        account_type: accountType,
        balance: parsedBalance,
        currency: 'CLP',
        card_last_four: isCreditCard ? cardLastFour.trim() || null : null,
        card_network: isCreditCard ? cardNetwork : null,
      });
      setName('');
      setSelectedBank(defaultBanks[0]);
      setCustomBank('');
      setIsBankDropdownOpen(false);
      setBalance('');
      setCardLastFour('');
      setCardNetwork('visa');
      setAccountType('corriente');
      setIsFormOpen(false);
      await refresh();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'No se pudo crear la cuenta.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen title="Cuentas" subtitle="Saldo dentro de cuentas, sin mezclar con credito." refreshing={isRefreshing} onRefresh={refresh}>
      {error ? <LoadingBlock error={error} /> : null}

      <View style={styles.grid}>
        <StatCard label="Saldo total" value={formatCurrency(total.current)} helper="Lo que existe en tus cuentas" />
        <StatCard label="Disponible" value={formatCurrency(total.available)} helper="Libre despues de reservas" tone="good" />
        <StatCard label="Reservado" value={formatCurrency(total.reserved)} helper="Separado para planes" tone="warn" />
      </View>

      <HelpTip
        title="Parte con lo que usas todos los meses"
        body="Agrega primero tu cuenta principal y tarjetas. Después puedes sumar ahorro, efectivo o inversiones."
      />

      <SectionCard title="Acciones">
        <Pressable onPress={() => setIsFormOpen((current) => !current)} style={[styles.mainAction, isFormOpen && styles.mainActionActive]}>
          <View style={styles.mainActionText}>
            <Text style={[styles.mainActionTitle, isFormOpen && styles.mainActionTitleActive]}>
              {isFormOpen ? 'Cerrar formulario' : 'Agregar cuenta'}
            </Text>
            <Text style={[styles.mainActionMeta, isFormOpen && styles.mainActionMetaActive]}>
              Corriente, vista, ahorro, efectivo, inversion o credito
            </Text>
          </View>
          <Text style={[styles.mainActionIcon, isFormOpen && styles.mainActionTitleActive]}>{isFormOpen ? '-' : '+'}</Text>
        </Pressable>
      </SectionCard>

      {isFormOpen ? <SectionCard title="Nueva cuenta">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nombre de la cuenta"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text style={styles.selectorLabel}>Banco</Text>
        <Pressable onPress={() => setIsBankDropdownOpen((current) => !current)} style={styles.dropdownButton}>
          <Text style={styles.dropdownValue}>{selectedBank}</Text>
          <Text style={styles.dropdownChevron}>{isBankDropdownOpen ? '^' : 'v'}</Text>
        </Pressable>
        {isBankDropdownOpen ? (
          <View style={styles.dropdownPanel}>
            {[...bankOptions, 'Otro banco'].map((bankName) => (
              <Pressable
                key={bankName}
                onPress={() => {
                  setSelectedBank(bankName);
                  setIsBankDropdownOpen(false);
                }}
                style={[styles.dropdownItem, selectedBank === bankName && styles.dropdownItemActive]}
              >
                <Text style={[styles.dropdownItemText, selectedBank === bankName && styles.dropdownItemTextActive]}>
                  {bankName}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {selectedBank === 'Otro banco' ? (
          <TextInput
            value={customBank}
            onChangeText={setCustomBank}
            placeholder="Nombre del banco o institución"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={balance}
            onChangeText={setBalance}
            placeholder={isCreditCard ? 'Cupo total' : 'Saldo'}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.input, styles.flexInput]}
          />
        </View>
        <Text style={styles.selectorLabel}>Tipo de cuenta</Text>
        <View style={styles.chips}>
          {accountTypes.map((type) => (
            <Pressable
              key={type.value}
              onPress={() => {
                setAccountType(type.value);
                if (type.value === 'tarjeta_credito' && !name.trim()) {
                  setName('Tarjeta de credito');
                }
              }}
              style={[styles.chip, accountType === type.value && styles.activeChip]}
            >
              <Text style={[styles.chipText, accountType === type.value && styles.activeChipText]}>{type.label}</Text>
            </Pressable>
          ))}
        </View>
        {isCreditCard ? (
          <>
            <HelpTip
              title="Tarjeta de credito"
              body="Al elegir credito, esta cuenta se tratará como una tarjeta asociada al banco seleccionado. El monto corresponde al cupo total."
            />
            <View style={styles.inputRow}>
              <TextInput
                value={cardLastFour}
                onChangeText={setCardLastFour}
                placeholder="Ultimos 4"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                maxLength={4}
                style={[styles.input, styles.amountInput]}
              />
              <TextInput
                value={cardNetwork}
                onChangeText={setCardNetwork}
                placeholder="Visa, Mastercard..."
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.flexInput]}
              />
            </View>
          </>
        ) : null}
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        <Pressable disabled={isSaving} onPress={saveAccount} style={styles.saveButton}>
          <Text style={styles.saveText}>{isSaving ? 'Guardando...' : 'Crear cuenta'}</Text>
        </Pressable>
      </SectionCard> : null}

      {!data || data.length === 0 ? (
        <EmptyState title="Sin cuentas" body="Agrega tus cuentas desde la web para ver saldos disponibles en mobile." />
      ) : (
        Object.entries(groupedByBank).map(([bankName, accounts]) => (
          <SectionCard key={bankName} title={bankName}>
            {accounts.map((account) =>
              account.account_type === 'tarjeta_credito' ? (
                <CreditCardVisual key={account.id} account={account} />
              ) : (
                <View key={account.id} style={styles.accountBlock}>
                  <View style={styles.accountHeader}>
                    <View style={styles.accountText}>
                      <Text style={styles.accountName}>{account.name}</Text>
                      <Text style={styles.accountType}>{account.account_type}</Text>
                    </View>
                    <Text style={styles.balance}>{formatCurrency(account.free_balance ?? account.balance)}</Text>
                  </View>
                  <FinanceTable
                    rows={[
                      { label: 'Saldo en cuenta', value: formatCurrency(account.balance) },
                      {
                        label: 'Disponible libre',
                        value: formatCurrency(account.free_balance ?? account.balance),
                        tone: 'good',
                      },
                      {
                        label: 'Reservado',
                        value: formatCurrency(Math.max(account.balance - (account.free_balance ?? account.balance), 0)),
                        tone: 'warn',
                      },
                    ]}
                  />
                </View>
              ),
            )}
          </SectionCard>
        ))
      )}
    </Screen>
  );
}

function CreditCardVisual({ account }: { account: Account }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const lastFour = account.card_last_four || '0000';
  const network = account.card_network || 'credito';
  return (
    <View style={styles.cardVisual}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardBank}>{account.bank || 'Banco'}</Text>
        <Text style={styles.cardNetwork}>{network}</Text>
      </View>
      <View style={styles.cardChip} />
      <Text style={styles.cardNumber}>****  ****  ****  {lastFour}</Text>
      <View style={styles.cardBottomRow}>
        <View>
          <Text style={styles.cardLabel}>Tarjeta</Text>
          <Text style={styles.cardName}>{account.name}</Text>
        </View>
        <View style={styles.cardAmountBlock}>
          <Text style={styles.cardLabel}>Disponible</Text>
          <Text style={styles.cardAmount}>{formatCurrency(account.available_credit ?? account.credit_limit ?? account.balance)}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mainAction: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  mainActionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  mainActionText: {
    flex: 1,
    gap: 3,
  },
  mainActionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  mainActionTitleActive: {
    color: colors.onPrimary,
  },
  mainActionMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  mainActionMetaActive: {
    color: colors.onPrimary,
    opacity: 0.82,
  },
  mainActionIcon: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: '900',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  accountBlock: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  accountType: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  balance: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '800',
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
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  dropdownButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  dropdownValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  dropdownChevron: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  dropdownPanel: {
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dropdownItem: {
    minHeight: 42,
    justifyContent: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  dropdownItemActive: {
    backgroundColor: colors.primary,
  },
  dropdownItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownItemTextActive: {
    color: colors.onPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexInput: {
    flex: 1,
  },
  amountInput: {
    width: 120,
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
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  saveText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  cardVisual: {
    minHeight: 190,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: colors.primary,
    padding: spacing.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardBank: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  cardNetwork: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    opacity: 0.82,
    textTransform: 'uppercase',
  },
  cardChip: {
    width: 44,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accent,
    opacity: 0.95,
  },
  cardNumber: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  cardLabel: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '900',
    opacity: 0.72,
    textTransform: 'uppercase',
  },
  cardName: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3,
  },
  cardAmountBlock: {
    alignItems: 'flex-end',
  },
  cardAmount: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
});

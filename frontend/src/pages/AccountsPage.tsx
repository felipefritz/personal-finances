import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Grid,
  Stack,
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
  Tooltip,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import SavingsIcon from '@mui/icons-material/Savings';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../api/accounts';
import { getBudgets } from '../api/budgets';
import { getSavingsGoals } from '../api/savingsGoals';
import { createAllocation, deleteAllocation, getAllocations } from '../api/allocations';
import type { Account, Budget, MoneyAllocation, MoneyAllocationInput, SavingsGoal } from '../types';
import { formatCurrency, ACCOUNT_TYPES, MONTH_NAMES } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';

const BANKS = ['BancoEstado', 'Banco Santander', 'BCI', 'Banco de Chile', 'Scotiabank', 'Itaú', 'BICE', 'Otro'];

const CARD_NETWORKS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'debito_mastercard', label: 'Débito Mastercard' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_FORM: Partial<Account> = {
  name: '',
  bank: '',
  account_type: 'corriente',
  balance: 0,
  currency: 'CLP',
  is_active: true,
  source: 'manual',
};

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

const EMPTY_ALLOCATION_FORM: MoneyAllocationInput = {
  account_id: 0,
  amount: 0,
  target_type: 'budget',
  budget_id: undefined,
  savings_goal_id: undefined,
  notes: '',
};

const ACCOUNT_TEMPLATES: Array<{ id: string; label: string; description: string; payload: Partial<Account> }> = [
  {
    id: 'corriente_principal',
    label: 'Cuenta Corriente Principal',
    description: 'Para sueldo y gastos diarios',
    payload: {
      name: 'Cuenta Corriente Principal',
      bank: 'Banco Santander',
      account_type: 'corriente',
      balance: 0,
      currency: 'CLP',
      is_active: true,
      source: 'manual',
    },
  },
  {
    id: 'cuenta_ahorro',
    label: 'Cuenta de Ahorro',
    description: 'Para fondo de emergencia y metas',
    payload: {
      name: 'Cuenta de Ahorro',
      bank: 'BancoEstado',
      account_type: 'ahorro',
      balance: 0,
      currency: 'CLP',
      is_active: true,
      source: 'manual',
    },
  },
  {
    id: 'tarjeta_credito',
    label: 'Tarjeta de Crédito Principal',
    description: 'Seguimiento de gastos en tarjeta',
    payload: {
      name: 'Tarjeta de Crédito Principal',
      bank: 'Banco de Chile',
      account_type: 'tarjeta_credito',
      balance: 0,
      currency: 'CLP',
      is_active: true,
      source: 'manual',
    },
  },
  {
    id: 'inversiones',
    label: 'Cuenta de Inversiones',
    description: 'Acciones, fondos mutuos o APV',
    payload: {
      name: 'Cuenta de Inversiones',
      bank: 'BCI',
      account_type: 'inversion',
      balance: 0,
      currency: 'CLP',
      is_active: true,
      source: 'manual',
    },
  },
];

function AccountForm({
  value,
  onChange,
}: {
  value: Partial<Account>;
  onChange: (v: Partial<Account>) => void;
}) {
  const set = (field: keyof Account, val: unknown) =>
    onChange({ ...value, [field]: val });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
      <TextField
        label="Nombre"
        value={value.name ?? ''}
        onChange={(e) => set('name', e.target.value)}
        required
        fullWidth
      />
      <TextField
        select label="Banco" value={value.bank ?? ''} onChange={(e) => set('bank', e.target.value)} fullWidth
      >
        {BANKS.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
      </TextField>
      <TextField
        select label="Tipo" value={value.account_type ?? 'corriente'} onChange={(e) => set('account_type', e.target.value)} fullWidth
      >
        {ACCOUNT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>
      <TextField
        label={value.account_type === 'tarjeta_credito' ? 'Cupo total de la tarjeta' : 'Saldo inicial'}
        type="number"
        value={value.balance ?? 0}
        onChange={(e) => set('balance', parseFloat(e.target.value) || 0)}
        helperText={value.account_type === 'tarjeta_credito'
          ? 'Este monto es el límite de crédito, no dinero disponible ni patrimonio.'
          : 'Saldo real disponible en la cuenta.'}
        fullWidth
      />
      <TextField
        select label="Moneda" value={value.currency ?? 'CLP'} onChange={(e) => set('currency', e.target.value)} fullWidth
      >
        {['CLP', 'USD', 'EUR', 'UF'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      {value.account_type === 'tarjeta_credito' && (
        <>
          <TextField
            select
            label="Red de tarjeta"
            value={value.card_network ?? ''}
            onChange={(e) => set('card_network', e.target.value)}
            fullWidth
          >
            <MenuItem value="">— Sin especificar —</MenuItem>
            {CARD_NETWORKS.map((n) => <MenuItem key={n.value} value={n.value}>{n.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Últimos 4 dígitos"
            value={value.card_last_four ?? ''}
            onChange={(e) => set('card_last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputProps={{ maxLength: 4, pattern: '[0-9]*' }}
            placeholder="ej. 8023"
            fullWidth
          />
        </>
      )}
    </Box>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
}) {
  const color = {
    default: 'text.primary',
    good: 'success.main',
    bad: 'error.main',
    warn: 'warning.main',
  }[tone];

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={800} color={color}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {helper}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteAllocationId, setDeleteAllocationId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Partial<Account>>(EMPTY_FORM);
  const [allocationForm, setAllocationForm] = useState<MoneyAllocationInput>(EMPTY_ALLOCATION_FORM);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(ACCOUNT_TEMPLATES.map((t) => t.id));
  const [templatesSummary, setTemplatesSummary] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', CURRENT_MONTH, CURRENT_YEAR],
    queryFn: () => getBudgets(CURRENT_MONTH, CURRENT_YEAR),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['savings-goals'],
    queryFn: getSavingsGoals,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['allocations'],
    queryFn: getAllocations,
  });

  const createMut = useMutation({
    mutationFn: createAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setDialogOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) => updateAccount(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setDialogOpen(false); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setDeleteId(null); },
  });

  const allocationMut = useMutation({
    mutationFn: createAllocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['allocations'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['savings-goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['dashboard-pulse'] });
      setAllocationOpen(false);
      setAllocationForm(EMPTY_ALLOCATION_FORM);
    },
  });

  const deleteAllocationMut = useMutation({
    mutationFn: deleteAllocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['allocations'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['savings-goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['dashboard-pulse'] });
      setDeleteAllocationId(null);
    },
  });

  const templatesMut = useMutation({
    mutationFn: async (templateIds: string[]) => {
      const existingNames = new Set(accounts.map((a) => a.name.trim().toLocaleLowerCase('es-CL')));
      let created = 0;
      let skipped = 0;

      for (const template of ACCOUNT_TEMPLATES.filter((item) => templateIds.includes(item.id))) {
        const normalizedName = (template.payload.name ?? '').trim().toLocaleLowerCase('es-CL');
        if (!normalizedName || existingNames.has(normalizedName)) {
          skipped += 1;
          continue;
        }
        await createAccount(template.payload);
        existingNames.add(normalizedName);
        created += 1;
      }

      return { created, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setTemplatesSummary(`Creadas ${created} cuentas y omitidas ${skipped} por ya existir.`);
      setTemplatesOpen(false);
    },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (acc: Account) => { setEditing(acc); setForm(acc); setDialogOpen(true); };
  const openAllocation = () => {
    const firstAccount = accounts.find((account) => account.account_type !== 'tarjeta_credito' && (account.free_balance ?? account.balance) > 0);
    const firstBudget = budgets[0];
    const firstGoal = goals.find((goal) => goal.status === 'active');
    setAllocationForm({
      ...EMPTY_ALLOCATION_FORM,
      account_id: firstAccount?.id ?? 0,
      target_type: firstBudget ? 'budget' : 'goal',
      budget_id: firstBudget?.id,
      savings_goal_id: firstBudget ? undefined : firstGoal?.id,
    });
    setAllocationOpen(true);
  };

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const handleAllocationSave = () => {
    const payload = { ...allocationForm };
    if (payload.target_type === 'budget') {
      payload.savings_goal_id = undefined;
    } else {
      payload.budget_id = undefined;
    }
    allocationMut.mutate(payload);
  };

  const cardDebt = (acc: Account) =>
    Math.abs(Math.min(acc.computed_balance ?? 0, 0));

  const cardAvailable = (acc: Account) => {
    if (acc.available_credit !== undefined) return acc.available_credit;
    const limit = acc.credit_limit ?? acc.balance ?? 0;
    return Math.max(limit - cardDebt(acc), 0);
  };

  // For total net balance, credit cards should contribute as debt (negative).
  const effectiveBalance = (acc: Account) =>
    acc.account_type === 'tarjeta_credito' && acc.computed_balance !== undefined
      ? acc.computed_balance
      : (acc.balance || 0);

  const isCreditCard = (account: Account) => account.account_type === 'tarjeta_credito';
  const cashBalance = accounts
    .filter((account) => !isCreditCard(account) && account.account_type !== 'inversion')
    .reduce((sum, account) => sum + (account.balance || 0), 0);
  const reservedBalance = accounts.reduce((sum, account) => sum + (account.reserved_amount ?? 0), 0);
  const freeCashBalance = accounts
    .filter((account) => !isCreditCard(account) && account.account_type !== 'inversion')
    .reduce((sum, account) => sum + (account.free_balance ?? (account.balance || 0)), 0);
  const investmentBalance = accounts
    .filter((account) => account.account_type === 'inversion')
    .reduce((sum, account) => sum + Math.max(account.balance || 0, 0), 0);
  const creditDebt = accounts.filter(isCreditCard).reduce((sum, account) => sum + cardDebt(account), 0);
  const creditAvailable = accounts.filter(isCreditCard).reduce((sum, account) => sum + cardAvailable(account), 0);
  const netWorth = accounts.reduce((s, a) => s + effectiveBalance(a), 0);
  const orderedAccounts = [...accounts].sort((left, right) => {
    if (isCreditCard(left) !== isCreditCard(right)) return isCreditCard(left) ? 1 : -1;
    return Math.abs(effectiveBalance(right)) - Math.abs(effectiveBalance(left));
  });
  const reservableAccounts = accounts.filter((account) => (
    account.account_type !== 'tarjeta_credito'
    && account.is_active
    && (account.free_balance ?? account.balance) > 0
  ));
  const selectedReserveAccount = accounts.find((account) => account.id === allocationForm.account_id);
  const selectedFreeBalance = selectedReserveAccount?.free_balance ?? selectedReserveAccount?.balance ?? 0;
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const canSaveAllocation = allocationForm.account_id > 0
    && allocationForm.amount > 0
    && allocationForm.amount <= selectedFreeBalance
    && ((allocationForm.target_type === 'budget' && !!allocationForm.budget_id)
      || (allocationForm.target_type === 'goal' && !!allocationForm.savings_goal_id));

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Cuentas y tarjetas"
        subtitle={`Patrimonio neto: ${formatCurrency(netWorth)}. El cupo de tarjetas no se suma como saldo.`}
        action={{ label: 'Nueva cuenta', onClick: openCreate }}
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Dinero libre"
            value={formatCurrency(freeCashBalance)}
            helper={`Saldo cuentas ${formatCurrency(cashBalance)}`}
            tone={freeCashBalance >= 0 ? 'good' : 'bad'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Dinero reservado"
            value={formatCurrency(reservedBalance)}
            helper="Apartado para presupuestos y metas"
            tone="warn"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Deuda en tarjetas"
            value={formatCurrency(creditDebt)}
            helper="Consumo usado y cuotas pendientes"
            tone={creditDebt > 0 ? 'bad' : 'good'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            label="Inversiones"
            value={formatCurrency(investmentBalance)}
            helper={`Cupo libre TC ${formatCurrency(creditAvailable)}`}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddIcon />}
          onClick={() => setTemplatesOpen(true)}
        >
          Agregar plantillas sugeridas
        </Button>
        <Button
          variant="contained"
          startIcon={<SavingsIcon />}
          onClick={openAllocation}
          disabled={reservableAccounts.length === 0 || (budgets.length === 0 && activeGoals.length === 0)}
        >
          Reservar dinero
        </Button>
        {templatesSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{templatesSummary}</Alert>}
        {templatesMut.isError && <Alert severity="error">No se pudieron crear las plantillas sugeridas.</Alert>}
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>Dinero reservado</Typography>
              <Typography variant="body2" color="text.secondary">
                Aparta plata para gastos o metas sin cambiar el saldo real del banco.
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight={800}>
              {formatCurrency(reservedBalance)}
            </Typography>
          </Stack>
          {allocations.length > 0 && (
            <Stack spacing={1} mt={1.5}>
              {allocations.slice(0, 5).map((allocation: MoneyAllocation) => (
                <Stack
                  key={allocation.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={1}
                  sx={{ py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {allocation.target_type === 'budget' ? 'Presupuesto' : 'Meta'}: {allocation.target_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Desde {allocation.account_name}{allocation.target_period ? ` · ${allocation.target_period}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                    <Typography variant="body2" fontWeight={800}>{formatCurrency(allocation.amount)}</Typography>
                    <Button size="small" color="inherit" onClick={() => setDeleteAllocationId(allocation.id)}>
                      Liberar
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState
          message="Sin cuentas registradas"
          description="Agrega tu primera cuenta bancaria para comenzar a registrar movimientos."
          Icon={AccountBalanceIcon}
        />
      ) : (
        <Grid container spacing={2}>
          {orderedAccounts.map((acc) => (
            <Grid item xs={12} sm={6} md={4} key={acc.id}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Chip
                      label={ACCOUNT_TYPES.find((t) => t.value === acc.account_type)?.label ?? acc.account_type}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    <Chip
                      label={acc.is_active ? 'Activa' : 'Inactiva'}
                      size="small"
                      color={acc.is_active ? 'success' : 'default'}
                    />
                  </Box>
                  <Typography variant="h6" fontWeight={700} noWrap>
                    {acc.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {acc.bank || '—'}
                    {acc.account_type === 'tarjeta_credito' && acc.card_network && (
                      <> · {CARD_NETWORKS.find((n) => n.value === acc.card_network)?.label ?? acc.card_network}</>
                    )}
                    {acc.account_type === 'tarjeta_credito' && acc.card_last_four && (
                      <> •••• {acc.card_last_four}</>
                    )}
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    color={acc.account_type === 'tarjeta_credito' ? (cardDebt(acc) > 0 ? 'error.main' : 'success.main') : 'primary.main'}
                  >
                    {acc.account_type === 'tarjeta_credito'
                      ? formatCurrency(cardDebt(acc))
                      : formatCurrency(effectiveBalance(acc))}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {acc.currency}
                    {acc.account_type === 'tarjeta_credito' ? ' · deuda usada' : ' · saldo disponible'}
                  </Typography>
                  {acc.account_type === 'tarjeta_credito' && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Cupo disponible: {formatCurrency(cardAvailable(acc))} · Límite: {formatCurrency(acc.credit_limit ?? acc.balance ?? 0)}
                    </Typography>
                  )}
                  {acc.account_type !== 'tarjeta_credito' && (acc.reserved_amount ?? 0) > 0 && (
                    <Typography variant="caption" display="block" color="warning.main">
                      Reservado: {formatCurrency(acc.reserved_amount)} · Libre: {formatCurrency(acc.free_balance ?? acc.balance)}
                    </Typography>
                  )}
                  {acc.account_type === 'tarjeta_credito' && (acc.future_installments_commitment ?? 0) > 0 && (
                    <Typography variant="caption" display="block" color="warning.main">
                      Incluye cuotas futuras reservadas: {formatCurrency(acc.future_installments_commitment ?? 0)}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                  <Tooltip title="Editar">
                    <IconButton size="small" onClick={() => openEdit(acc)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Eliminar">
                    <IconButton size="small" color="error" onClick={() => setDeleteId(acc.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
        <DialogContent>
          <AccountForm value={form} onChange={setForm} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending || !form.name}
          >
            {editing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Selecciona plantillas sugeridas</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', pt: 1 }}>
            {ACCOUNT_TEMPLATES.map((template) => {
              const checked = selectedTemplates.includes(template.id);
              return (
                <Box key={template.id} sx={{ py: 0.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedTemplates, template.id]
                            : selectedTemplates.filter((id) => id !== template.id);
                          setSelectedTemplates(next);
                        }}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{template.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{template.description}</Typography>
                      </Box>
                    }
                  />
                </Box>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={selectedTemplates.length === 0 || templatesMut.isPending}
            onClick={() => templatesMut.mutate(selectedTemplates)}
          >
            Crear seleccionadas
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={allocationOpen} onClose={() => setAllocationOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reservar dinero</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Esto no mueve plata del banco. Solo separa saldo dentro de la app para que sepas qué parte ya está comprometida.
            </Alert>
            <TextField
              select
              label="Cuenta origen"
              value={allocationForm.account_id || ''}
              onChange={(e) => setAllocationForm({ ...allocationForm, account_id: Number(e.target.value) })}
              fullWidth
            >
              {reservableAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name} · libre {formatCurrency(account.free_balance ?? account.balance)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Destino"
              value={allocationForm.target_type}
              onChange={(e) => setAllocationForm({
                ...allocationForm,
                target_type: e.target.value as 'budget' | 'goal',
                budget_id: undefined,
                savings_goal_id: undefined,
              })}
              fullWidth
            >
              <MenuItem value="budget">Presupuesto del mes</MenuItem>
              <MenuItem value="goal">Meta o proyecto</MenuItem>
            </TextField>
            {allocationForm.target_type === 'budget' ? (
              <TextField
                select
                label={`Presupuesto ${MONTH_NAMES[CURRENT_MONTH - 1]} ${CURRENT_YEAR}`}
                value={allocationForm.budget_id ?? ''}
                onChange={(e) => setAllocationForm({ ...allocationForm, budget_id: Number(e.target.value) })}
                helperText={budgets.length === 0 ? 'Crea presupuestos para este mes antes de reservarles dinero.' : undefined}
                fullWidth
              >
                {budgets.map((budget: Budget) => (
                  <MenuItem key={budget.id} value={budget.id}>
                    {budget.category_name} · falta financiar {formatCurrency(budget.funding_gap ?? budget.expected_amount)}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                select
                label="Meta o proyecto"
                value={allocationForm.savings_goal_id ?? ''}
                onChange={(e) => setAllocationForm({ ...allocationForm, savings_goal_id: Number(e.target.value) })}
                helperText={activeGoals.length === 0 ? 'Crea una meta activa antes de reservarle dinero.' : undefined}
                fullWidth
              >
                {activeGoals.map((goal: SavingsGoal) => (
                  <MenuItem key={goal.id} value={goal.id}>
                    {goal.name} · falta {formatCurrency(goal.remaining_after_reserved ?? Math.max(goal.target_amount - goal.current_amount, 0))}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Monto a reservar"
              type="number"
              value={allocationForm.amount || ''}
              onChange={(e) => setAllocationForm({ ...allocationForm, amount: Number(e.target.value) || 0 })}
              helperText={`Libre en cuenta: ${formatCurrency(selectedFreeBalance)}`}
              fullWidth
            />
            <TextField
              label="Nota opcional"
              value={allocationForm.notes ?? ''}
              onChange={(e) => setAllocationForm({ ...allocationForm, notes: e.target.value })}
              fullWidth
            />
            {allocationMut.isError && (
              <Alert severity="error">{allocationMut.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAllocationOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!canSaveAllocation || allocationMut.isPending}
            onClick={handleAllocationSave}
          >
            Reservar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar Cuenta"
        message="¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteId !== null && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      <ConfirmDialog
        open={deleteAllocationId !== null}
        title="Liberar dinero reservado"
        message="El saldo volverá a quedar libre dentro de la app. No se modifica ningún movimiento bancario."
        confirmLabel="Liberar"
        onConfirm={() => deleteAllocationId !== null && deleteAllocationMut.mutate(deleteAllocationId)}
        onCancel={() => setDeleteAllocationId(null)}
        loading={deleteAllocationMut.isPending}
      />

      {(createMut.isError || updateMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar la cuenta.</Alert>
      )}
    </Box>
  );
}

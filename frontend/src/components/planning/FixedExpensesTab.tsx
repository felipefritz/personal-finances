import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Stack,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Checkbox,
  FormControlLabel,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import {
  getFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  prepayFixedExpense,
  revertFixedExpensePrepay,
} from '../../api/fixedExpenses';
import { getCategories } from '../../api/categories';
import { getRecurringIncomes } from '../../api/recurringIncomes';
import { getExchangeRates } from '../../api/exchangeRates';
import type { FixedExpense } from '../../types';
import { formatCurrency, formatDate, EXPENSE_TYPES } from '../../utils/formatters';
import LoadingSpinner from '../common/LoadingSpinner';
import ConfirmDialog from '../common/ConfirmDialog';
import CategoryAutocomplete from '../common/CategoryAutocomplete';
import CategoryLabel from '../common/CategoryLabel';

type AmountInputMode = 'monthly' | 'total';
type PaymentPlanMode = 'recurring' | 'installments';

const EMPTY_FORM: Partial<FixedExpense> = {
  name: '',
  expected_amount: 0,
  currency: 'CLP',
  start_date: '',
  payment_day: 1,
  expense_type: 'otro',
  is_active: true,
  total_installments: undefined,
  remaining_installments: undefined,
};

const FIXED_EXPENSE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  categoryName?: string;
  payload: Partial<FixedExpense>;
}> = [
  {
    id: 'dividendo',
    label: 'Dividendo Hipotecario',
    description: 'Pago mensual del credito hipotecario en UF',
    categoryName: 'Vivienda',
    payload: { name: 'Dividendo Hipotecario', expected_amount: 14.5, currency: 'UF', payment_day: 5, expense_type: 'dividendo', is_active: true },
  },
  {
    id: 'internet',
    label: 'Internet Hogar',
    description: 'Servicio mensual de internet',
    categoryName: 'Servicios',
    payload: { name: 'Internet Hogar', expected_amount: 21990, currency: 'CLP', payment_day: 10, expense_type: 'servicio', is_active: true },
  },
  {
    id: 'celular',
    label: 'Plan Celular',
    description: 'Plan de telefonia movil',
    categoryName: 'Servicios',
    payload: { name: 'Plan Celular', expected_amount: 15990, currency: 'CLP', payment_day: 12, expense_type: 'servicio', is_active: true },
  },
  {
    id: 'streaming',
    label: 'Streaming',
    description: 'Suscripciones de video y musica',
    categoryName: 'Suscripciones',
    payload: { name: 'Streaming (Netflix/Spotify)', expected_amount: 14000, currency: 'CLP', payment_day: 3, expense_type: 'suscripcion', is_active: true },
  },
  {
    id: 'seguro_salud',
    label: 'Seguro o Isapre',
    description: 'Pago recurrente de salud',
    categoryName: 'Salud',
    payload: { name: 'Seguro/Isapre', expected_amount: 55000, currency: 'CLP', payment_day: 24, expense_type: 'seguro', is_active: true },
  },
];

export default function FixedExpensesTab() {
  const qc = useQueryClient();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedExpense>>(EMPTY_FORM);
  const [paymentPlanMode, setPaymentPlanMode] = useState<PaymentPlanMode>('recurring');
  const [amountInputMode, setAmountInputMode] = useState<AmountInputMode>('monthly');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(FIXED_EXPENSE_TEMPLATES.map((t) => t.id));
  const [templatesSummary, setTemplatesSummary] = useState<string | null>(null);
  const [prepaySummary, setPrepaySummary] = useState<string | null>(null);
  const [monthlyIncomeBase, setMonthlyIncomeBase] = useState<number | null>(null);
  const [prepayTarget, setPrepayTarget] = useState<FixedExpense | null>(null);
  const [prepayMode, setPrepayMode] = useState<'prepay' | 'revert'>('prepay');
  const [prepayInstallments, setPrepayInstallments] = useState<number>(1);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('payment_day_asc');

  const { data: items = [], isLoading } = useQuery({ queryKey: ['fixed-expenses'], queryFn: getFixedExpenses });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: recurringIncomes = [] } = useQuery({ queryKey: ['recurring-incomes'], queryFn: getRecurringIncomes });
  const { data: exchangeRates } = useQuery({
    queryKey: ['exchange-rates', 'fixed-expenses-form'],
    queryFn: getExchangeRates,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const toClpAmount = (item: Partial<FixedExpense>) => item.expected_amount_clp ?? item.expected_amount ?? 0;
  const toOriginalDebtClp = (item: Partial<FixedExpense>) => item.total_debt_clp ?? ((item.total_installments ?? 0) * toClpAmount(item));
  const toRemainingDebtClp = (item: Partial<FixedExpense>) => item.remaining_debt_clp ?? ((item.remaining_installments ?? 0) * toClpAmount(item));
  const isMortgageExpense = (expenseType?: string) => expenseType === 'dividendo';

  const recurringIncomeTotal = useMemo(
    () => recurringIncomes.filter((income) => income.is_active).reduce((sum, income) => sum + (income.amount || 0), 0),
    [recurringIncomes],
  );

  useEffect(() => {
    if (monthlyIncomeBase === null) {
      setMonthlyIncomeBase(recurringIncomeTotal);
    }
  }, [monthlyIncomeBase, recurringIncomeTotal]);

  const categoriesById = useMemo(() => {
    const map = new Map<number, { id: number; name: string; parent_id?: number; color?: string }>();
    categories.forEach((cat) => {
      map.set(cat.id, { id: cat.id, name: cat.name, parent_id: cat.parent_id, color: cat.color });
    });
    return map;
  }, [categories]);

  const availableTypeValues = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.expense_type).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es-CL'));
  }, [items]);

  const parentCategories = useMemo(() => {
    const parentIdsWithRecords = new Set<number>();
    items.forEach((item) => {
      if (!item.category_id) return;
      const category = categoriesById.get(item.category_id);
      if (!category) return;
      parentIdsWithRecords.add(category.parent_id ?? category.id);
    });
    return categories
      .filter((cat) => !cat.parent_id && parentIdsWithRecords.has(cat.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
  }, [items, categories, categoriesById]);

  const availableSubcategories = useMemo(() => {
    const subcategoryIdsWithRecords = new Set<number>();
    items.forEach((item) => {
      if (!item.category_id) return;
      const category = categoriesById.get(item.category_id);
      if (!category || !category.parent_id) return;
      subcategoryIdsWithRecords.add(category.id);
    });

    const subcategoriesWithRecords = categories.filter((cat) => !!cat.parent_id && subcategoryIdsWithRecords.has(cat.id));

    if (selectedCategory === 'all') {
      return subcategoriesWithRecords.sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
    }

    return subcategoriesWithRecords
      .filter((cat) => cat.parent_id === Number(selectedCategory))
      .sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
  }, [items, categories, categoriesById, selectedCategory]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const itemCategory = item.category_id ? categoriesById.get(item.category_id) : undefined;
      const parentId = itemCategory?.parent_id ?? itemCategory?.id;

      if (selectedType !== 'all' && item.expense_type !== selectedType) return false;
      if (selectedCategory !== 'all' && parentId !== Number(selectedCategory)) return false;
      if (selectedSubcategory !== 'all' && item.category_id !== Number(selectedSubcategory)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'payment_day_desc') return (b.payment_day ?? 99) - (a.payment_day ?? 99);
      if (sortBy === 'amount_desc') return toClpAmount(b) - toClpAmount(a);
      if (sortBy === 'amount_asc') return toClpAmount(a) - toClpAmount(b);
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'es-CL');
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'es-CL');
      return (a.payment_day ?? 99) - (b.payment_day ?? 99) || a.name.localeCompare(b.name, 'es-CL');
    });
  }, [items, categoriesById, selectedType, selectedCategory, selectedSubcategory, sortBy]);

  const filteredActiveItems = useMemo(
    () => filteredItems.filter((item) => item.is_active),
    [filteredItems],
  );

  const effectiveCurrency = isMortgageExpense(form.expense_type) ? 'UF' : (form.currency ?? 'CLP');
  const liveUfValue = exchangeRates?.UF;
  const convertFormAmount = (amount: number, fromCurrency: 'CLP' | 'UF', toCurrency: 'CLP' | 'UF') => {
    if (fromCurrency === toCurrency || !liveUfValue || liveUfValue <= 0) {
      return amount;
    }
    if (fromCurrency === 'CLP' && toCurrency === 'UF') {
      return Number((amount / liveUfValue).toFixed(4));
    }
    return Math.round(amount * liveUfValue);
  };

  const parseInstallments = (value: string, allowZero = true) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const normalized = Math.floor(parsed);
    if (allowZero) return normalized >= 0 ? normalized : undefined;
    return normalized > 0 ? normalized : undefined;
  };

  const liveRawAmount = form.expected_amount ?? 0;
  const usesInstallments = paymentPlanMode === 'installments';
  const liveMonthlyAmount = usesInstallments && amountInputMode === 'total' && form.total_installments
    ? liveRawAmount / form.total_installments
    : liveRawAmount;
  const liveAmountClp = effectiveCurrency === 'UF' && liveUfValue
    ? Math.round(liveMonthlyAmount * liveUfValue)
    : Math.round(liveMonthlyAmount);
  const liveInputAmountClp = effectiveCurrency === 'UF' && liveUfValue
    ? Math.round((form.expected_amount ?? 0) * liveUfValue)
    : Math.round(form.expected_amount ?? 0);
  const liveTotalUf = effectiveCurrency === 'UF'
    ? (amountInputMode === 'total' ? liveRawAmount : liveMonthlyAmount * (form.total_installments ?? 0))
    : 0;
  const liveTotalDebtClp = form.total_installments
    ? liveAmountClp * (form.total_installments ?? 0)
    : 0;
  const liveRemainingUf = effectiveCurrency === 'UF'
    ? liveMonthlyAmount * (form.remaining_installments ?? 0)
    : 0;
  const liveRemainingDebtClp = form.remaining_installments
    ? liveAmountClp * (form.remaining_installments ?? 0)
    : 0;

  const incomeBase = monthlyIncomeBase ?? recurringIncomeTotal;
  const totalFixedExpenses = filteredActiveItems.reduce((sum, item) => sum + toClpAmount(item), 0);
  const installmentTrackedItems = filteredActiveItems.filter((item) => (item.remaining_installments ?? 0) > 0);
  const totalRemainingDebt = installmentTrackedItems.reduce((sum, item) => sum + toRemainingDebtClp(item), 0);
  const monthEndBalance = incomeBase - totalFixedExpenses;
  const fixedRatio = incomeBase > 0 ? (totalFixedExpenses / incomeBase) * 100 : 0;

  const ratioSeverity: 'success' | 'warning' | 'error' =
    fixedRatio <= 50 ? 'success' : fixedRatio <= 70 ? 'warning' : 'error';

  const ratioMessage =
    fixedRatio <= 50
      ? 'Nivel saludable. Tus gastos fijos dejan buen espacio para variables, ahorro e imprevistos.'
      : fixedRatio <= 70
        ? 'Nivel ajustado. Conviene revisar suscripciones o servicios para liberar flujo mensual.'
        : 'Nivel alto de riesgo. Los gastos fijos están consumiendo gran parte del ingreso mensual.';

  const createMut = useMutation({ mutationFn: createFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<FixedExpense> }) => updateFixedExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: deleteFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDeleteId(null); } });
  const prepayMut = useMutation({
    mutationFn: ({ id, installments }: { id: number; installments: number }) => prepayFixedExpense(id, { installments }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
      qc.invalidateQueries({ queryKey: ['projection'] });
      qc.invalidateQueries({ queryKey: ['budget-rules'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });

      if (prepayTarget) {
        setPrepaySummary(
          `Prepago aplicado en ${prepayTarget.name}: ${result.prepaid_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });
  const revertPrepayMut = useMutation({
    mutationFn: ({ id, installments }: { id: number; installments: number }) => revertFixedExpensePrepay(id, { installments }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
      qc.invalidateQueries({ queryKey: ['projection'] });
      qc.invalidateQueries({ queryKey: ['budget-rules'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });

      if (prepayTarget) {
        setPrepaySummary(
          `Reversa aplicada en ${prepayTarget.name}: ${result.reverted_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });
  const templatesMut = useMutation({
    mutationFn: async (templateIds: string[]) => {
      const existingNames = new Set(items.map((it) => it.name.trim().toLocaleLowerCase('es-CL')));
      let created = 0;
      let skipped = 0;

      for (const template of FIXED_EXPENSE_TEMPLATES.filter((item) => templateIds.includes(item.id))) {
        const normalizedName = (template.payload.name ?? '').trim().toLocaleLowerCase('es-CL');
        if (!normalizedName || existingNames.has(normalizedName)) {
          skipped += 1;
          continue;
        }

        const matchedCategory = template.categoryName
          ? categories.find((cat) => cat.name.trim().toLocaleLowerCase('es-CL') === template.categoryName?.trim().toLocaleLowerCase('es-CL'))
          : undefined;

        await createFixedExpense({ ...template.payload, category_id: matchedCategory?.id });
        existingNames.add(normalizedName);
        created += 1;
      }

      return { created, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
      setTemplatesSummary(`Creados ${created} gastos fijos y omitidos ${skipped} por ya existir.`);
      setTemplatesOpen(false);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPaymentPlanMode('recurring');
    setAmountInputMode('monthly');
    setDialogOpen(true);
  };
  const openEdit = (x: FixedExpense) => {
    const hasInstallments = !!x.total_installments && x.total_installments > 0;
    setEditing(x);
    setForm(hasInstallments
      ? {
          ...x,
          expected_amount: Number((x.expected_amount * (x.total_installments ?? 1)).toFixed(x.currency === 'UF' ? 4 : 2)),
        }
      : x);
    setPaymentPlanMode(hasInstallments ? 'installments' : 'recurring');
    setAmountInputMode(hasInstallments ? 'total' : 'monthly');
    setDialogOpen(true);
  };
  const openPrepay = (x: FixedExpense) => {
    setPrepayTarget(x);
    setPrepayMode('prepay');
    setPrepayInstallments(1);
  };
  const openRevertPrepay = (x: FixedExpense) => {
    setPrepayTarget(x);
    setPrepayMode('revert');
    setPrepayInstallments(1);
  };

  const prepayMonthlyAmountClp = prepayTarget ? toClpAmount(prepayTarget) : 0;
  const prepayCurrentRemainingInstallments = prepayTarget?.remaining_installments ?? 0;
  const prepayCurrentTotalDebtClp = prepayCurrentRemainingInstallments * prepayMonthlyAmountClp;
  const maxRevertInstallments = prepayTarget?.total_installments
    ? Math.max((prepayTarget.total_installments ?? 0) - prepayCurrentRemainingInstallments, 0)
    : 120;
  const normalizedPrepayInstallments = prepayMode === 'revert'
    ? Math.min(prepayInstallments, Math.max(maxRevertInstallments, 1))
    : prepayInstallments;
  const prepayRemainingInstallmentsAfter = prepayMode === 'prepay'
    ? Math.max(prepayCurrentRemainingInstallments - normalizedPrepayInstallments, 0)
    : prepayCurrentRemainingInstallments + normalizedPrepayInstallments;
  const prepayTotalDebtAfterClp = prepayRemainingInstallmentsAfter * prepayMonthlyAmountClp;
  const cannotSaveTotalAmount = usesInstallments && amountInputMode === 'total' && !form.total_installments;
  const handleSave = () => {
    if (cannotSaveTotalAmount) return;
    const payload: Partial<FixedExpense> = {
      ...form,
      currency: isMortgageExpense(form.expense_type) ? 'UF' : (form.currency ?? 'CLP'),
      amount_mode: usesInstallments ? amountInputMode : 'monthly',
      start_date: form.start_date || undefined,
      total_installments: usesInstallments && form.total_installments && form.total_installments > 0 ? form.total_installments : null,
      remaining_installments: usesInstallments && form.remaining_installments && form.remaining_installments > 0 ? form.remaining_installments : null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Suscripciones, servicios y pagos recurrentes</Typography>
        <Button variant="contained" onClick={openCreate}>Nuevo Gasto Fijo</Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddIcon />}
          onClick={() => setTemplatesOpen(true)}
        >
          Agregar pre cargados
        </Button>
        {templatesSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{templatesSummary}</Alert>}
        {prepaySummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{prepaySummary}</Alert>}
        {templatesMut.isError && <Alert severity="error">No se pudieron crear los gastos fijos pre cargados.</Alert>}
        {prepayMut.isError && <Alert severity="error">No se pudo aplicar el prepago.</Alert>}
        {revertPrepayMut.isError && <Alert severity="error">No se pudo revertir el prepago.</Alert>}
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2, p: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
              Flujo mensual de gastos fijos ({currentMonth}/{currentYear})
            </Typography>
            <TextField
              label="Ingreso base del mes"
              type="number"
              value={incomeBase}
              onChange={(e) => setMonthlyIncomeBase(parseFloat(e.target.value) || 0)}
              size="small"
              sx={{ minWidth: 220 }}
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Base tomada desde ingresos recurrentes activos: {formatCurrency(recurringIncomeTotal)}. Los resúmenes convierten automáticamente a CLP cuando un gasto está en UF.
          </Typography>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              label="Tipo"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="all">Todos</MenuItem>
              {availableTypeValues.map((value) => (
                <MenuItem key={value} value={value}>
                  {EXPENSE_TYPES.find((t) => t.value === value)?.label ?? value}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Categoría"
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory('all');
              }}
              sx={{ minWidth: 190 }}
            >
              <MenuItem value="all">Todas</MenuItem>
              {parentCategories.map((cat) => <MenuItem key={cat.id} value={String(cat.id)}>{cat.name}</MenuItem>)}
            </TextField>

            <TextField
              select
              size="small"
              label="Subcategoría"
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              sx={{ minWidth: 210 }}
            >
              <MenuItem value="all">Todas</MenuItem>
              {availableSubcategories.map((cat) => <MenuItem key={cat.id} value={String(cat.id)}>{cat.name}</MenuItem>)}
            </TextField>

            <TextField
              select
              size="small"
              label="Orden"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="payment_day_asc">Día pago (menor a mayor)</MenuItem>
              <MenuItem value="payment_day_desc">Día pago (mayor a menor)</MenuItem>
              <MenuItem value="amount_desc">Monto (mayor a menor)</MenuItem>
              <MenuItem value="amount_asc">Monto (menor a mayor)</MenuItem>
              <MenuItem value="name_asc">Nombre (A-Z)</MenuItem>
              <MenuItem value="name_desc">Nombre (Z-A)</MenuItem>
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Typography variant="body2" color="text.secondary">
              Total gastos fijos activos filtrados: <strong>{formatCurrency(totalFixedExpenses)}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Deuda remanente en cuotas: <strong>{formatCurrency(totalRemainingDebt)}</strong>
            </Typography>
            <Typography variant="body2" color={ratioSeverity === 'success' ? 'success.main' : ratioSeverity === 'warning' ? 'warning.main' : 'error.main'}>
              Relación gasto fijo/ingreso: <strong>{fixedRatio.toFixed(1)}%</strong>
            </Typography>
            <Typography variant="body2" color={monthEndBalance >= 0 ? 'success.main' : 'error.main'}>
              Saldo final estimado: <strong>{formatCurrency(monthEndBalance)}</strong>
            </Typography>
          </Stack>

          <Alert severity={ratioSeverity}>
            {ratioMessage}
            {ratioSeverity !== 'success' && (
              <> Objetivo recomendado: mantener gastos fijos bajo el 50% del ingreso mensual.</>
            )}
          </Alert>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Día</TableCell>
                  <TableCell>Gasto fijo</TableCell>
                  <TableCell align="right">Cuotas</TableCell>
                  <TableCell align="right">Cuota mensual</TableCell>
                  <TableCell align="right">Acumulado</TableCell>
                  <TableCell align="right">Saldo restante</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(() => {
                  let runningTotal = 0;
                  return filteredActiveItems.map((item) => {
                    runningTotal += toClpAmount(item);
                    const remainingBalance = incomeBase - runningTotal;

                    return (
                      <TableRow key={`flow-${item.id}`}>
                        <TableCell>{item.payment_day ?? '—'}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell align="right">
                          {item.remaining_installments ? `${item.remaining_installments}/${item.total_installments ?? item.remaining_installments}` : '—'}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(toClpAmount(item))}</TableCell>
                        <TableCell align="right">{formatCurrency(runningTotal)}</TableCell>
                        <TableCell align="right" sx={{ color: remainingBalance >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                          {formatCurrency(remainingBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
                {filteredActiveItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">Sin gastos fijos activos para calcular con los filtros actuales</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Subcategoría</TableCell>
                <TableCell>Día</TableCell>
                <TableCell>Inicio</TableCell>
                  <TableCell align="right">Cuotas</TableCell>
                  <TableCell align="right">Deuda remanente</TableCell>
                <TableCell align="right">Cuota mensual</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => {
                const category = item.category_id ? categoriesById.get(item.category_id) : undefined;
                const parentCategory = category?.parent_id ? categoriesById.get(category.parent_id) : category;
                const subcategory = category?.parent_id ? category : undefined;
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={EXPENSE_TYPES.find((t) => t.value === item.expense_type)?.label ?? item.expense_type}
                      />
                    </TableCell>
                    <TableCell>
                      <CategoryLabel name={parentCategory?.name} color={parentCategory?.color ?? item.category_color} />
                    </TableCell>
                    <TableCell>
                      <CategoryLabel
                        name={subcategory?.name}
                        color={subcategory?.color ?? parentCategory?.color ?? item.category_color}
                        fallback="—"
                      />
                    </TableCell>
                    <TableCell>{item.payment_day ?? '—'}</TableCell>
                    <TableCell>{item.start_date ? formatDate(item.start_date) : '—'}</TableCell>
                    <TableCell align="right">{item.remaining_installments ? `${item.remaining_installments}/${item.total_installments ?? item.remaining_installments}` : '—'}</TableCell>
                    <TableCell align="right">{item.remaining_installments ? formatCurrency(toRemainingDebtClp(item)) : '—'}</TableCell>
                    <TableCell align="right">
                      <Stack spacing={0.25} alignItems="flex-end">
                        <Typography variant="body2" fontWeight={600}>{formatCurrency(item.expected_amount, item.currency)}</Typography>
                        {!!item.total_installments && (
                          <Typography variant="caption" color="text.secondary">
                            Total original: {formatCurrency(toOriginalDebtClp(item))}
                          </Typography>
                        )}
                        {item.currency === 'UF' && (
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(toClpAmount(item))}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      {item.remaining_installments && item.remaining_installments > 0 && (
                        <Button
                          size="small"
                          startIcon={<PaymentsOutlinedIcon fontSize="small" />}
                          onClick={() => openPrepay(item)}
                          sx={{ mr: 0.5 }}
                        >
                          Prepagar
                        </Button>
                      )}
                      {!!item.total_installments && (item.remaining_installments ?? 0) < item.total_installments && (
                        <Button
                          size="small"
                          startIcon={<UndoIcon fontSize="small" />}
                          onClick={() => openRevertPrepay(item)}
                          sx={{ mr: 0.5 }}
                        >
                          Revertir
                        </Button>
                      )}
                      <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(item.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredItems.length === 0 && (
                <TableRow><TableCell colSpan={10} align="center">Sin gastos fijos para los filtros seleccionados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Gasto Fijo' : 'Nuevo Gasto Fijo'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Nombre" value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Este gasto es
              </Typography>
              <ToggleButtonGroup
                value={paymentPlanMode}
                exclusive
                size="small"
                onChange={(_, value: PaymentPlanMode | null) => {
                  if (!value) return;
                  setPaymentPlanMode(value);
                  setAmountInputMode(value === 'installments' ? amountInputMode : 'monthly');
                }}
                fullWidth
              >
                <ToggleButton value="recurring">Mensual normal</ToggleButton>
                <ToggleButton value="installments">Credito o cuotas</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {usesInstallments && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Estoy ingresando
                </Typography>
                <ToggleButtonGroup
                  value={amountInputMode}
                  exclusive
                  size="small"
                  onChange={(_, value: AmountInputMode | null) => value && setAmountInputMode(value)}
                  fullWidth
                >
                  <ToggleButton value="monthly">Cuota mensual</ToggleButton>
                  <ToggleButton value="total">Monto total del credito</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={`${usesInstallments && amountInputMode === 'total' ? 'Monto total del credito' : 'Monto mensual'} (${effectiveCurrency})`}
                type="number"
                value={form.expected_amount ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, expected_amount: parseFloat(e.target.value) || 0 }))}
                helperText={usesInstallments && amountInputMode === 'total'
                  ? (form.total_installments
                      ? `Cuota mensual estimada: ${formatCurrency(liveMonthlyAmount, effectiveCurrency)} (${formatCurrency(liveAmountClp)})`
                      : 'Indica las cuotas totales para estimar la cuota mensual.')
                  : (effectiveCurrency === 'UF'
                      ? (liveUfValue
                          ? `Equivale aprox. a ${formatCurrency(liveAmountClp)} con UF ${formatCurrency(liveUfValue, 'UF')}`
                          : 'Cargando UF vigente para calcular equivalente en pesos...')
                      : `Equivale a ${formatCurrency(liveInputAmountClp)}`)}
                fullWidth
              />
              <TextField
                select
                label="Moneda"
                value={effectiveCurrency}
                onChange={(e) => {
                  const nextCurrency = e.target.value as FixedExpense['currency'];
                  setForm((f) => {
                    const currentCurrency = isMortgageExpense(f.expense_type) ? 'UF' : (f.currency ?? 'CLP');
                    const convertedAmount = convertFormAmount(f.expected_amount ?? 0, currentCurrency, nextCurrency);
                    return { ...f, currency: nextCurrency, expected_amount: convertedAmount };
                  });
                }}
                disabled={isMortgageExpense(form.expense_type)}
                helperText={isMortgageExpense(form.expense_type) ? 'Los gastos hipotecarios se guardan siempre en UF.' : 'Para otros gastos fijos puedes elegir entre CLP y UF.'}
                fullWidth
              >
                <MenuItem value="CLP">Peso chileno (CLP)</MenuItem>
                <MenuItem value="UF">UF</MenuItem>
              </TextField>
            </Stack>
            <TextField label="Inicio" type="date" value={form.start_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Día del mes" type="number" inputProps={{ min: 1, max: 31 }} value={form.payment_day ?? 1} onChange={(e) => setForm((f) => ({ ...f, payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))} fullWidth />
            <TextField
              select
              label="Tipo"
              value={form.expense_type ?? 'fixed'}
              onChange={(e) => {
                const nextType = e.target.value as FixedExpense['expense_type'];
                setForm((f) => {
                  const currentCurrency = isMortgageExpense(f.expense_type) ? 'UF' : (f.currency ?? 'CLP');
                  const nextCurrency = nextType === 'dividendo' ? 'UF' : (f.currency ?? 'CLP');
                  const convertedAmount = convertFormAmount(f.expected_amount ?? 0, currentCurrency, nextCurrency);
                  return {
                    ...f,
                    expense_type: nextType,
                    currency: nextCurrency,
                    expected_amount: convertedAmount,
                  };
                });
                if (nextType === 'credito' || nextType === 'dividendo') {
                  setPaymentPlanMode('installments');
                }
              }}
              fullWidth
            >
              {EXPENSE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            {usesInstallments && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Cuotas totales"
                  type="number"
                  inputProps={{ min: 1 }}
                  value={form.total_installments ?? ''}
                  onChange={(e) => {
                    const totalInstallments = parseInstallments(e.target.value, false);
                    setForm((f) => {
                      const remainingInstallments = f.remaining_installments;
                      return {
                        ...f,
                        total_installments: totalInstallments,
                        remaining_installments: totalInstallments && remainingInstallments && remainingInstallments > totalInstallments
                          ? totalInstallments
                          : remainingInstallments,
                      };
                    });
                  }}
                  helperText={form.total_installments ? (effectiveCurrency === 'UF'
                    ? `Monto total estimado: ${formatCurrency(liveTotalUf, 'UF')} aprox. ${formatCurrency(liveTotalDebtClp)}`
                    : `Monto total estimado: ${formatCurrency(liveTotalDebtClp)}`) : 'Necesario si ingresas monto total; útil para seguir la deuda'}
                  fullWidth
                />
                <TextField
                  label="Cuotas pendientes"
                  type="number"
                  inputProps={{ min: 0 }}
                  value={form.remaining_installments ?? ''}
                  onChange={(e) => {
                    const nextRemaining = parseInstallments(e.target.value, true);
                    setForm((f) => {
                      const maxRemaining = f.total_installments;
                      const normalizedRemaining = maxRemaining && nextRemaining && nextRemaining > maxRemaining
                        ? maxRemaining
                        : nextRemaining;
                      return { ...f, remaining_installments: normalizedRemaining };
                    });
                  }}
                  helperText={form.remaining_installments ? (effectiveCurrency === 'UF'
                    ? `Deuda remanente estimada: ${formatCurrency(liveRemainingUf, 'UF')} aprox. ${formatCurrency(liveRemainingDebtClp)}`
                    : `Deuda remanente estimada: ${formatCurrency(liveRemainingDebtClp)}`) : 'Opcional si solo quieres registrar la cuota mensual'}
                  fullWidth
                />
              </Stack>
            )}
            {effectiveCurrency === 'UF' && liveUfValue && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: -1 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Conversión referencial con UF vigente. El valor final guardado en CLP se recalcula con la tasa actual del backend.
                </Typography>
              </Stack>
            )}
            {usesInstallments && amountInputMode === 'total' && (
              <Alert severity="info">
                Para creditos como CAE, la app guarda la cuota mensual estimada y solo esa cuota entra al mes, al presupuesto y a la proyección.
              </Alert>
            )}
            <CategoryAutocomplete
              categories={categories}
              value={form.category_id ?? null}
              onChange={(id) => setForm((f) => ({ ...f, category_id: id ?? undefined }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || cannotSaveTotalAmount || createMut.isPending || updateMut.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Selecciona gastos fijos pre cargados</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', pt: 1 }}>
            {FIXED_EXPENSE_TEMPLATES.map((template) => {
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
            Crear seleccionados
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar Gasto Fijo"
        message="¿Seguro que quieres eliminar este gasto fijo?"
        confirmLabel="Eliminar"
        onConfirm={() => deleteId !== null && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      <Dialog open={prepayTarget !== null} onClose={() => setPrepayTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{prepayMode === 'prepay' ? 'Prepagar deuda' : 'Revertir prepago de deuda'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2">
              {prepayTarget?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Cuotas pendientes actuales: {prepayTarget?.remaining_installments ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Monto pendiente actual: {formatCurrency(prepayCurrentTotalDebtClp)}
            </Typography>
            <TextField
              label={prepayMode === 'prepay' ? 'Cuotas a prepagar' : 'Cuotas a restaurar'}
              type="number"
              inputProps={{
                min: 1,
                max: prepayMode === 'prepay'
                  ? (prepayTarget?.remaining_installments ?? 1)
                  : Math.max(maxRevertInstallments, 1),
              }}
              value={normalizedPrepayInstallments}
              onChange={(e) => {
                const raw = Number(e.target.value);
                const max = prepayMode === 'prepay'
                  ? (prepayTarget?.remaining_installments ?? 1)
                  : Math.max(maxRevertInstallments, 1);
                if (!Number.isFinite(raw)) {
                  setPrepayInstallments(1);
                  return;
                }
                setPrepayInstallments(Math.min(max, Math.max(1, Math.floor(raw))));
              }}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Luego del prepago quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`
                : `Luego de la reversa quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Monto pendiente luego del prepago: ${formatCurrency(prepayTotalDebtAfterClp)}`
                : `Monto pendiente luego de la reversa: ${formatCurrency(prepayTotalDebtAfterClp)}`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrepayTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !prepayTarget
              || prepayMut.isPending
              || revertPrepayMut.isPending
              || (prepayMode === 'revert' && maxRevertInstallments <= 0)
            }
            onClick={() => {
              if (!prepayTarget) return;
              if (prepayMode === 'prepay') {
                prepayMut.mutate({ id: prepayTarget.id, installments: normalizedPrepayInstallments });
              } else {
                revertPrepayMut.mutate({ id: prepayTarget.id, installments: normalizedPrepayInstallments });
              }
            }}
          >
            {prepayMode === 'prepay' ? 'Confirmar prepago' : 'Confirmar reversa'}
          </Button>
        </DialogActions>
      </Dialog>

      {(createMut.isError || updateMut.isError || deleteMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar cambios.</Alert>
      )}
    </Box>
  );
}

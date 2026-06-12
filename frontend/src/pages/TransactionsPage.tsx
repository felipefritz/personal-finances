import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Stack,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Collapse,
  Alert,
  Tooltip,
  TableSortLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import PaidIcon from '@mui/icons-material/Paid';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import LanguageIcon from '@mui/icons-material/Language';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../api/transactions';
import { getAccounts } from '../api/accounts';
import { getCategories } from '../api/categories';
import type { Transaction, TransactionFilters } from '../types';
import { formatCurrency, formatDate, TRANSACTION_TYPES } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import CategoryAutocomplete from '../components/common/CategoryAutocomplete';

const EMPTY_FORM: Partial<Transaction> = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: 0,
  transaction_type: 'expense',
  status: 'confirmed',
};

const TYPE_COLOR: Record<string, 'success' | 'error' | 'info'> = {
  income: 'success',
  expense: 'error',
  transfer: 'info',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  fintoc: 'API Fintoc',
  excel: 'Archivo Excel',
  pdf: 'Archivo PDF',
};

const INCOME_TEMPLATES = [
  { label: 'Sueldo', description: 'Sueldo mensual' },
  { label: 'Abono', description: 'Abono recibido' },
  { label: 'Transferencia recibida', description: 'Transferencia recibida' },
  { label: 'Reembolso', description: 'Reembolso' },
  { label: 'Intereses', description: 'Intereses o rentabilidad' },
];

function getCurrentMonthFilters(): TransactionFilters {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    date_from: toIsoDate(start),
    date_to: toIsoDate(end),
  };
}

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);
  const [filters, setFilters] = useState<TransactionFilters>(() => getCurrentMonthFilters());
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'account' | 'amount' | 'description' | 'category' | 'type' | 'paid'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const searchTimeoutRef = useRef<number>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>(EMPTY_FORM);
  // Debounce búsqueda
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined }));
      setPage(0);
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchInput]);

  const serverSortBy = sortBy === 'date' || sortBy === 'account' || sortBy === 'amount' ? sortBy : undefined;
  const queryFilters = { ...filters, page: page + 1, page_size: rowsPerPage, sort_by: serverSortBy, sort_order: sortOrder };

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', queryFilters],
    queryFn: () => getTransactions(queryFilters),
  });

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const invalidateMovementDependentViews = () => {
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['projection'] });
    qc.invalidateQueries({ queryKey: ['budget-rules'] });
    qc.invalidateQueries({ queryKey: ['active-installments'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createMut = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => { invalidateMovementDependentViews(); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => updateTransaction(id, data),
    onSuccess: () => { invalidateMovementDependentViews(); setDialogOpen(false); },
  });
  const togglePaidMut = useMutation({
    mutationFn: ({ id, is_paid }: { id: number; is_paid: boolean }) => updateTransaction(id, { is_paid }),
    onSuccess: () => invalidateMovementDependentViews(),
  });
  const deleteMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => { invalidateMovementDependentViews(); setDeleteId(null); },
  });
  const openCreate = () => {
    refetchCategories();
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openCreateWithType = (transactionType: Transaction['transaction_type']) => {
    refetchCategories();
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      transaction_type: transactionType,
      description:
        transactionType === 'income'
          ? 'Sueldo mensual'
          : transactionType === 'transfer'
            ? 'Transferencia entre cuentas'
            : '',
    });
    setDialogOpen(true);
  };
  const openEdit = (t: Transaction) => {
    refetchCategories();
    setEditing(t);
    setForm(t);
    setDialogOpen(true);
  };
  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const setFilter = (k: keyof TransactionFilters, v: unknown) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const handleSort = (column: 'date' | 'account' | 'amount' | 'description' | 'category' | 'type' | 'paid') => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortOrder(column === 'amount' || column === 'date' ? 'desc' : 'asc');
    setPage(0);
  };

  const transactions = data?.items ?? [];
  const displayedTransactions = useMemo(() => {
    const rows = [...transactions];
    const direction = sortOrder === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      let av: string | number | boolean = '';
      let bv: string | number | boolean = '';

      switch (sortBy) {
        case 'date':
          av = new Date(a.date).getTime();
          bv = new Date(b.date).getTime();
          break;
        case 'amount':
          av = (a.is_international && a.local_amount != null ? a.local_amount : a.amount) ?? 0;
          bv = (b.is_international && b.local_amount != null ? b.local_amount : b.amount) ?? 0;
          break;
        case 'account':
          av = (a.account_name || '').toLowerCase();
          bv = (b.account_name || '').toLowerCase();
          break;
        case 'description':
          av = (a.description || '').toLowerCase();
          bv = (b.description || '').toLowerCase();
          break;
        case 'category':
          av = (a.category_name || '').toLowerCase();
          bv = (b.category_name || '').toLowerCase();
          break;
        case 'type':
          av = (a.transaction_type || '').toLowerCase();
          bv = (b.transaction_type || '').toLowerCase();
          break;
        case 'paid':
          av = a.is_paid;
          bv = b.is_paid;
          break;
      }

      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return 0;
    });

    return rows;
  }, [transactions, sortBy, sortOrder]);
  const total = data?.total ?? 0;
  const totalAmount = data?.total_amount ?? 0;
  if (isLoading && !data) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Movimientos"
          subtitle="Gestiona, filtra y revisa tus movimientos registrados"
        action={{ label: 'Nuevo Movimiento', onClick: openCreate }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="outlined" color="success" startIcon={<PaidIcon />} onClick={() => openCreateWithType('income')}>
          Registrar ingreso
        </Button>
        <Button variant="outlined" color="info" startIcon={<CompareArrowsIcon />} onClick={() => openCreateWithType('transfer')}>
          Registrar transferencia
        </Button>
        <Alert severity="info" sx={{ flexGrow: 1 }}>
          Puedes registrar sueldos, abonos y transferencias recibidas. Los movimientos nuevos se categorizan automáticamente por descripción.
        </Alert>
      </Stack>

      {/* Filters */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="body2" fontWeight={600}>Filtros</Typography>
        </Box>
          <Box sx={{ px: 2, pb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Desde" type="date" size="small" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={filters.date_from ?? ''}
                  onChange={(e) => setFilter('date_from', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Hasta" type="date" size="small" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={filters.date_to ?? ''}
                  onChange={(e) => setFilter('date_to', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  select label="Tipo" size="small" fullWidth
                  value={filters.transaction_type ?? ''}
                  onChange={(e) => setFilter('transaction_type', e.target.value)}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {TRANSACTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  select label="Cuenta" size="small" fullWidth
                  value={filters.account_id ?? ''}
                  onChange={(e) => setFilter('account_id', e.target.value ? Number(e.target.value) : undefined)}
                >
                  <MenuItem value="">Todas</MenuItem>
                  {accounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  label="Buscar" size="small" fullWidth
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Descripción..."
                />
              </Grid>
            </Grid>
            <Grid container spacing={2} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select label="Ordenar por" size="small" fullWidth
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'account' | 'amount' | 'description' | 'category' | 'type' | 'paid')}
                >
                  <MenuItem value="date">Fecha</MenuItem>
                  <MenuItem value="description">Descripción</MenuItem>
                  <MenuItem value="category">Categoría</MenuItem>
                  <MenuItem value="account">Cuenta</MenuItem>
                  <MenuItem value="type">Tipo</MenuItem>
                  <MenuItem value="paid">Pagado</MenuItem>
                  <MenuItem value="amount">Monto</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select label="Orden" size="small" fullWidth
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                >
                  <MenuItem value="desc">Descendente</MenuItem>
                  <MenuItem value="asc">Ascendente</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={() => {
                setSearchInput('');
                setFilters(getCurrentMonthFilters());
              }}
            >
              Limpiar filtros
            </Button>
          </Box>
      </Card>

      <Card
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          mb: 2,
          background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}12 0%, ${theme.palette.background.paper} 100%)`,
        }}
      >
        <CardContent sx={{ py: 1.75, '&:last-child': { pb: 1.75 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip label="Resumen del filtro" color="primary" size="small" />
              <Typography variant="subtitle2" fontWeight={700}>
                {data ? `${data.total} transacciones filtradas` : 'Cargando movimientos...'}
              </Typography>
            </Stack>
            <Box
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                bgcolor: totalAmount < 0 ? 'error.main' : totalAmount > 0 ? 'success.main' : 'action.selected',
                color: totalAmount < 0 || totalAmount > 0 ? '#fff' : 'text.primary',
              }}
            >
              <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }}>
                Suma total filtrada
              </Typography>
              <Typography variant="subtitle1" fontWeight={800} lineHeight={1.1}>
                {data ? formatCurrency(totalAmount) : '...'}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel active={sortBy === 'date'} direction={sortBy === 'date' ? sortOrder : 'asc'} onClick={() => handleSort('date')}>
                    Fecha
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortBy === 'description'} direction={sortBy === 'description' ? sortOrder : 'asc'} onClick={() => handleSort('description')}>
                    Descripción
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortBy === 'category'} direction={sortBy === 'category' ? sortOrder : 'asc'} onClick={() => handleSort('category')}>
                    Categoría
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortBy === 'account'} direction={sortBy === 'account' ? sortOrder : 'asc'} onClick={() => handleSort('account')}>
                    Cuenta
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortBy === 'type'} direction={sortBy === 'type' ? sortOrder : 'asc'} onClick={() => handleSort('type')}>
                    Tipo
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  Fuente
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortBy === 'amount'} direction={sortBy === 'amount' ? sortOrder : 'asc'} onClick={() => handleSort('amount')}>
                    Monto (CLP)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel active={sortBy === 'paid'} direction={sortBy === 'paid' ? sortOrder : 'asc'} onClick={() => handleSort('paid')}>
                    Pagado
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedTransactions.map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>
                    <Typography variant="body2">{formatDate(tx.date)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                      {tx.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                      {tx.is_fixed_expense && <Chip label="Fijo" size="small" color="warning" />}
                      {tx.is_debt && <Chip label="Deuda/Cuota" size="small" color="error" variant="outlined" />}
                      {tx.is_ant_expense && <Chip label="Hormiga" size="small" color="secondary" />}
                      {tx.is_international && (
                        <Tooltip
                          title={
                            tx.original_amount && tx.original_currency
                              ? `Monto original: ${tx.original_currency} ${tx.original_amount.toLocaleString('es-CL')}`
                              : 'Gasto internacional'
                          }
                        >
                          <Chip
                            label={tx.original_currency ?? 'Intl'}
                            size="small"
                            color="primary"
                            variant="outlined"
                            icon={<LanguageIcon />}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{tx.category_name || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{tx.account_name || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={TRANSACTION_TYPES.find((t) => t.value === tx.transaction_type)?.label ?? tx.transaction_type}
                      size="small"
                      color={TYPE_COLOR[tx.transaction_type] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={SOURCE_LABEL[tx.source] ?? tx.source ?? '—'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={
                        tx.transaction_type === 'income'
                          ? 'success.main'
                          : tx.transaction_type === 'expense'
                            ? 'error.main'
                            : 'info.main'
                      }
                    >
                      {tx.is_international && tx.local_amount != null
                        ? formatCurrency(tx.local_amount)
                        : formatCurrency(tx.amount)}
                    </Typography>
                    {tx.is_international && tx.local_amount != null && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {formatCurrency(tx.amount, 'USD')}
                      </Typography>
                    )}
                    {tx.is_international && tx.exchange_rate_usd != null && (
                      <Typography variant="caption" color="text.disabled" display="block">
                        1 USD = {formatCurrency(tx.exchange_rate_usd)}
                      </Typography>
                    )}
                    {tx.is_international && tx.original_amount && tx.original_currency &&
                      tx.original_currency !== 'USD' && tx.original_currency !== 'CLP' && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tx.original_currency} {tx.original_amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={tx.is_paid ? 'Marcar como pendiente' : 'Marcar como pagado'}>
                      <IconButton
                        size="small"
                        color={tx.is_paid ? 'success' : 'default'}
                        onClick={() => togglePaidMut.mutate({ id: tx.id, is_paid: !tx.is_paid })}
                      >
                        {tx.is_paid
                          ? <CheckCircleIcon fontSize="small" />
                          : <RadioButtonUncheckedIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(tx)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => setDeleteId(tx.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {displayedTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Sin movimientos</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[20]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Movimiento' : 'Nuevo Movimiento'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Fecha" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.date ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <TextField
              label="Descripción" size="small" fullWidth
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <TextField
              label="Monto" type="number" size="small" fullWidth
              value={form.amount ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            />
            <TextField
              select label="Tipo" size="small" fullWidth
              value={form.transaction_type ?? 'expense'}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  transaction_type: e.target.value as Transaction['transaction_type'],
                }))
              }
            >
              {TRANSACTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            {form.transaction_type === 'income' && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {INCOME_TEMPLATES.map((template) => (
                  <Chip
                    key={template.label}
                    label={template.label}
                    color="success"
                    variant="outlined"
                    onClick={() => setForm((f) => ({ ...f, description: template.description, transaction_type: 'income' }))}
                  />
                ))}
              </Stack>
            )}
            <TextField
              select label="Cuenta" size="small" fullWidth
              value={form.account_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, account_id: Number(e.target.value) }))}
            >
              <MenuItem value="">Sin cuenta</MenuItem>
              {accounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
            <CategoryAutocomplete
              categories={categories}
              value={form.category_id ?? null}
              onChange={(id) => setForm((f) => ({ ...f, category_id: id ?? undefined }))}
            />
            {form.transaction_type === 'income' && (
              <Alert severity="success">
                Registra aquí sueldos, abonos y otros ingresos. El sistema los usará para sugerir presupuestos mensuales y metas de ahorro.
              </Alert>
            )}
            <TextField
              label="Comentario" size="small" fullWidth multiline rows={2}
              value={form.comment ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending}
          >
            {editing ? 'Guardar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar Movimiento"
        message="¿Eliminar este movimiento? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteId !== null && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
      {(createMut.isError || updateMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar.</Alert>
      )}
    </Box>
  );
}

import { useState } from 'react';
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

const INCOME_TEMPLATES = [
  { label: 'Sueldo', description: 'Sueldo mensual' },
  { label: 'Abono', description: 'Abono recibido' },
  { label: 'Transferencia recibida', description: 'Transferencia recibida' },
  { label: 'Reembolso', description: 'Reembolso' },
  { label: 'Intereses', description: 'Intereses o rentabilidad' },
];

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>(EMPTY_FORM);

  const queryFilters = { ...filters, page: page + 1, page_size: rowsPerPage };

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', queryFilters],
    queryFn: () => getTransactions(queryFilters),
  });

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  const createMut = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => updateTransaction(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setDialogOpen(false); },
  });
  const togglePaidMut = useMutation({
    mutationFn: ({ id, is_paid }: { id: number; is_paid: boolean }) => updateTransaction(id, { is_paid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
  const deleteMut = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setDeleteId(null); },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openCreateWithType = (transactionType: Transaction['transaction_type']) => {
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
  const openEdit = (t: Transaction) => { setEditing(t); setForm(t); setDialogOpen(true); };
  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const setFilter = (k: keyof TransactionFilters, v: unknown) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const transactions = data?.items ?? [];
  const total = data?.total ?? 0;

  if (isLoading && !data) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Movimientos"
        subtitle={`${total} transacciones`}
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
          Puedes registrar sueldos, abonos, transferencias recibidas y otros ingresos desde esta pantalla.
        </Alert>
      </Stack>

      {/* Filters */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <Box
          sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="body2" fontWeight={600}>Filtros</Typography>
        </Box>
        <Collapse in={showFilters}>
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
                  value={filters.search ?? ''}
                  onChange={(e) => setFilter('search', e.target.value)}
                />
              </Grid>
            </Grid>
            <Button size="small" sx={{ mt: 1 }} onClick={() => setFilters({})}>Limpiar filtros</Button>
          </Box>
        </Collapse>
      </Card>

      {/* Table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Cuenta</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Monto (CLP)</TableCell>
                <TableCell align="center">Pagado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((tx) => (
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
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={tx.transaction_type === 'income' ? 'success.main' : 'error.main'}
                    >
                      {formatCurrency(tx.amount)}
                    </Typography>
                    {tx.is_international && tx.original_amount && tx.original_currency && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tx.original_currency} {tx.original_amount.toLocaleString('es-CL')}
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
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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
            <TextField
              select label="Categoría" size="small" fullWidth
              value={form.category_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category_id: Number(e.target.value) }))}
            >
              <MenuItem value="">Sin categoría</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
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

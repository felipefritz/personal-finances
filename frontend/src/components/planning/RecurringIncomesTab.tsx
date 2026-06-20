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
  FormControlLabel,
  Switch,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { getRecurringIncomes, createRecurringIncome, updateRecurringIncome, deleteRecurringIncome } from '../../api/recurringIncomes';
import { getCategories } from '../../api/categories';
import { getAccounts } from '../../api/accounts';
import type { RecurringIncome } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import LoadingSpinner from '../common/LoadingSpinner';
import ConfirmDialog from '../common/ConfirmDialog';
import CategoryAutocomplete from '../common/CategoryAutocomplete';
import CategoryLabel from '../common/CategoryLabel';

const INCOME_TYPES = [
  { value: 'sueldo', label: 'Sueldo' },
  { value: 'honorarios', label: 'Honorarios' },
  { value: 'arriendo', label: 'Arriendo recibido' },
  { value: 'pension', label: 'Pensión / Jubilación' },
  { value: 'dividendo', label: 'Dividendo' },
  { value: 'otro', label: 'Otro ingreso' },
];

const EMPTY_FORM: Partial<RecurringIncome> = {
  name: '',
  amount: 0,
  income_type: 'sueldo',
  day_of_month: 1,
  is_active: true,
};

export default function RecurringIncomesTab() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringIncome | null>(null);
  const [form, setForm] = useState<Partial<RecurringIncome>>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<RecurringIncome | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['recurring-incomes'],
    queryFn: getRecurringIncomes,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const incomeCategories = categories;

  const createMut = useMutation({
    mutationFn: createRecurringIncome,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-incomes'] }); closeDialog(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<RecurringIncome> }) =>
      updateRecurringIncome(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-incomes'] }); closeDialog(); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteRecurringIncome,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-incomes'] }); setDeleteTarget(null); },
  });

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (ri: RecurringIncome) => { setEditing(ri); setForm({ ...ri }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSave = () => {
    if (!form.name || !form.amount) return;
    if (editing) {
      updateMut.mutate({ id: editing.id, payload: form });
    } else {
      createMut.mutate(form);
    }
  };

  const totalActive = items
    .filter((r) => r.is_active)
    .reduce((s, r) => s + r.amount, 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Define tus sueldos, honorarios y otros ingresos periódicos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Nuevo Ingreso</Button>
      </Box>

      <Stack direction="row" spacing={2} mb={2}>
        <Chip label={`${items.length} ingresos definidos`} />
        <Chip
          label={`Total mensual activo: ${formatCurrency(totalActive)}`}
          color="success"
        />
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Monto mensual</TableCell>
                <TableCell>Día de cobro</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Cuenta</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary" py={3}>
                      No hay ingresos recurrentes. Agrega tu sueldo u otros ingresos periódicos.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {items.map((ri) => (
                <TableRow key={ri.id} sx={!ri.is_active ? { opacity: 0.5 } : undefined}>
                  <TableCell>{ri.name}</TableCell>
                  <TableCell>
                    {INCOME_TYPES.find((t) => t.value === ri.income_type)?.label ?? ri.income_type}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(ri.amount)}</TableCell>
                  <TableCell>{ri.day_of_month ? `Día ${ri.day_of_month}` : '—'}</TableCell>
                  <TableCell>
                    <CategoryLabel name={ri.category_name} color={ri.category_color} fallback="—" />
                  </TableCell>
                  <TableCell>{ri.account_name ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={ri.is_active ? 'Activo' : 'Inactivo'}
                      color={ri.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(ri)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(ri)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar ingreso recurrente' : 'Nuevo ingreso recurrente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              size="small"
              required
              fullWidth
            />
            <TextField
              select
              label="Tipo de ingreso"
              value={form.income_type ?? 'sueldo'}
              onChange={(e) => setForm({ ...form, income_type: e.target.value })}
              size="small"
              fullWidth
            >
              {INCOME_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Monto mensual"
              type="number"
              value={form.amount ?? ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              size="small"
              fullWidth
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              label="Día de cobro (1–31)"
              type="number"
              value={form.day_of_month ?? ''}
              onChange={(e) => setForm({ ...form, day_of_month: e.target.value ? Number(e.target.value) : undefined })}
              size="small"
              fullWidth
              inputProps={{ min: 1, max: 31 }}
            />
            <CategoryAutocomplete
              categories={categories}
              label="Categoría (opcional)"
              value={form.category_id ?? null}
              onChange={(id) => setForm({ ...form, category_id: id ?? undefined })}
            />
            <TextField
              select
              label="Cuenta destino (opcional)"
              value={form.account_id ?? ''}
              onChange={(e) => setForm({ ...form, account_id: e.target.value ? Number(e.target.value) : undefined })}
              size="small"
              fullWidth
            >
              <MenuItem value="">Sin cuenta específica</MenuItem>
              {accounts.map((a: { id: number; name: string }) => (
                <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
              }
              label="Activo"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending}
          >
            {editing ? 'Guardar cambios' : 'Crear ingreso'}
          </Button>
        </DialogActions>
        {(createMut.isError || updateMut.isError) && (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }}>Error al guardar ingreso.</Alert>
        )}
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar ingreso recurrente"
        message={`¿Eliminar "${deleteTarget?.name}"? Esta acción no puede deshacerse.`}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}

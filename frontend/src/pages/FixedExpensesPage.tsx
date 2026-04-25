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
  Checkbox,
  FormControlLabel,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { getFixedExpenses, createFixedExpense, updateFixedExpense, deleteFixedExpense } from '../api/fixedExpenses';
import { getCategories } from '../api/categories';
import type { FixedExpense } from '../types';
import { formatCurrency, EXPENSE_TYPES } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmDialog from '../components/common/ConfirmDialog';

const EMPTY_FORM: Partial<FixedExpense> = {
  name: '',
  expected_amount: 0,
  payment_day: 1,
  expense_type: 'otro',
  is_active: true,
};

const FIXED_EXPENSE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  categoryName?: string;
  payload: Partial<FixedExpense>;
}> = [
  {
    id: 'arriendo',
    label: 'Arriendo o Dividendo',
    description: 'Pago principal mensual de vivienda',
    categoryName: 'Vivienda',
    payload: { name: 'Arriendo/Dividendo', expected_amount: 450000, payment_day: 5, expense_type: 'dividendo', is_active: true },
  },
  {
    id: 'internet',
    label: 'Internet Hogar',
    description: 'Servicio mensual de internet',
    categoryName: 'Servicios',
    payload: { name: 'Internet Hogar', expected_amount: 21990, payment_day: 10, expense_type: 'servicio', is_active: true },
  },
  {
    id: 'celular',
    label: 'Plan Celular',
    description: 'Plan de telefonia movil',
    categoryName: 'Servicios',
    payload: { name: 'Plan Celular', expected_amount: 15990, payment_day: 12, expense_type: 'servicio', is_active: true },
  },
  {
    id: 'streaming',
    label: 'Streaming',
    description: 'Suscripciones de video y musica',
    categoryName: 'Suscripciones',
    payload: { name: 'Streaming (Netflix/Spotify)', expected_amount: 14000, payment_day: 3, expense_type: 'suscripcion', is_active: true },
  },
  {
    id: 'seguro_salud',
    label: 'Seguro o Isapre',
    description: 'Pago recurrente de salud',
    categoryName: 'Salud',
    payload: { name: 'Seguro/Isapre', expected_amount: 55000, payment_day: 24, expense_type: 'seguro', is_active: true },
  },
];

export default function FixedExpensesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FixedExpense>>(EMPTY_FORM);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(FIXED_EXPENSE_TEMPLATES.map((t) => t.id));
  const [templatesSummary, setTemplatesSummary] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({ queryKey: ['fixed-expenses'], queryFn: getFixedExpenses });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  const createMut = useMutation({ mutationFn: createFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<FixedExpense> }) => updateFixedExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: deleteFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); setDeleteId(null); } });
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

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (x: FixedExpense) => { setEditing(x); setForm(x); setDialogOpen(true); };
  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Gastos Fijos"
        subtitle="Suscripciones, servicios y pagos recurrentes"
        action={{ label: 'Nuevo Gasto Fijo', onClick: openCreate }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddIcon />}
          onClick={() => setTemplatesOpen(true)}
        >
          Agregar pre cargados
        </Button>
        {templatesSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{templatesSummary}</Alert>}
        {templatesMut.isError && <Alert severity="error">No se pudieron crear los gastos fijos pre cargados.</Alert>}
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Día</TableCell>
                <TableCell>Inicio</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={EXPENSE_TYPES.find((t) => t.value === item.expense_type)?.label ?? item.expense_type}
                    />
                  </TableCell>
                  <TableCell>{item.payment_day ?? '—'}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell align="right">{formatCurrency(item.expected_amount)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteId(item.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">Sin gastos fijos</TableCell></TableRow>
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
            <TextField label="Monto" type="number" value={form.expected_amount ?? 0} onChange={(e) => setForm((f) => ({ ...f, expected_amount: parseFloat(e.target.value) || 0 }))} fullWidth />
            <TextField label="Día del mes" type="number" inputProps={{ min: 1, max: 31 }} value={form.payment_day ?? 1} onChange={(e) => setForm((f) => ({ ...f, payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))} fullWidth />
            <TextField select label="Tipo" value={form.expense_type ?? 'fixed'} onChange={(e) => setForm((f) => ({ ...f, expense_type: e.target.value as FixedExpense['expense_type'] }))} fullWidth>
              {EXPENSE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <TextField select label="Categoría" value={form.category_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))} fullWidth>
              <MenuItem value="">Sin categoría</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
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

      {(createMut.isError || updateMut.isError || deleteMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar cambios.</Alert>
      )}
    </Box>
  );
}

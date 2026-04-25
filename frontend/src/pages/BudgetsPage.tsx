import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Alert,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import SavingsIcon from '@mui/icons-material/Savings';
import { getBudgets, createBudget, updateBudget, deleteBudget, getBudgetRecommendations, applyBudgetRecommendations } from '../api/budgets';
import { getCategories } from '../api/categories';
import type { Budget } from '../types';
import { formatCurrency, MONTH_NAMES } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmDialog from '../components/common/ConfirmDialog';

const now = new Date();
const EMPTY_FORM: Partial<Budget> = {
  category_id: undefined,
  month: now.getMonth() + 1,
  year: now.getFullYear(),
  expected_amount: 0,
};

export default function BudgetsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Budget>>(EMPTY_FORM);

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets', month, year],
    queryFn: () => getBudgets(month, year),
  });
  const { data: recommendation } = useQuery({
    queryKey: ['budget-recommendations', month, year],
    queryFn: () => getBudgetRecommendations(month, year),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  const createMut = useMutation({ mutationFn: createBudget, onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<Budget> }) => updateBudget(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: deleteBudget, onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setDeleteId(null); } });
  const applyRecommendationsMut = useMutation({
    mutationFn: () => applyBudgetRecommendations(month, year),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget-recommendations'] });
    },
  });

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, month, year }); setDialogOpen(true); };
  const openEdit = (x: Budget) => { setEditing(x); setForm(x); setDialogOpen(true); };
  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const totalBudget = budgets.reduce((s, b) => s + b.expected_amount, 0);
  const totalActual = budgets.reduce((s, b) => s + Math.abs(b.actual_amount || 0), 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Presupuestos"
        subtitle={`Presupuestado ${formatCurrency(totalBudget)} - Gastado ${formatCurrency(totalActual)}`}
        action={{ label: 'Nuevo Presupuesto', onClick: openCreate }}
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField select size="small" label="Mes" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <MenuItem key={i} value={i + 1}>{m}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Año" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
      </Box>

      {recommendation && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} mb={2}>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  Estrategia sugerida: {recommendation.strategy_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ingreso promedio mensual: {formatCurrency(recommendation.avg_monthly_income)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Necesidades {formatCurrency(recommendation.needs_target)} · Gustos {formatCurrency(recommendation.wants_target)} · Ahorro {formatCurrency(recommendation.savings_target)}
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Chip icon={<AutoGraphIcon />} label={`Necesidades recientes: ${recommendation.recent_needs_ratio.toFixed(1)}% del ingreso`} />
                <Chip icon={<SavingsIcon />} color="success" label={`Ahorro sugerido: ${formatCurrency(recommendation.recommended_monthly_saving)}`} />
                <Button variant="contained" onClick={() => applyRecommendationsMut.mutate()} disabled={applyRecommendationsMut.isPending || recommendation.items.length === 0}>
                  {applyRecommendationsMut.isPending ? 'Aplicando...' : 'Aplicar sugeridos'}
                </Button>
              </Stack>
            </Stack>

            <Stack spacing={1} sx={{ mb: 2 }}>
              {recommendation.insights.map((insight) => (
                <Alert key={insight} severity="info">{insight}</Alert>
              ))}
              {applyRecommendationsMut.isSuccess && (
                <Alert severity="success">
                  Presupuestos sugeridos aplicados: {applyRecommendationsMut.data.created} creados, {applyRecommendationsMut.data.updated} actualizados, {applyRecommendationsMut.data.skipped} sin cambios.
                </Alert>
              )}
            </Stack>

            <Grid container spacing={2}>
              {recommendation.items.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.category_id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                        <Typography variant="subtitle1" fontWeight={700}>{item.category_name}</Typography>
                        <Chip size="small" label={item.bucket === 'needs' ? 'Necesidad' : 'Deseo'} color={item.bucket === 'needs' ? 'primary' : 'secondary'} />
                      </Stack>
                      <Typography variant="h6" color="primary.main" fontWeight={700}>
                        {formatCurrency(item.recommended_amount)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Gasto promedio reciente: {formatCurrency(item.recent_avg_spent)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Presupuesto actual: {formatCurrency(item.current_budget_amount)}
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary">
                        {item.rationale}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {budgets.map((budget) => {
          const actual = Math.abs(budget.actual_amount || 0);
          const pct = budget.expected_amount > 0 ? (actual / budget.expected_amount) * 100 : 0;
          const status = budget.status === 'near_limit' ? 'near' : budget.status;
          return (
            <Grid item xs={12} sm={6} md={4} key={budget.id}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6" fontWeight={700}>{budget.category_name || 'Sin categoría'}</Typography>
                    <Box>
                      <IconButton size="small" onClick={() => openEdit(budget)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(budget.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary">Presupuesto: {formatCurrency(budget.expected_amount)}</Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Gastado: {formatCurrency(actual)}</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, pct)}
                    color={status === 'exceeded' ? 'error' : status === 'near' ? 'warning' : 'success'}
                    sx={{ height: 8, borderRadius: 8, mb: 1 }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">{pct.toFixed(1)}%</Typography>
                    <Chip
                      size="small"
                      label={status === 'exceeded' ? 'Excedido' : status === 'near' ? 'Cerca del límite' : 'OK'}
                      color={status === 'exceeded' ? 'error' : status === 'near' ? 'warning' : 'success'}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField select label="Categoría" value={form.category_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, category_id: Number(e.target.value) }))} fullWidth>
              <MenuItem value="">Seleccione categoría</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField label="Monto" type="number" value={form.expected_amount ?? 0} onChange={(e) => setForm((f) => ({ ...f, expected_amount: parseFloat(e.target.value) || 0 }))} fullWidth />
            <TextField label="Mes" type="number" value={form.month ?? month} onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))} fullWidth />
            <TextField label="Año" type="number" value={form.year ?? year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.category_id || createMut.isPending || updateMut.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar Presupuesto"
        message="¿Seguro que quieres eliminar este presupuesto?"
        confirmLabel="Eliminar"
        onConfirm={() => deleteId !== null && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      {(createMut.isError || updateMut.isError || deleteMut.isError || applyRecommendationsMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar cambios.</Alert>
      )}
    </Box>
  );
}

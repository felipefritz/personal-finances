import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Stack,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import { getSavingsGoals, createSavingsGoal, updateSavingsGoal, deleteSavingsGoal, getSavingsGoalPlan } from '../../api/savingsGoals';
import type { SavingsGoal } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import LoadingSpinner from '../common/LoadingSpinner';
import ConfirmDialog from '../common/ConfirmDialog';

const EMPTY_FORM: Partial<SavingsGoal> = {
  name: '',
  target_amount: 0,
  current_amount: 0,
  status: 'active',
  priority: 2,
};

const SAVINGS_GOAL_TEMPLATES: Array<{ id: string; label: string; description: string; payload: Partial<SavingsGoal> }> = [
  {
    id: 'emergencia',
    label: 'Fondo de emergencia',
    description: 'Meta recomendada de 3 a 6 meses de gastos fijos',
    payload: {
      name: 'Fondo de emergencia',
      target_amount: 3000000,
      current_amount: 0,
      priority: 1,
      status: 'active',
      description: 'Respaldo para imprevistos',
    },
  },
  {
    id: 'vacaciones',
    label: 'Vacaciones',
    description: 'Ahorro para viaje anual',
    payload: {
      name: 'Vacaciones',
      target_amount: 1200000,
      current_amount: 0,
      priority: 2,
      status: 'active',
      description: 'Viaje anual con presupuesto definido',
    },
  },
  {
    id: 'deuda',
    label: 'Prepago de deuda',
    description: 'Abonos extraordinarios para reducir intereses',
    payload: {
      name: 'Prepago de deuda',
      target_amount: 1500000,
      current_amount: 0,
      priority: 1,
      status: 'active',
      description: 'Reducir deuda de consumo o tarjeta',
    },
  },
  {
    id: 'auto',
    label: 'Pie auto o vivienda',
    description: 'Meta de mediano plazo para compra grande',
    payload: {
      name: 'Pie auto o vivienda',
      target_amount: 5000000,
      current_amount: 0,
      priority: 3,
      status: 'active',
      description: 'Meta para proximo activo importante',
    },
  },
];

export default function SavingsGoalsTab() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<SavingsGoal>>(EMPTY_FORM);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(SAVINGS_GOAL_TEMPLATES.map((t) => t.id));
  const [templatesSummary, setTemplatesSummary] = useState<string | null>(null);

  const { data: goals = [], isLoading } = useQuery({ queryKey: ['savings-goals'], queryFn: getSavingsGoals });

  const planPayload = useMemo(() => ({
    name: (form.name ?? '').trim(),
    target_amount: Number(form.target_amount ?? 0),
    current_amount: Number(form.current_amount ?? 0),
    target_date: form.target_date || undefined,
    priority: Number(form.priority ?? 2),
    status: (form.status ?? 'active') as string,
  }), [form]);

  const { data: planPreview } = useQuery({
    queryKey: ['savings-goal-plan', planPayload],
    queryFn: () => getSavingsGoalPlan(planPayload),
    enabled: dialogOpen && planPayload.name.length > 0 && planPayload.target_amount > 0,
    staleTime: 10000,
  });

  const createMut = useMutation({ mutationFn: createSavingsGoal, onSuccess: () => { qc.invalidateQueries({ queryKey: ['savings-goals'] }); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<SavingsGoal> }) => updateSavingsGoal(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['savings-goals'] }); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: deleteSavingsGoal, onSuccess: () => { qc.invalidateQueries({ queryKey: ['savings-goals'] }); setDeleteId(null); } });
  const templatesMut = useMutation({
    mutationFn: async (templateIds: string[]) => {
      const existingNames = new Set(goals.map((g) => g.name.trim().toLocaleLowerCase('es-CL')));
      let created = 0;
      let skipped = 0;

      for (const template of SAVINGS_GOAL_TEMPLATES.filter((item) => templateIds.includes(item.id))) {
        const normalizedName = (template.payload.name ?? '').trim().toLocaleLowerCase('es-CL');
        if (!normalizedName || existingNames.has(normalizedName)) {
          skipped += 1;
          continue;
        }

        await createSavingsGoal(template.payload);
        existingNames.add(normalizedName);
        created += 1;
      }

      return { created, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      qc.invalidateQueries({ queryKey: ['savings-goals'] });
      setTemplatesSummary(`Creados ${created} objetivos y omitidos ${skipped} por ya existir.`);
      setTemplatesOpen(false);
    },
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (x: SavingsGoal) => { setEditing(x); setForm(x); setDialogOpen(true); };
  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Sigue tu progreso hacia tus metas financieras</Typography>
        <Button variant="contained" onClick={openCreate}>Nuevo Objetivo</Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddIcon />}
          onClick={() => setTemplatesOpen(true)}
        >
          Agregar objetivos pre cargados
        </Button>
        {templatesSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{templatesSummary}</Alert>}
        {templatesMut.isError && <Alert severity="error">No se pudieron crear los objetivos pre cargados.</Alert>}
      </Stack>

      <Grid container spacing={2}>
        {goals.map((goal) => {
          const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
          return (
            <Grid item xs={12} sm={6} md={4} key={goal.id}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="h6" fontWeight={700}>{goal.name}</Typography>
                    <Box>
                      <IconButton size="small" onClick={() => openEdit(goal)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(goal.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Meta: {formatCurrency(goal.target_amount)}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="primary.main" gutterBottom>
                    {formatCurrency(goal.current_amount)}
                  </Typography>
                  <LinearProgress variant="determinate" value={Math.min(100, pct)} sx={{ height: 8, borderRadius: 8, mb: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {(goal.progress_percent ?? pct).toFixed(1)}% completado
                  </Typography>
                  <Box mt={1} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label={goal.status === 'completed' ? 'Completado' : 'En progreso'} color={goal.status === 'completed' ? 'success' : 'primary'} />
                    {goal.feasibility_status && (
                      <Chip
                        size="small"
                        label={
                          goal.feasibility_status === 'on_track'
                            ? 'Factible'
                            : goal.feasibility_status === 'tight'
                              ? 'Ajustado'
                              : goal.feasibility_status === 'unfunded'
                                ? 'Sin capacidad'
                                : goal.feasibility_status === 'completed'
                                  ? 'Cumplido'
                                  : 'Plan sugerido'
                        }
                        color={
                          goal.feasibility_status === 'on_track' || goal.feasibility_status === 'completed'
                            ? 'success'
                            : goal.feasibility_status === 'tight' || goal.feasibility_status === 'planned'
                              ? 'warning'
                              : 'error'
                        }
                        variant="outlined"
                      />
                    )}
                  </Box>
                  {goal.target_date && (
                    <Typography variant="caption" display="block" color="text.secondary" mt={1}>
                      Fecha objetivo: {formatDate(goal.target_date)}
                    </Typography>
                  )}
                  {(goal.suggested_monthly_contribution ?? 0) > 0 && (
                    <Typography variant="body2" color="text.secondary" mt={1}>
                      Ahorro sugerido: {formatCurrency(goal.suggested_monthly_contribution ?? 0)} / mes
                    </Typography>
                  )}
                  {(goal.estimated_months_to_target ?? 0) > 0 && (
                    <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                      Llegarias en {goal.estimated_months_to_target} meses
                      {goal.estimated_target_date ? ` (aprox. ${formatDate(goal.estimated_target_date)})` : ''}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Objetivo' : 'Nuevo Objetivo'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Nombre" value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
            <TextField label="Monto objetivo" type="number" value={form.target_amount ?? 0} onChange={(e) => setForm((f) => ({ ...f, target_amount: parseFloat(e.target.value) || 0 }))} fullWidth />
            <TextField label="Monto actual" type="number" value={form.current_amount ?? 0} onChange={(e) => setForm((f) => ({ ...f, current_amount: parseFloat(e.target.value) || 0 }))} fullWidth />
            <TextField label="Fecha objetivo" type="date" InputLabelProps={{ shrink: true }} value={form.target_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value || undefined }))} fullWidth />
            {planPreview && (
              <Alert severity={planPreview.feasibility_status === 'on_track' || planPreview.feasibility_status === 'completed' ? 'success' : planPreview.feasibility_status === 'tight' || planPreview.feasibility_status === 'planned' ? 'warning' : 'error'}>
                <Typography variant="body2" fontWeight={600}>
                  Sugerencia automatica: {formatCurrency(planPreview.suggested_monthly_contribution)} al mes
                </Typography>
                <Typography variant="caption" display="block">
                  {planPreview.message}
                </Typography>
                <Typography variant="caption" display="block">
                  Capacidad estimada: {formatCurrency(planPreview.available_monthly_savings)} / mes. Compromisos actuales: {formatCurrency(planPreview.other_goals_monthly_commitment)} / mes.
                </Typography>
                <Typography variant="caption" display="block">
                  Saldo liquido considerado en cuentas: {formatCurrency(planPreview.available_liquid_balance)}.
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Selecciona objetivos pre cargados</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', pt: 1 }}>
            {SAVINGS_GOAL_TEMPLATES.map((template) => {
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
        title="Eliminar Objetivo"
        message="¿Seguro que quieres eliminar este objetivo de ahorro?"
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

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Chip,
  Alert,
  Collapse,
  Tooltip,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import {
  getCategoriesTree,
  createCategory,
  updateCategory,
  deleteCategory,
  createDefaultCategories,
} from '../api/categories';
import type { Category } from '../types';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmDialog from '../components/common/ConfirmDialog';

const COLORS = ['#1976d2', '#9c27b0', '#2e7d32', '#ed6c02', '#d32f2f', '#0288d1', '#7b1fa2', '#00695c'];
const DEFAULT_COLOR = COLORS[0];

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [defaultsSummary, setDefaultsSummary] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', color: '#1976d2', icon: '' });

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: getCategoriesTree,
  });

  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories-tree'] }); qc.invalidateQueries({ queryKey: ['categories'] }); setDialogOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Category> }) => updateCategory(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories-tree'] }); qc.invalidateQueries({ queryKey: ['categories'] }); setDialogOpen(false); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories-tree'] }); qc.invalidateQueries({ queryKey: ['categories'] }); setDeleteId(null); },
  });
  const defaultsMut = useMutation({
    mutationFn: createDefaultCategories,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['categories-tree'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      setDefaultsSummary(
        `Creadas ${result.created_categories} categorias y ${result.created_subcategories} subcategorias. ` +
          `Omitidas ${result.skipped_categories} categorias y ${result.skipped_subcategories} subcategorias.`
      );
    },
  });

  const openCreate = (pid: number | null = null) => {
    setEditing(null);
    setParentId(pid);
    setForm({ name: '', color: DEFAULT_COLOR, icon: '' });
    setDialogOpen(true);
  };
  const openEdit = (cat: Category) => {
    setEditing(cat);
    setParentId(cat.parent_id ?? null);
    setForm({ name: cat.name, color: cat.color ?? DEFAULT_COLOR, icon: cat.icon ?? '' });
    setDialogOpen(true);
  };
  const handleSave = () => {
    const payload = { ...form, parent_id: parentId ?? undefined };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Categorías"
        subtitle={`${tree.length} categorías principales`}
        action={{ label: 'Nueva Categoría', onClick: () => openCreate(null) }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<AutoFixHighIcon />}
          onClick={() => defaultsMut.mutate()}
          disabled={defaultsMut.isPending}
        >
          Cargar categorias predefinidas
        </Button>
        {defaultsSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{defaultsSummary}</Alert>}
        {defaultsMut.isError && <Alert severity="error">No se pudieron cargar las categorias predefinidas.</Alert>}
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <List disablePadding>
          {tree.map((cat, i) => (
            <Box key={cat.id}>
              {i > 0 && <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}
              <ListItem
                sx={{ bgcolor: 'grey.50' }}
                secondaryAction={
                  <Box>
                    <Tooltip title="Agregar subcategoría">
                      <IconButton size="small" onClick={() => openCreate(cat.id)}>
                        +
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={() => openEdit(cat)}><EditIcon fontSize="small" /></IconButton>
                    {!cat.is_system && (
                      <IconButton size="small" color="error" onClick={() => setDeleteId(cat.id)}><DeleteIcon fontSize="small" /></IconButton>
                    )}
                    {cat.children && cat.children.length > 0 && (
                      <IconButton
                        size="small"
                        onClick={() => setExpanded((s) => {
                          const next = new Set(s);
                          next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                          return next;
                        })}
                      >
                        {expanded.has(cat.id) ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    )}
                  </Box>
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: cat.color ?? '#aaa',
                    }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" fontWeight={600}>{cat.name}</Typography>
                      {cat.is_system && <Chip label="Sistema" size="small" />}
                      {cat.children && cat.children.length > 0 && (
                        <Chip label={`${cat.children.length} subcategorías`} size="small" color="primary" variant="outlined" />
                      )}
                    </Box>
                  }
                />
              </ListItem>

              {/* Subcategories */}
              {cat.children && cat.children.length > 0 && (
                <Collapse in={expanded.has(cat.id)}>
                  {cat.children.map((sub) => (
                    <ListItem
                      key={sub.id}
                      sx={{ pl: 6 }}
                      secondaryAction={
                        <Box>
                          <IconButton size="small" onClick={() => openEdit(sub)}><EditIcon fontSize="small" /></IconButton>
                          {!sub.is_system && (
                            <IconButton size="small" color="error" onClick={() => setDeleteId(sub.id)}><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: sub.color ?? cat.color ?? '#aaa' }} />
                      </ListItemIcon>
                      <ListItemText primary={sub.name} />
                    </ListItem>
                  ))}
                </Collapse>
              )}
            </Box>
          ))}
          {tree.length === 0 && (
            <ListItem>
              <ListItemText
                primary={<Typography color="text.secondary" textAlign="center">Sin categorías</Typography>}
              />
            </ListItem>
          )}
        </List>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Editar Categoría' : parentId ? 'Nueva Subcategoría' : 'Nueva Categoría'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Nombre" size="small" fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>Color de categoría</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.75, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    bgcolor: form.color || DEFAULT_COLOR,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <TextField
                  type="color"
                  size="small"
                  value={form.color || DEFAULT_COLOR}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  sx={{ width: 74 }}
                  inputProps={{ 'aria-label': 'Color de categoría' }}
                />
                <Typography variant="body2" color="text.secondary">{form.color || DEFAULT_COLOR}</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                {COLORS.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      bgcolor: c,
                      cursor: 'pointer',
                      border: form.color === c ? '3px solid #000' : '2px solid transparent',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
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

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar Categoría"
        message="¿Eliminar esta categoría? Los movimientos asociados quedarán sin categoría."
        confirmLabel="Eliminar"
        onConfirm={() => deleteId !== null && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
      {deleteMut.isError && <Alert severity="error" sx={{ mt: 2 }}>Error al eliminar.</Alert>}
    </Box>
  );
}

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
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../api/accounts';
import type { Account } from '../types';
import { formatCurrency, ACCOUNT_TYPES } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';

const BANKS = ['BancoEstado', 'Banco Santander', 'BCI', 'Banco de Chile', 'Scotiabank', 'Itaú', 'BICE', 'Otro'];

const EMPTY_FORM: Partial<Account> = {
  name: '',
  bank: '',
  account_type: 'corriente',
  balance: 0,
  currency: 'CLP',
  is_active: true,
  source: 'manual',
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
    label: 'Tarjeta de Credito Principal',
    description: 'Seguimiento de gastos en tarjeta',
    payload: {
      name: 'Tarjeta de Credito Principal',
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
        label="Saldo inicial"
        type="number"
        value={value.balance ?? 0}
        onChange={(e) => set('balance', parseFloat(e.target.value) || 0)}
        fullWidth
      />
      <TextField
        select label="Moneda" value={value.currency ?? 'CLP'} onChange={(e) => set('currency', e.target.value)} fullWidth
      >
        {['CLP', 'USD', 'EUR', 'UF'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
    </Box>
  );
}

export default function AccountsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Partial<Account>>(EMPTY_FORM);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(ACCOUNT_TEMPLATES.map((t) => t.id));
  const [templatesSummary, setTemplatesSummary] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
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

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Cuentas"
        subtitle={`Balance total: ${formatCurrency(totalBalance)}`}
        action={{ label: 'Nueva Cuenta', onClick: openCreate }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddIcon />}
          onClick={() => setTemplatesOpen(true)}
        >
          Agregar cuentas pre cargadas
        </Button>
        {templatesSummary && <Alert severity="success" sx={{ flexGrow: 1 }}>{templatesSummary}</Alert>}
        {templatesMut.isError && <Alert severity="error">No se pudieron crear las cuentas pre cargadas.</Alert>}
      </Stack>

      {accounts.length === 0 ? (
        <EmptyState
          message="Sin cuentas registradas"
          description="Agrega tu primera cuenta bancaria para comenzar a registrar movimientos."
          Icon={AccountBalanceIcon}
        />
      ) : (
        <Grid container spacing={2}>
          {accounts.map((acc) => (
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
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color="primary.main">
                    {formatCurrency(acc.balance)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {acc.currency}
                  </Typography>
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
        <DialogTitle>{editing ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle>
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
        <DialogTitle>Selecciona cuentas pre cargadas</DialogTitle>
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

      {(createMut.isError || updateMut.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>Error al guardar la cuenta.</Alert>
      )}
    </Box>
  );
}

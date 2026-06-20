import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  TextField,
  Button,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  getBankConnections,
  getBankProviders,
  createBankConnection,
  deleteBankConnection,
  getConnectionAccounts,
  linkConnectionAccount,
  syncBankConnection,
  updateBankCredentials,
} from '../api/bankConnections';
import { getAccounts } from '../api/accounts';
import type { Account, BankConnection, BankSyncResponse, ScrapedProviderAccount } from '../types';
import { formatDate } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

const STATUS_LABELS: Record<string, string> = {
  connected: 'Conectada',
  action_required: 'Requiere acción',
  error: 'Error',
  disconnected: 'Desconectada',
};

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  connected: 'success',
  action_required: 'warning',
  error: 'error',
  disconnected: 'default',
};

const CHECKING_TYPES = ['corriente', 'vista'];

export default function BankConnectionsPage() {
  const qc = useQueryClient();

  // Formulario de nueva conexión
  const [provider, setProvider] = useState('');
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<BankSyncResponse | null>(null);

  // Cuentas descubiertas por conexión
  const [accountsByConnection, setAccountsByConnection] = useState<Record<number, ScrapedProviderAccount[]>>({});
  const [selectedByConnection, setSelectedByConnection] = useState<Record<number, string[]>>({});
  const [loadingAccounts, setLoadingAccounts] = useState<Record<number, boolean>>({});

  // Edición de credenciales
  const [editingConnection, setEditingConnection] = useState<BankConnection | null>(null);
  const [editRut, setEditRut] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const { data: providers = [] } = useQuery({
    queryKey: ['bank-providers'],
    queryFn: getBankProviders,
  });

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['bank-connections'],
    queryFn: getBankConnections,
  });

  const { data: systemAccounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const connectMut = useMutation({
    mutationFn: createBankConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setRut('');
      setPassword('');
      setDisplayName('');
    },
  });

  const syncMut = useMutation({
    mutationFn: ({
      connectionId,
      providerAccountIds,
    }: {
      connectionId: number;
      providerAccountIds?: string[];
    }) => syncBankConnection(connectionId, undefined, providerAccountIds),
    onSuccess: (result) => {
      setLastSyncResult(result);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteBankConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      setDeleteId(null);
    },
  });

  const linkMut = useMutation({
    mutationFn: ({
      connectionId,
      providerAccountId,
      localAccountId,
      enabled,
    }: {
      connectionId: number;
      providerAccountId: string;
      localAccountId?: number;
      enabled: boolean;
    }) => linkConnectionAccount(connectionId, providerAccountId, localAccountId, enabled),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      void loadAccounts(variables.connectionId);
    },
  });

  const updateCredentialsMut = useMutation({
    mutationFn: ({ connectionId, rut, password }: { connectionId: number; rut?: string; password?: string }) =>
      updateBankCredentials(connectionId, { rut, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      closeEditCredentials();
    },
  });

  const onConnect = () => {
    if (!provider || !rut.trim() || !password.trim() || connectMut.isPending) return;
    connectMut.mutate({
      provider,
      rut: rut.trim(),
      password: password.trim(),
      display_name: displayName.trim() || undefined,
    });
  };

  const loadAccounts = async (connectionId: number) => {
    setLoadingAccounts((prev) => ({ ...prev, [connectionId]: true }));
    try {
      const accounts = await getConnectionAccounts(connectionId);
      setAccountsByConnection((prev) => ({ ...prev, [connectionId]: accounts }));
      const enabledIds = accounts.filter((a) => a.sync_enabled).map((a) => a.external_id);
      const checkingIds = accounts
        .filter((a) => CHECKING_TYPES.includes(String(a.account_type ?? '').toLowerCase()))
        .map((a) => a.external_id);
      const defaultSelection = enabledIds.length > 0
        ? enabledIds
        : (checkingIds.length > 0 ? checkingIds : accounts.map((a) => a.external_id));
      setSelectedByConnection((prev) => ({
        ...prev,
        [connectionId]: prev[connectionId]?.length ? prev[connectionId] : defaultSelection,
      }));
    } finally {
      setLoadingAccounts((prev) => ({ ...prev, [connectionId]: false }));
    }
  };

  const toggleAccountSelection = (connectionId: number, account: ScrapedProviderAccount, checked: boolean) => {
    setSelectedByConnection((prev) => {
      const current = prev[connectionId] ?? [];
      const next = checked
        ? Array.from(new Set([...current, account.external_id]))
        : current.filter((id) => id !== account.external_id);
      return { ...prev, [connectionId]: next };
    });
    linkMut.mutate({
      connectionId,
      providerAccountId: account.external_id,
      localAccountId: account.local_account_id,
      enabled: checked,
    });
  };

  const updateLinkedLocalAccount = (
    connectionId: number,
    account: ScrapedProviderAccount,
    localAccountId: number | ''
  ) => {
    const enabled = (selectedByConnection[connectionId] ?? []).includes(account.external_id);
    linkMut.mutate({
      connectionId,
      providerAccountId: account.external_id,
      localAccountId: localAccountId === '' ? undefined : Number(localAccountId),
      enabled,
    });
  };

  const openEditCredentials = (conn: BankConnection) => {
    setEditingConnection(conn);
    setEditRut('');
    setEditPassword('');
    setShowEditPassword(false);
  };

  const closeEditCredentials = () => {
    setEditingConnection(null);
    setEditRut('');
    setEditPassword('');
    setShowEditPassword(false);
  };

  const saveEditedCredentials = () => {
    if (!editingConnection) return;
    const rutValue = editRut.trim() || undefined;
    const passwordValue = editPassword.trim() || undefined;
    if (!rutValue && !passwordValue) return;
    updateCredentialsMut.mutate({
      connectionId: editingConnection.id,
      rut: rutValue,
      password: passwordValue,
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Conexiones Bancarias"
        subtitle="Conecta tus bancos con tu RUT y clave. Los movimientos y saldos se sincronizan automáticamente."
      />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Conectar un banco
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                select
                fullWidth
                size="small"
                label="Banco"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                size="small"
                label="RUT"
                placeholder="12.345.678-9"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                size="small"
                label="Clave de banco en línea"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" size="small">
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                size="small"
                label="Nombre (opcional)"
                placeholder="Ej: BCI sueldo"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Stack>
            <Box>
              <Button
                variant="contained"
                startIcon={connectMut.isPending ? <CircularProgress size={16} color="inherit" /> : <LinkIcon />}
                onClick={onConnect}
                disabled={connectMut.isPending || !provider || !rut.trim() || !password.trim()}
              >
                {connectMut.isPending ? 'Validando...' : 'Conectar'}
              </Button>
            </Box>
          </Stack>
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Tu clave se guarda cifrada en este equipo y solo se usa para entrar al sitio de tu banco. Si el banco
            pide verificación adicional (token/2FA), la conexión quedará marcada como «Requiere acción».
          </Alert>
          {connectMut.isError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              No se pudo crear la conexión. Revisa el RUT y la clave.
            </Alert>
          )}
          {connectMut.isSuccess && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              Conexión creada. Si quedó «Conectada», lista sus cuentas para elegir cuáles sincronizar.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        {connections.map((conn: BankConnection) => {
          const accounts = accountsByConnection[conn.id] ?? [];
          const selectedIds = selectedByConnection[conn.id] ?? [];
          return (
            <Card key={conn.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <Typography variant="subtitle1" fontWeight={700}>{conn.display_name}</Typography>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[conn.status] ?? conn.status}
                        color={STATUS_COLORS[conn.status] ?? 'default'}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {conn.provider_label ?? conn.provider}
                      {conn.rut_masked ? ` · ${conn.rut_masked}` : ''}
                      {' · Última sincronización: '}
                      {conn.last_sync ? formatDate(conn.last_sync) : 'Nunca'}
                    </Typography>
                  </Box>
                  <Box>
                    <IconButton
                      color="primary"
                      onClick={() => syncMut.mutate({ connectionId: conn.id })}
                      disabled={syncMut.isPending}
                      title="Sincronizar ahora"
                    >
                      <SyncIcon />
                    </IconButton>
                    <IconButton
                      color="default"
                      onClick={() => openEditCredentials(conn)}
                      title="Editar credenciales"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => setDeleteId(conn.id)} title="Eliminar">
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>

                {(conn.status === 'error' || conn.status === 'action_required') && conn.last_error && (
                  <Alert severity={conn.status === 'error' ? 'error' : 'warning'} sx={{ mt: 1.5 }}>
                    {conn.last_error}
                  </Alert>
                )}

                <Box sx={{ mt: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => loadAccounts(conn.id)}
                      disabled={Boolean(loadingAccounts[conn.id])}
                    >
                      {loadingAccounts[conn.id] ? 'Cargando cuentas...' : 'Listar cuentas'}
                    </Button>
                    {accounts.length > 0 && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => syncMut.mutate({ connectionId: conn.id, providerAccountIds: selectedIds })}
                        disabled={syncMut.isPending || selectedIds.length === 0}
                      >
                        Sincronizar seleccionadas
                      </Button>
                    )}
                  </Stack>

                  {loadingAccounts[conn.id] && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">Obteniendo cuentas del banco...</Typography>
                    </Box>
                  )}

                  {accounts.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      {accounts.map((account) => {
                        const checked = selectedIds.includes(account.external_id);
                        return (
                          <Box
                            key={account.external_id}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', md: 'auto 1fr 1fr' },
                              gap: 1,
                              alignItems: 'center',
                              py: 1,
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={checked}
                                  onChange={(e) => toggleAccountSelection(conn.id, account, e.target.checked)}
                                />
                              }
                              label={account.name}
                            />
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {account.account_type ?? 'cuenta'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {account.account_type === 'tarjeta_credito' ? 'Monto informado' : 'Saldo informado'}: {account.balance?.toLocaleString('es-CL') ?? '—'} {account.currency ?? 'CLP'}
                              </Typography>
                            </Box>
                            <TextField
                              select
                              size="small"
                              label="Cuenta del sistema"
                              value={account.local_account_id ?? ''}
                              onChange={(e) =>
                                updateLinkedLocalAccount(conn.id, account, e.target.value === '' ? '' : Number(e.target.value))
                              }
                              disabled={linkMut.isPending}
                            >
                              <MenuItem value="">Crear/autovincular</MenuItem>
                              {systemAccounts.map((systemAccount: Account) => (
                                <MenuItem key={systemAccount.id} value={systemAccount.id}>
                                  {systemAccount.name} · {systemAccount.account_type}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })}
        {connections.length === 0 && (
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography color="text.secondary">No hay conexiones bancarias registradas.</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>

      {syncMut.isSuccess && lastSyncResult && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Se revisaron {lastSyncResult.synced_count} movimientos y se guardaron {lastSyncResult.saved_count} nuevos.
          {lastSyncResult.accounts.length > 0 && (
            <Box sx={{ mt: 1 }}>
              {lastSyncResult.accounts.map((account) => (
                <Typography key={account.provider_account_id} variant="body2">
                  {account.provider_account_name}: {account.saved_count} guardados, {account.skipped_count} omitidos.
                </Typography>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar conexión</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            ¿Seguro que quieres eliminar esta conexión bancaria? Las transacciones ya importadas se conservan.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
            disabled={deleteMut.isPending}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editingConnection !== null} onClose={closeEditCredentials} maxWidth="sm" fullWidth>
        <DialogTitle>Editar credenciales</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Alert severity="info">
              Deja un campo vacío para mantener el valor guardado. Al guardar se reintenta el login.
            </Alert>
            <TextField
              fullWidth
              size="small"
              label="RUT"
              placeholder={editingConnection?.rut_masked || '12.345.678-9'}
              value={editRut}
              onChange={(e) => setEditRut(e.target.value)}
            />
            <TextField
              fullWidth
              size="small"
              label="Clave de banco en línea"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              type={showEditPassword ? 'text' : 'password'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowEditPassword((v) => !v)} edge="end" size="small">
                      {showEditPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditCredentials}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={saveEditedCredentials}
            disabled={updateCredentialsMut.isPending || (!editRut.trim() && !editPassword.trim())}
          >
            {updateCredentialsMut.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {syncMut.isError && <Alert severity="error" sx={{ mt: 2 }}>Error al sincronizar.</Alert>}
      {deleteMut.isError && <Alert severity="error" sx={{ mt: 2 }}>Error al eliminar conexión.</Alert>}
      {updateCredentialsMut.isError && <Alert severity="error" sx={{ mt: 2 }}>No se pudieron actualizar las credenciales.</Alert>}
    </Box>
  );
}

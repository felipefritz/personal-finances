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
import { getBankConnections, connectFintoc, syncFintocConnection, deleteBankConnection, getFintocAccounts, getFintocCredentials, linkFintocAccount, updateFintocCredentials } from '../api/bankConnections';
import { getAccounts } from '../api/accounts';
import type { Account, BankConnection, FintocConnectResponse, FintocProviderAccount, FintocSyncResponse } from '../types';
import { formatDate } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function BankConnectionsPage() {
  const qc = useQueryClient();
  const [widgetToken, setWidgetToken] = useState('');
  const [fintocSecretKey, setFintocSecretKey] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [lastConnectionResult, setLastConnectionResult] = useState<FintocConnectResponse | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<FintocSyncResponse | null>(null);
  const [providerAccountsByConnection, setProviderAccountsByConnection] = useState<Record<number, FintocProviderAccount[]>>({});
  const [selectedProviderAccountsByConnection, setSelectedProviderAccountsByConnection] = useState<Record<number, string[]>>({});
  const [loadingAccountsByConnection, setLoadingAccountsByConnection] = useState<Record<number, boolean>>({});
  const [editingConnection, setEditingConnection] = useState<BankConnection | null>(null);
  const [editLinkToken, setEditLinkToken] = useState('');
  const [editSecretKey, setEditSecretKey] = useState('');
  const [showEditLinkToken, setShowEditLinkToken] = useState(false);
  const [showEditSecretKey, setShowEditSecretKey] = useState(false);
  const [loadingEditCredentials, setLoadingEditCredentials] = useState(false);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['bank-connections'],
    queryFn: getBankConnections,
  });

  const { data: systemAccounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const connectMut = useMutation({
    mutationFn: ({ token, secretKey }: { token: string; secretKey?: string }) => connectFintoc(token, undefined, secretKey),
    onSuccess: (result) => {
      setLastConnectionResult(result);
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setWidgetToken('');
    },
  });

  const syncMut = useMutation({
    mutationFn: ({
      connectionId,
      providerAccountId,
      providerAccountIds,
    }: {
      connectionId: number;
      providerAccountId?: string;
      providerAccountIds?: string[];
    }) => syncFintocConnection(connectionId, providerAccountId, providerAccountIds),
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
      enabled?: boolean;
    }) => linkFintocAccount(connectionId, providerAccountId, localAccountId, enabled),
    onSuccess: async (_result, variables) => {
      await loadProviderAccounts(variables.connectionId);
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const updateCredentialsMut = useMutation({
    mutationFn: ({ connectionId, linkToken, secretKey }: { connectionId: number; linkToken?: string; secretKey?: string }) =>
      updateFintocCredentials(connectionId, linkToken, secretKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      setEditingConnection(null);
      setEditLinkToken('');
      setEditSecretKey('');
      setShowEditLinkToken(false);
      setShowEditSecretKey(false);
    },
  });

  const onConnect = () => {
    if (!widgetToken.trim() || connectMut.isPending) return;
    connectMut.mutate({ token: widgetToken.trim(), secretKey: fintocSecretKey.trim() || undefined });
  };

  const loadProviderAccounts = async (connectionId: number) => {
    setLoadingAccountsByConnection((prev) => ({ ...prev, [connectionId]: true }));
    try {
      const accounts = await getFintocAccounts(connectionId);
      setProviderAccountsByConnection((prev) => ({ ...prev, [connectionId]: accounts }));

      const explicitlyEnabledIds = accounts.filter((account) => account.sync_enabled).map((account) => account.id);
      const checkingIds = accounts
        .filter((account) => ['checking_account', 'current_account'].includes(String(account.type ?? '').toLowerCase()))
        .map((account) => account.id);
      const defaultSelection = explicitlyEnabledIds.length > 0
        ? explicitlyEnabledIds
        : (checkingIds.length > 0 ? checkingIds : accounts.map((account) => account.id));
      setSelectedProviderAccountsByConnection((prev) => ({
        ...prev,
        [connectionId]: prev[connectionId] && prev[connectionId].length > 0 ? prev[connectionId] : defaultSelection,
      }));
    } finally {
      setLoadingAccountsByConnection((prev) => ({ ...prev, [connectionId]: false }));
    }
  };

  const toggleProviderAccountSelection = (connectionId: number, providerAccountId: string, checked: boolean) => {
    setSelectedProviderAccountsByConnection((prev) => {
      const current = prev[connectionId] ?? [];
      const next = checked
        ? Array.from(new Set([...current, providerAccountId]))
        : current.filter((id) => id !== providerAccountId);
      return { ...prev, [connectionId]: next };
    });

    const accounts = providerAccountsByConnection[connectionId] ?? [];
    const currentAccount = accounts.find((account) => account.id === providerAccountId);
    void linkMut.mutate({
      connectionId,
      providerAccountId,
      localAccountId: currentAccount?.local_account_id,
      enabled: checked,
    });
  };

  const selectOnlyChecking = (connectionId: number) => {
    const accounts = providerAccountsByConnection[connectionId] ?? [];
    const checkingIds = accounts
      .filter((account) => ['checking_account', 'current_account'].includes(String(account.type ?? '').toLowerCase()))
      .map((account) => account.id);
    setSelectedProviderAccountsByConnection((prev) => ({
      ...prev,
      [connectionId]: checkingIds,
    }));
  };

  const selectAllAccounts = (connectionId: number) => {
    const accounts = providerAccountsByConnection[connectionId] ?? [];
    setSelectedProviderAccountsByConnection((prev) => ({
      ...prev,
      [connectionId]: accounts.map((account) => account.id),
    }));
  };

  const updateLinkedLocalAccount = (connectionId: number, providerAccountId: string, localAccountId: number | '') => {
    setProviderAccountsByConnection((prev) => ({
      ...prev,
      [connectionId]: (prev[connectionId] ?? []).map((account) =>
        account.id === providerAccountId
          ? {
              ...account,
              local_account_id: localAccountId === '' ? undefined : Number(localAccountId),
              local_account_name:
                localAccountId === ''
                  ? undefined
                  : systemAccounts.find((item) => item.id === Number(localAccountId))?.name,
            }
          : account
      ),
    }));

    void linkMut.mutate({
      connectionId,
      providerAccountId,
      localAccountId: localAccountId === '' ? undefined : Number(localAccountId),
      enabled: (selectedProviderAccountsByConnection[connectionId] ?? []).includes(providerAccountId),
    });
  };

  const openEditCredentials = async (conn: BankConnection) => {
    setEditingConnection(conn);
    setLoadingEditCredentials(true);
    setEditLinkToken('');
    setEditSecretKey('');
    setShowEditLinkToken(false);
    setShowEditSecretKey(false);
    try {
      const data = await getFintocCredentials(conn.id);
      setEditLinkToken(data.access_token || '');
      setEditSecretKey(data.fintoc_secret_key || '');
    } finally {
      setLoadingEditCredentials(false);
    }
  };

  const saveEditedCredentials = () => {
    if (!editingConnection) return;
    const linkToken = editLinkToken.trim() || undefined;
    const secretKey = editSecretKey.trim() || undefined;
    if (!linkToken && !secretKey) return;
    updateCredentialsMut.mutate({
      connectionId: editingConnection.id,
      linkToken,
      secretKey,
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Conexiones Bancarias"
        subtitle="Sincroniza movimientos desde proveedores como Fintoc"
      />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Conectar con Fintoc
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Widget token"
              placeholder="ingresa token del widget"
              value={widgetToken}
              onChange={(e) => setWidgetToken(e.target.value)}
            />
            <TextField
              fullWidth
              size="small"
              label="Fintoc secret key (opcional)"
              placeholder="sk_live_..."
              value={fintocSecretKey}
              onChange={(e) => setFintocSecretKey(e.target.value)}
              type="password"
            />
            <Button
              variant="contained"
              startIcon={<LinkIcon />}
              onClick={onConnect}
              disabled={connectMut.isPending || !widgetToken.trim()}
            >
              {connectMut.isPending ? 'Conectando...' : 'Conectar'}
            </Button>
          </Stack>
          {connectMut.isError && <Alert severity="error" sx={{ mt: 1.5 }}>No se pudo conectar o validar Fintoc.</Alert>}
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Puedes ingresar la clave secreta de Fintoc aquí para conectar y sincronizar sin editar el archivo .env manualmente.
          </Alert>
          {connectMut.isSuccess && lastConnectionResult && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              Conexion validada correctamente. Cuentas detectadas: {lastConnectionResult.validation?.accounts_count ?? 0}. Movimientos de prueba: {lastConnectionResult.validation?.sample_movements_count ?? 0}.
            </Alert>
          )}
          {syncMut.isSuccess && lastSyncResult && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              Se sincronizaron {lastSyncResult.synced_count} movimientos y se guardaron {lastSyncResult.saved_count} nuevos.
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
          {syncMut.isSuccess && lastSyncResult?.mock_mode && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Estás en modo demo de Fintoc. Estos movimientos son de ejemplo y no corresponden a tu cuenta real.
              Configura FINTOC_SECRET_KEY, vuelve a conectar Fintoc y sincroniza nuevamente.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        {connections.map((conn: BankConnection) => (
          <Card key={conn.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <Typography variant="subtitle1" fontWeight={700}>{conn.display_name}</Typography>
                    <Chip
                      size="small"
                      label={conn.status}
                      color={conn.status === 'connected' ? 'success' : conn.status === 'error' ? 'error' : 'default'}
                    />
                  </Stack>
                    <Typography variant="body2" color="text.secondary">
                    Proveedor: {conn.provider} | Ultima sincronizacion: {conn.last_sync ? formatDate(conn.last_sync) : 'Nunca'}
                  </Typography>
                    {conn.provider === 'fintoc' && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Link token: {conn.has_access_token ? (conn.access_token_masked || 'guardado') : 'no guardado'} | Fintoc key: {conn.has_fintoc_secret_key ? (conn.fintoc_secret_key_masked || 'guardada') : 'no guardada'}
                      </Typography>
                    )}
                </Box>
                <Box>
                  <IconButton
                    color="primary"
                    onClick={() => syncMut.mutate({ connectionId: conn.id })}
                    disabled={syncMut.isPending}
                    title="Sincronizar"
                  >
                    <SyncIcon />
                  </IconButton>
                  {conn.provider === 'fintoc' && (
                    <IconButton
                      color="default"
                      onClick={() => openEditCredentials(conn)}
                      title="Editar credenciales"
                    >
                      <EditIcon />
                    </IconButton>
                  )}
                  <IconButton color="error" onClick={() => setDeleteId(conn.id)} title="Eliminar">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>

              {conn.provider === 'fintoc' && (
                <Box sx={{ mt: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => loadProviderAccounts(conn.id)}
                      disabled={Boolean(loadingAccountsByConnection[conn.id])}
                    >
                      {loadingAccountsByConnection[conn.id] ? 'Cargando cuentas...' : 'Listar cuentas'}
                    </Button>
                    {providerAccountsByConnection[conn.id]?.length ? (
                      <>
                        <Button size="small" onClick={() => selectOnlyChecking(conn.id)}>
                          Solo cuenta corriente
                        </Button>
                        <Button size="small" onClick={() => selectAllAccounts(conn.id)}>
                          Seleccionar todas
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() =>
                            syncMut.mutate({
                              connectionId: conn.id,
                              providerAccountIds: selectedProviderAccountsByConnection[conn.id] ?? [],
                            })
                          }
                          disabled={
                            syncMut.isPending ||
                            (selectedProviderAccountsByConnection[conn.id]?.length ?? 0) === 0
                          }
                        >
                          Sincronizar seleccionadas
                        </Button>
                      </>
                    ) : null}
                  </Stack>

                  {loadingAccountsByConnection[conn.id] && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">Obteniendo cuentas desde Fintoc...</Typography>
                    </Box>
                  )}

                  {(providerAccountsByConnection[conn.id] ?? []).length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      {(providerAccountsByConnection[conn.id] ?? []).map((account) => {
                        const selectedIds = selectedProviderAccountsByConnection[conn.id] ?? [];
                        const checked = selectedIds.includes(account.id);
                        return (
                          <Box
                            key={account.id}
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
                                  onChange={(e) => toggleProviderAccountSelection(conn.id, account.id, e.target.checked)}
                                />
                              }
                              label={account.name}
                            />
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {account.type ?? 'account'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Saldo Fintoc: {account.balance_amount?.toLocaleString('es-CL') ?? '0'} {account.currency ?? 'CLP'}
                              </Typography>
                            </Box>
                            <TextField
                              select
                              size="small"
                              label="Cuenta del sistema"
                              value={account.local_account_id ?? ''}
                              onChange={(e) => updateLinkedLocalAccount(conn.id, account.id, e.target.value === '' ? '' : Number(e.target.value))}
                              disabled={linkMut.isPending}
                            >
                              <MenuItem value="">Sin asociar</MenuItem>
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
              )}
            </CardContent>
          </Card>
        ))}
        {connections.length === 0 && (
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography color="text.secondary">No hay conexiones bancarias registradas.</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>

      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar conexión</DialogTitle>
        <DialogContent>
          <Typography variant="body2">¿Seguro que quieres eliminar esta conexión bancaria?</Typography>
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

      <Dialog open={editingConnection !== null} onClose={() => setEditingConnection(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar conexión Fintoc</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Alert severity="info">
              Puedes dejar un campo vacío para mantener el valor actual guardado.
            </Alert>
            <TextField
              fullWidth
              size="small"
              label="Link token"
              placeholder={editingConnection?.access_token_masked || 'link_token'}
              value={editLinkToken}
              onChange={(e) => setEditLinkToken(e.target.value)}
              type={showEditLinkToken ? 'text' : 'password'}
              disabled={loadingEditCredentials}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowEditLinkToken((v) => !v)} edge="end">
                      {showEditLinkToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              size="small"
              label="Fintoc secret key"
              placeholder={editingConnection?.fintoc_secret_key_masked || 'sk_live_...'}
              value={editSecretKey}
              onChange={(e) => setEditSecretKey(e.target.value)}
              type={showEditSecretKey ? 'text' : 'password'}
              disabled={loadingEditCredentials}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowEditSecretKey((v) => !v)} edge="end">
                      {showEditSecretKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingConnection(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={saveEditedCredentials}
            disabled={loadingEditCredentials || updateCredentialsMut.isPending || (!editLinkToken.trim() && !editSecretKey.trim())}
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

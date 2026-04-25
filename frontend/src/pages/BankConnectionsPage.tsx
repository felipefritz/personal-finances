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
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import { getBankConnections, connectFintoc, syncFintocConnection, deleteBankConnection } from '../api/bankConnections';
import type { BankConnection, FintocConnectResponse } from '../types';
import { formatDate } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function BankConnectionsPage() {
  const qc = useQueryClient();
  const [widgetToken, setWidgetToken] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [lastConnectionResult, setLastConnectionResult] = useState<FintocConnectResponse | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['bank-connections'],
    queryFn: getBankConnections,
  });

  const connectMut = useMutation({
    mutationFn: (token: string) => connectFintoc(token),
    onSuccess: (result) => {
      setLastConnectionResult(result);
      qc.invalidateQueries({ queryKey: ['bank-connections'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setWidgetToken('');
    },
  });

  const syncMut = useMutation({
    mutationFn: ({ connectionId, accountId }: { connectionId: number; accountId: number }) =>
      syncFintocConnection(connectionId, accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
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

  const onConnect = () => {
    if (!widgetToken.trim() || connectMut.isPending) return;
    connectMut.mutate(widgetToken.trim());
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
          {connectMut.isSuccess && lastConnectionResult && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              Conexion validada correctamente. Cuentas detectadas: {lastConnectionResult.validation?.accounts_count ?? 0}. Movimientos de prueba: {lastConnectionResult.validation?.sample_movements_count ?? 0}.
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
                </Box>
                <Box>
                  <IconButton
                    color="primary"
                    onClick={() => conn.account_id && syncMut.mutate({ connectionId: conn.id, accountId: conn.account_id })}
                    disabled={syncMut.isPending || !conn.account_id}
                    title="Sincronizar"
                  >
                    <SyncIcon />
                  </IconButton>
                  <IconButton color="error" onClick={() => setDeleteId(conn.id)} title="Eliminar">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>
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

      {syncMut.isError && <Alert severity="error" sx={{ mt: 2 }}>Error al sincronizar.</Alert>}
      {deleteMut.isError && <Alert severity="error" sx={{ mt: 2 }}>Error al eliminar conexión.</Alert>}
    </Box>
  );
}

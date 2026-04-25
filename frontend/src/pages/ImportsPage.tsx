import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  MenuItem,
  TextField,
  FormControlLabel,
  Switch,
  Checkbox,
  IconButton,
  Tooltip,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import LanguageIcon from '@mui/icons-material/Language';
import {
  uploadExcel,
  uploadPdf,
  confirmImport,
  getImportFiles,
  setAccountPdfPassword,
  getAccountPdfPasswordStatus,
  deleteImportFile,
} from '../api/imports';
import { getAccounts } from '../api/accounts';
import type { ImportPreviewResponse } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';

function parseStatementDate(value?: string): Date | null {
  if (!value) return null;
  const text = value.trim();
  const withSlashes = text.replace(/[-.]/g, '/');
  const m = withSlashes.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getImportStatusChip(status: string) {
  switch (status) {
    case 'completed':
      return { label: 'Completada', color: 'success' as const };
    case 'processing':
      return { label: 'Procesando', color: 'warning' as const };
    case 'pending':
      return { label: 'Pendiente', color: 'default' as const };
    case 'error':
      return { label: 'Error', color: 'error' as const };
    default:
      return { label: status, color: 'default' as const };
  }
}

function normalizeCurrencyCode(code?: string): string {
  const c = (code || '').trim().toUpperCase();
  if (c === 'US') return 'USD';
  if (c === 'MX') return 'MXN';
  if (c === 'PE') return 'PEN';
  if (c === 'CL') return 'CLP';
  return c || 'INTL';
}

export default function ImportsPage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [isPdfProtected, setIsPdfProtected] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [savePasswordForAccount, setSavePasswordForAccount] = useState(true);
  const [deleteImportId, setDeleteImportId] = useState<number | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: imports = [] } = useQuery({ queryKey: ['import-files'], queryFn: getImportFiles });
  const { data: passwordStatus } = useQuery({
    queryKey: ['account-pdf-password', accountId],
    queryFn: () => getAccountPdfPasswordStatus(accountId as number),
    enabled: Boolean(accountId),
  });

  const uploadExcelMut = useMutation({ mutationFn: ({ file, accountId }: { file: File; accountId?: number }) => uploadExcel(file, accountId) });
  const uploadPdfMut = useMutation({
    mutationFn: ({
      file,
      accountId,
      pdfPassword,
      savePdfPassword,
    }: {
      file: File;
      accountId?: number;
      pdfPassword?: string;
      savePdfPassword?: boolean;
    }) => uploadPdf(file, accountId, pdfPassword, savePdfPassword),
  });
  const confirmMut = useMutation({
    mutationFn: ({ importFileId, accountId }: { importFileId: number; accountId: number }) =>
      confirmImport(importFileId, accountId, isPdfProtected ? pdfPassword : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['import-files'] });
    },
  });

  const savePasswordMut = useMutation({
    mutationFn: ({ accountId, password }: { accountId: number; password: string }) =>
      setAccountPdfPassword(accountId, password),
    onSuccess: () => {
      if (accountId) qc.invalidateQueries({ queryKey: ['account-pdf-password', accountId] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: deleteImportFile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['import-files'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteImportId(null);
    },
  });

  const isLoading = uploadExcelMut.isPending || uploadPdfMut.isPending;

  const processSelectedFile = async (file: File, selectedAccountId: number) => {
    const ext = file.name.toLowerCase().split('.').pop();
    return ext === 'pdf'
      ? uploadPdfMut.mutateAsync({
          file,
          accountId: selectedAccountId,
          pdfPassword: isPdfProtected ? pdfPassword : undefined,
          savePdfPassword: savePasswordForAccount,
        })
      : uploadExcelMut.mutateAsync({ file, accountId: selectedAccountId });
  };

  const handleFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setFileName(file.name);
    setPendingFile(file);
    try {
      if (!accountId) {
        setError('Debes seleccionar la cuenta o tarjeta asociada antes de procesar la cartola. El archivo quedó pendiente para procesarlo cuando selecciones la cuenta.');
        return;
      }
      const result = await processSelectedFile(file, accountId);
      setPreview(result);
      setPendingFile(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al subir archivo';
      const needsPassword = /requiere clave|clave.*incorrecta|password|encrypt/i.test(msg);
      if (needsPassword) {
        setIsPdfProtected(true);
        setError('Este estado de cuenta requiere clave. Activa "requiere clave" e ingresa la clave del PDF.');
        return;
      }
      setError(msg);
    }
  };

  const totalPreview = useMemo(
    () => (preview?.preview_rows || []).reduce((s, r) => s + (r.amount || 0), 0),
    [preview]
  );

  const intlRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => r.is_international),
    [preview]
  );

  const nationalRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => !r.is_international),
    [preview]
  );

  const intlByCurrency = useMemo(() => {
    const acc: Record<string, { count: number; originalTotal: number; localTotal: number }> = {};
    for (const row of intlRows) {
      const ccy = normalizeCurrencyCode(row.original_currency);
      if (!acc[ccy]) {
        acc[ccy] = { count: 0, originalTotal: 0, localTotal: 0 };
      }
      acc[ccy].count += 1;
      acc[ccy].originalTotal += Math.abs(row.original_amount || 0);
      acc[ccy].localTotal += Math.abs(row.amount || 0);
    }
    return Object.entries(acc)
      .map(([currency, data]) => ({ currency, ...data }))
      .sort((a, b) => b.originalTotal - a.originalTotal);
  }, [intlRows]);

  const intlLocalTotal = useMemo(
    () => intlRows.reduce((s, r) => s + (r.amount || 0), 0),
    [intlRows]
  );

  const nationalTotal = useMemo(
    () => nationalRows.reduce((s, r) => s + (r.amount || 0), 0),
    [nationalRows]
  );

  const detectedPeriod = useMemo(() => {
    const dates = (preview?.preview_rows || [])
      .map((r) => parseStatementDate(r.date))
      .filter((d): d is Date => Boolean(d));
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const minLabel = min.toLocaleDateString('es-CL');
    const maxLabel = max.toLocaleDateString('es-CL');
    return { min, max, minLabel, maxLabel };
  }, [preview]);

  return (
    <Box>
      <PageHeader
        title="Importar Movimientos"
        subtitle="Carga cartolas en Excel o PDF y confirma antes de guardar"
      />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              select
              label="Cuenta de destino"
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
              size="small"
              sx={{ maxWidth: 340 }}
            >
              <MenuItem value="">Sin cuenta específica</MenuItem>
              {accounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={isPdfProtected}
                  onChange={(e) => setIsPdfProtected(e.target.checked)}
                />
              }
              label="El estado de cuenta PDF requiere clave"
            />

            {isPdfProtected && (
              <Stack spacing={1.5} sx={{ maxWidth: 420 }}>
                <TextField
                  label="Clave del estado de cuenta"
                  type="password"
                  size="small"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  required
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={savePasswordForAccount}
                      onChange={(e) => setSavePasswordForAccount(e.target.checked)}
                      disabled={!accountId}
                    />
                  }
                  label="Guardar clave para todos los estados de esta tarjeta/cuenta"
                />
                {accountId && passwordStatus?.has_password && (
                  <Alert severity="info">Esta cuenta ya tiene una clave guardada para PDF protegido.</Alert>
                )}
                {savePasswordMut.isSuccess && (
                  <Alert severity="success">Clave guardada para esta cuenta.</Alert>
                )}
              </Stack>
            )}

            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: 'background.default',
              }}
            >
              <Typography variant="body1" gutterBottom>
                Arrastra un archivo o selecciónalo manualmente
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                Formatos soportados: .xlsx, .xls, .pdf
              </Typography>
              <Button component="label" variant="contained" startIcon={<UploadFileIcon />} disabled={isLoading}>
                {isLoading ? 'Procesando...' : 'Seleccionar archivo'}
                <input
                  hidden
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && file.name.toLowerCase().endsWith('.pdf') && passwordStatus?.has_password) {
                      setIsPdfProtected(true);
                    }
                    if (file) handleFile(file);
                    e.currentTarget.value = '';
                  }}
                />
              </Button>
              {pendingFile && !preview && accountId && (
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ ml: 1 }}
                  disabled={isLoading}
                  onClick={async () => {
                    setError(null);
                    try {
                      const result = await processSelectedFile(pendingFile, accountId);
                      setPreview(result);
                      setPendingFile(null);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Error al procesar archivo pendiente';
                      setError(msg);
                    }
                  }}
                >
                  {isLoading ? 'Procesando...' : 'Procesar archivo pendiente'}
                </Button>
              )}
              {isPdfProtected && accountId && pdfPassword && (
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ ml: 1 }}
                  onClick={() => savePasswordMut.mutate({ accountId, password: pdfPassword })}
                  disabled={savePasswordMut.isPending}
                >
                  {savePasswordMut.isPending ? 'Guardando clave...' : 'Guardar clave en cuenta'}
                </Button>
              )}
              {fileName && (
                <Typography variant="body2" mt={1} color="text.secondary">Archivo: {fileName}</Typography>
              )}
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {preview && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Vista previa</Typography>
                <Typography variant="body2" color="text.secondary">
                  {preview.total_rows} filas, {preview.total_rows - preview.duplicate_count} nuevas, {preview.duplicate_count} duplicadas
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<CheckCircleIcon />}
                onClick={() => confirmMut.mutate({
                  importFileId: preview.import_file_id,
                  accountId: accountId || 1,
                })}
                disabled={confirmMut.isPending || !accountId}
              >
                {confirmMut.isPending ? 'Importando...' : 'Confirmar Importación'}
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
              <Chip label={`Total: ${formatCurrency(totalPreview)}`} />
              <Chip label={`Nuevas: ${preview.total_rows - preview.duplicate_count}`} color="success" />
              <Chip label={`Duplicadas: ${preview.duplicate_count}`} color="default" />
              {nationalRows.length > 0 && (
                <Chip label={`Nacional: ${nationalRows.length} mov. (${formatCurrency(nationalTotal)})`} />
              )}
              {intlRows.length > 0 && (
                <Chip
                  icon={<LanguageIcon />}
                  label={`Internacional (equiv. local): ${intlRows.length} mov. (${formatCurrency(intlLocalTotal)})`}
                  color="primary"
                  variant="outlined"
                />
              )}
              {intlByCurrency.map((g) => (
                <Chip
                  key={g.currency}
                  icon={<LanguageIcon />}
                  label={`${g.currency}: ${g.originalTotal.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (${g.count} mov.)`}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>

            {detectedPeriod && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Periodo detectado en cartola: {detectedPeriod.minLabel} a {detectedPeriod.maxLabel}. Si no ves datos en Dashboard/Agente,
                selecciona ese mes y anio en los filtros.
              </Alert>
            )}

            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell>Divisa</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.preview_rows.map((row, i) => (
                    <TableRow
                      key={i}
                      sx={row.is_international ? { bgcolor: 'primary.50' } : undefined}
                    >
                      <TableCell>{row.date ? formatDate(row.date) : '—'}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(row.amount ?? 0)}
                        {row.is_international && row.original_amount && row.original_currency && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {row.original_currency} {row.original_amount.toLocaleString('es-CL')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.is_international ? (
                          <Chip
                            size="small"
                            icon={<LanguageIcon />}
                            label={normalizeCurrencyCode(row.original_currency)}
                            color="primary"
                            variant="outlined"
                          />
                        ) : (
                          <Chip size="small" label="CLP" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{row.transaction_type}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.is_duplicate ? 'Duplicado' : 'Nuevo'}
                          color={row.is_duplicate ? 'default' : 'success'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {confirmMut.isSuccess && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Importación completada: {confirmMut.data.saved} guardadas, {confirmMut.data.skipped} omitidas.
              </Alert>
            )}
            {confirmMut.isError && (
              <Alert severity="error" sx={{ mt: 2 }}>Error al confirmar importación.</Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Historial de Importaciones
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Archivo</TableCell>
                  <TableCell>Cuenta/Tarjeta</TableCell>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Filas</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    {(() => {
                      const statusChip = getImportStatusChip(imp.status);
                      return (
                        <>
                    <TableCell>{imp.filename}</TableCell>
                    <TableCell>{imp.account_name ?? 'Sin cuenta'}</TableCell>
                    <TableCell>{imp.period_label ?? 'Sin periodo detectado'}</TableCell>
                    <TableCell>{imp.file_type}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={statusChip.label}
                        color={statusChip.color}
                      />
                    </TableCell>
                    <TableCell>{imp.transaction_count ?? 0}</TableCell>
                    <TableCell>{imp.imported_at ? formatDate(imp.imported_at) : '—'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Eliminar cartola y movimientos relacionados">
                        <IconButton size="small" color="error" onClick={() => setDeleteImportId(imp.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))}
                {imports.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center">Sin importaciones previas</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteImportId !== null}
        title="Eliminar estado de cuenta"
        message="Se eliminará la cartola, sus movimientos importados y la relación con el historial. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteImportId !== null && deleteMut.mutate(deleteImportId)}
        onCancel={() => setDeleteImportId(null)}
        loading={deleteMut.isPending}
      />
    </Box>
  );
}

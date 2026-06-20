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

function formatPreviewDate(value?: string): string {
  const parsed = parseStatementDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
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
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([]);
  const [importType, setImportType] = useState<string>('estado_cuenta');

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const { data: imports = [] } = useQuery({ queryKey: ['import-files'], queryFn: getImportFiles });
  const { data: passwordStatus } = useQuery({
    queryKey: ['account-pdf-password', accountId],
    queryFn: () => getAccountPdfPasswordStatus(accountId as number),
    enabled: Boolean(accountId),
  });

  const uploadExcelMut = useMutation({ mutationFn: ({ file, accountId, importType }: { file: File; accountId?: number; importType?: string }) => uploadExcel(file, accountId, importType) });
  const uploadPdfMut = useMutation({
    mutationFn: ({
      file,
      accountId,
      pdfPassword,
      savePdfPassword,
      importType,
    }: {
      file: File;
      accountId?: number;
      pdfPassword?: string;
      savePdfPassword?: boolean;
      importType?: string;
    }) => uploadPdf(file, accountId, pdfPassword, savePdfPassword, importType),
  });
  const confirmMut = useMutation({
    mutationFn: ({ importFileId, accountId }: { importFileId: number; accountId: number }) =>
      confirmImport(
        importFileId,
        accountId,
        isPdfProtected ? pdfPassword : undefined,
        undefined,
        selectedRowIndexes,
        importType,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['import-files'] });
    },
    onError: (e: Error) => {
      setError(e.message);
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
          importType,
        })
      : uploadExcelMut.mutateAsync({ file, accountId: selectedAccountId, importType });
  };

  const applyDefaultRowSelection = (result: ImportPreviewResponse) => {
    const defaultRows = result.preview_rows
      .filter((row) => !row.is_duplicate)
      .map((row) => row.row_index);
    setSelectedRowIndexes(defaultRows);
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
      applyDefaultRowSelection(result);
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
    () =>
      (preview?.preview_rows || [])
        .filter((r) => selectedRowIndexes.includes(r.row_index))
        .reduce(
        (s, r) => s + (r.is_international ? (r.local_amount ?? r.amount ?? 0) : (r.amount ?? 0)),
        0,
      ),
    [preview, selectedRowIndexes]
  );

  const intlRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => selectedRowIndexes.includes(r.row_index) && r.is_international),
    [preview, selectedRowIndexes]
  );

  const nationalRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => selectedRowIndexes.includes(r.row_index) && !r.is_international),
    [preview, selectedRowIndexes]
  );

  // Sum international rows in local currency (CLP) using local_amount when available.
  const intlLocalTotal = useMemo(
    () => intlRows.reduce((s, r) => s + (r.local_amount ?? r.amount ?? 0), 0),
    [intlRows]
  );

  const intlUsdTotal = useMemo(
    () => intlRows.reduce((s, r) => s + (r.amount ?? 0), 0),
    [intlRows]
  );

  const nationalTotal = useMemo(
    () => nationalRows.reduce((s, r) => s + (r.amount || 0), 0),
    [nationalRows]
  );

  const installmentRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => {
      if (!selectedRowIndexes.includes(r.row_index)) return false;
      const tot = r.raw_data?.installment_total as number | null;
      const cur = r.raw_data?.installment_current as number | null;
      return tot != null && tot > 1 && cur != null && cur > 0;
    }),
    [preview, selectedRowIndexes]
  );

  const installmentTotal = useMemo(
    () => installmentRows.reduce((s, r) => s + Math.abs(r.amount || 0), 0),
    [installmentRows]
  );

  const newDebtRows = useMemo(
    () => (preview?.preview_rows || []).filter((r) => {
      if (!selectedRowIndexes.includes(r.row_index)) return false;
      const tot = r.raw_data?.installment_total as number | null;
      const cur = r.raw_data?.installment_current as number | null;
      return tot != null && tot > 1 && cur === 0;
    }),
    [preview, selectedRowIndexes]
  );

  const allRowIndexes = useMemo(
    () => (preview?.preview_rows || []).map((row) => row.row_index),
    [preview]
  );

  const allSelected = allRowIndexes.length > 0 && selectedRowIndexes.length === allRowIndexes.length;
  const someSelected = selectedRowIndexes.length > 0 && selectedRowIndexes.length < allRowIndexes.length;

  const toggleSelectAllRows = (checked: boolean) => {
    if (checked) {
      setSelectedRowIndexes(allRowIndexes);
      return;
    }
    setSelectedRowIndexes([]);
  };

  const toggleRowSelection = (rowIndex: number, checked: boolean) => {
    setSelectedRowIndexes((prev) => {
      if (checked) {
        if (prev.includes(rowIndex)) return prev;
        return [...prev, rowIndex];
      }
      return prev.filter((idx) => idx !== rowIndex);
    });
  };

  const newDebtMonthlyTotal = useMemo(
    () => newDebtRows.reduce((s, r) => s + Math.abs(r.amount || 0), 0),
    [newDebtRows]
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

            <TextField
              select
              label="Tipo de importación"
              value={importType}
              onChange={(e) => setImportType(e.target.value)}
              size="small"
              sx={{ maxWidth: 340 }}
            >
              <MenuItem value="estado_cuenta">Estado de cuenta (EC mensual tarjeta)</MenuItem>
              <MenuItem value="movimientos_tc">Movimientos TC (detalle tarjeta de crédito)</MenuItem>
              <MenuItem value="movimientos">Movimientos de cuenta (corriente / ahorro / vista)</MenuItem>
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
                      applyDefaultRowSelection(result);
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
                disabled={confirmMut.isPending || !accountId || selectedRowIndexes.length === 0}
              >
                {confirmMut.isPending ? 'Importando...' : 'Confirmar Importación'}
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
              <Chip label={`Total: ${formatCurrency(totalPreview)}`} />
              <Chip label={`Seleccionadas: ${selectedRowIndexes.length}`} color={selectedRowIndexes.length ? 'primary' : 'default'} />
              <Chip label={`Nuevas: ${preview.total_rows - preview.duplicate_count}`} color="success" />
              <Chip label={`Duplicadas: ${preview.duplicate_count}`} color="default" />
              {nationalRows.length > 0 && (
                <Chip label={`Nacional: ${nationalRows.length} mov. (${formatCurrency(nationalTotal)})`} />
              )}
              {intlRows.length > 0 && (
                <Chip
                  icon={<LanguageIcon />}
                  label={`Internacional: ${intlRows.length} mov. (${formatCurrency(intlLocalTotal)} equiv. CLP)`}
                  color="primary"
                  variant="outlined"
                />
              )}
              {installmentRows.length > 0 && (
                <Chip
                  label={`En cuotas: ${installmentRows.length} mov. (${formatCurrency(installmentTotal)})`}
                  color="secondary"
                  variant="outlined"
                />
              )}
              {newDebtRows.length > 0 && (
                <Tooltip title={`${newDebtRows.length} compras nuevas a cuotas (cuota 0/N). No se cobran este mes — se proyectan a partir del mes siguiente.`}>
                  <Chip
                    label={`Nueva deuda: ${newDebtRows.length} mov. (${formatCurrency(newDebtMonthlyTotal)}/mes)`}
                    color="warning"
                    variant="outlined"
                  />
                </Tooltip>
              )}
            </Stack>

            {detectedPeriod && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Periodo detectado en cartola: {detectedPeriod.minLabel} a {detectedPeriod.maxLabel}. Si no ves datos en Inicio o Proyección,
                selecciona ese mes y anio en los filtros.
              </Alert>
            )}

            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(e) => toggleSelectAllRows(e.target.checked)}
                        inputProps={{ 'aria-label': 'Seleccionar todos los movimientos' }}
                      />
                    </TableCell>
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
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedRowIndexes.includes(row.row_index)}
                          onChange={(e) => toggleRowSelection(row.row_index, e.target.checked)}
                          inputProps={{ 'aria-label': `Seleccionar movimiento ${row.description || row.row_index}` }}
                        />
                      </TableCell>
                      <TableCell>{formatPreviewDate(row.date)}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell align="right">
                        {row.is_international && row.local_amount != null
                          ? formatCurrency(row.local_amount)
                          : formatCurrency(row.amount ?? 0, row.is_international ? 'USD' : 'CLP')}
                        {row.is_international && row.local_amount != null && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {formatCurrency(row.amount ?? 0, 'USD')}
                          </Typography>
                        )}
                        {row.is_international && row.original_amount && row.original_currency &&
                          normalizeCurrencyCode(row.original_currency) !== 'USD' &&
                          normalizeCurrencyCode(row.original_currency) !== 'CLP' && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {normalizeCurrencyCode(row.original_currency)} {row.original_amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        )}
                        {(() => {
                          const cur = row.raw_data?.installment_current as number | null;
                          const tot = row.raw_data?.installment_total as number | null;
                          if (cur != null && tot != null && tot > 1) {
                            if (cur === 0) {
                              return (
                                <Typography variant="caption" color="warning.main" display="block">
                                  nueva deuda · 0/{tot} cuotas
                                </Typography>
                              );
                            }
                            return (
                              <Typography variant="caption" color="text.secondary" display="block">
                                cuota {cur}/{tot}
                              </Typography>
                            );
                          }
                          return null;
                        })()}
                      </TableCell>
                      <TableCell>
                        {row.is_international ? (
                          <Chip
                            size="small"
                            icon={<LanguageIcon />}
                            label="USD"
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

                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>TOTAL NACIONAL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatCurrency(nationalTotal, 'CLP')}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label="CLP" variant="outlined" />
                    </TableCell>
                    <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                      {nationalRows.length} movimientos
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: 'primary.50' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>TOTAL INTERNACIONAL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {formatCurrency(intlLocalTotal, 'CLP')}
                      {intlRows.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Ref. USD: {formatCurrency(intlUsdTotal, 'USD')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={<LanguageIcon />} label="INTL→CLP" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                      {intlRows.length} movimientos
                    </TableCell>
                  </TableRow>

                  <TableRow sx={{ bgcolor: 'success.50' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 800 }}>TOTAL GENERAL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: 'success.dark' }}>
                      {formatCurrency(totalPreview, 'CLP')}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label="CLP" color="success" variant="outlined" />
                    </TableCell>
                    <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                      {selectedRowIndexes.length} movimientos seleccionados
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {confirmMut.isSuccess && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Importación completada: {confirmMut.data.saved} guardadas, {confirmMut.data.skipped} omitidas.
              </Alert>
            )}
            {confirmMut.isError && error && (
              <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
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
                  <TableCell>Totales</TableCell>
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
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="caption">{imp.file_type}</Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            imp.import_type === 'movimientos' ? 'Movimientos' :
                            imp.import_type === 'movimientos_tc' ? 'Mov. TC' :
                            'Estado cuenta'
                          }
                        />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={statusChip.label}
                        color={statusChip.color}
                      />
                    </TableCell>
                    <TableCell>{imp.transaction_count ?? 0}</TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="caption" color="text.secondary">
                          Nac mov: {formatCurrency(imp.national_total_clp ?? 0, 'CLP')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Intl mov CLP: {formatCurrency(imp.international_total_clp ?? 0, 'CLP')}
                        </Typography>
                        {(imp.international_total_usd ?? 0) !== 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Intl USD: {formatCurrency(imp.international_total_usd ?? 0, 'USD')}
                          </Typography>
                        )}
                        <Typography variant="caption" fontWeight={700} color="warning.main">
                          Nac a pagar: {formatCurrency(imp.payable_national_clp ?? imp.national_total_clp ?? 0, 'CLP')}
                        </Typography>
                        <Typography variant="caption" fontWeight={700} color="warning.main">
                          Intl a pagar CLP: {formatCurrency(imp.payable_international_clp ?? imp.international_total_clp ?? 0, 'CLP')}
                        </Typography>
                        <Typography variant="caption" fontWeight={700}>
                          Total a pagar CLP: {formatCurrency(imp.payable_total_clp ?? imp.import_total_clp ?? 0, 'CLP')}
                        </Typography>
                      </Stack>
                    </TableCell>
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
                  <TableRow><TableCell colSpan={9} align="center">Sin importaciones previas</TableCell></TableRow>
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

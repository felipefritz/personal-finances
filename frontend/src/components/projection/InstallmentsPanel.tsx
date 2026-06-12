import { useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import { getActiveInstallments, prepayInstallmentDebt, revertInstallmentPrepay } from '../../api/projections';
import { formatCurrency } from '../../utils/formatters';
import type { ActiveInstallment } from '../../types';

export default function InstallmentsPanel({ totalSuggestedSavings }: { totalSuggestedSavings: number }) {
  const qc = useQueryClient();
  const [prepayTarget, setPrepayTarget] = useState<ActiveInstallment | null>(null);
  const [prepayMode, setPrepayMode] = useState<'prepay' | 'revert'>('prepay');
  const [prepayInstallments, setPrepayInstallments] = useState<number>(1);
  const [prepaySummary, setPrepaySummary] = useState<string | null>(null);

  const { data: installments = [] } = useQuery({
    queryKey: ['active-installments'],
    queryFn: () => getActiveInstallments(),
  });

  const invalidateProjectionViews = () => {
    qc.invalidateQueries({ queryKey: ['active-installments'] });
    qc.invalidateQueries({ queryKey: ['projection'] });
    qc.invalidateQueries({ queryKey: ['budget-rules'] });
    qc.invalidateQueries({ queryKey: ['month-breakdown'] });
  };

  const prepayMut = useMutation({
    mutationFn: ({ id, installmentsToPrepay }: { id: number; installmentsToPrepay: number }) => (
      prepayInstallmentDebt(id, { installments: installmentsToPrepay })
    ),
    onSuccess: (result) => {
      invalidateProjectionViews();
      if (prepayTarget) {
        setPrepaySummary(
          `Prepago aplicado en ${prepayTarget.description}: ${result.prepaid_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });

  const revertPrepayMut = useMutation({
    mutationFn: ({ id, installmentsToRevert }: { id: number; installmentsToRevert: number }) => (
      revertInstallmentPrepay(id, { installments: installmentsToRevert })
    ),
    onSuccess: (result) => {
      invalidateProjectionViews();
      if (prepayTarget) {
        setPrepaySummary(
          `Reversa aplicada en ${prepayTarget.description}: ${result.reverted_installments} cuota(s). Pendientes: ${result.remaining_installments}.`,
        );
      }
      setPrepayTarget(null);
      setPrepayInstallments(1);
    },
  });

  const prepayMonthlyAmount = prepayTarget?.monthly_amount ?? 0;
  const prepayCurrentRemainingInstallments = prepayTarget?.remaining_installments ?? 0;
  const prepayCurrentTotalDebt = prepayCurrentRemainingInstallments * prepayMonthlyAmount;
  const prepayRemainingInstallmentsAfter = prepayMode === 'prepay'
    ? Math.max(prepayCurrentRemainingInstallments - prepayInstallments, 0)
    : prepayCurrentRemainingInstallments + prepayInstallments;
  const prepayTotalDebtAfter = prepayRemainingInstallmentsAfter * prepayMonthlyAmount;

  if (installments.length === 0) return null;

  return (
    <>
      {prepaySummary && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {prepaySummary}
        </Alert>
      )}

      {prepayMut.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          No se pudo aplicar el prepago de cuotas.
        </Alert>
      )}

      {revertPrepayMut.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          No se pudo revertir el prepago de cuotas.
        </Alert>
      )}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Deudas en cuotas activas
            </Typography>
            <Chip
              size="small"
              label={`${installments.length} deuda${installments.length !== 1 ? 's' : ''} · ${formatCurrency(installments.reduce((s, i) => s + i.monthly_amount, 0))}/mes`}
              color="warning"
              variant="outlined"
            />
            <Chip
              size="small"
              label={`Ahorro anual sugerido: ${formatCurrency(totalSuggestedSavings)}`}
              color="success"
              variant="outlined"
            />
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Descripción</TableCell>
                  <TableCell align="center">Cuotas</TableCell>
                  <TableCell align="right">Cuota mensual</TableCell>
                  <TableCell align="right">Total restante</TableCell>
                  <TableCell>Calendario</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {installments.map((inst: ActiveInstallment) => (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        {inst.is_new_debt && (
                          <Tooltip title="Nueva deuda: primera cuota aún no facturada">
                            <NewReleasesIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                          </Tooltip>
                        )}
                        <Box>
                          <Typography variant="body2">{inst.description}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            desde {new Date(inst.date).toLocaleDateString('es-CL')}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={`${inst.installment_current}/${inst.installment_total}`}
                        color={inst.is_new_debt ? 'warning' : 'default'}
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.secondary" display="block">
                        {inst.remaining_installments} restantes
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'warning.main' }}>
                      {formatCurrency(inst.monthly_amount)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(inst.total_remaining)}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ maxWidth: 320 }}>
                        {inst.schedule.slice(0, 6).map((m: string) => (
                          <Chip key={m} size="small" label={m} variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                        ))}
                        {inst.schedule.length > 6 && (
                          <Chip size="small" label={`+${inst.schedule.length - 6} más`} variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<PaymentsOutlinedIcon fontSize="small" />}
                        onClick={() => {
                          setPrepayTarget(inst);
                          setPrepayMode('prepay');
                          setPrepayInstallments(1);
                        }}
                        sx={{ mr: 0.5 }}
                      >
                        Prepagar
                      </Button>
                      <Button
                        size="small"
                        startIcon={<UndoIcon fontSize="small" />}
                        onClick={() => {
                          setPrepayTarget(inst);
                          setPrepayMode('revert');
                          setPrepayInstallments(1);
                        }}
                      >
                        Revertir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={prepayTarget !== null} onClose={() => setPrepayTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{prepayMode === 'prepay' ? 'Prepagar compra en cuotas' : 'Revertir prepago de compra en cuotas'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2">
              {prepayTarget?.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Cuotas pendientes actuales: {prepayTarget?.remaining_installments ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Monto pendiente actual: {formatCurrency(prepayCurrentTotalDebt)}
            </Typography>
            <TextField
              label={prepayMode === 'prepay' ? 'Cuotas a prepagar' : 'Cuotas a restaurar'}
              type="number"
              inputProps={{
                min: 1,
                max: prepayMode === 'prepay' ? (prepayTarget?.remaining_installments ?? 1) : 120,
              }}
              value={prepayInstallments}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const raw = Number(e.target.value);
                const max = prepayMode === 'prepay' ? (prepayTarget?.remaining_installments ?? 1) : 120;
                if (!Number.isFinite(raw)) {
                  setPrepayInstallments(1);
                  return;
                }
                setPrepayInstallments(Math.min(max, Math.max(1, Math.floor(raw))));
              }}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Luego del prepago quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`
                : `Luego de la reversa quedarian ${prepayRemainingInstallmentsAfter} cuota(s) pendientes.`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {prepayMode === 'prepay'
                ? `Monto pendiente luego del prepago: ${formatCurrency(prepayTotalDebtAfter)}`
                : `Monto pendiente luego de la reversa: ${formatCurrency(prepayTotalDebtAfter)}`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrepayTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!prepayTarget || prepayMut.isPending || revertPrepayMut.isPending}
            onClick={() => {
              if (!prepayTarget) return;
              if (prepayMode === 'prepay') {
                prepayMut.mutate({ id: prepayTarget.id, installmentsToPrepay: prepayInstallments });
              } else {
                revertPrepayMut.mutate({ id: prepayTarget.id, installmentsToRevert: prepayInstallments });
              }
            }}
          >
            {prepayMode === 'prepay' ? 'Confirmar prepago' : 'Confirmar reversa'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

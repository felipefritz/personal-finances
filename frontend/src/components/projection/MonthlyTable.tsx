import { Fragment, useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { getMonthBreakdown } from '../../api/projections';
import { formatCurrency } from '../../utils/formatters';
import type { MonthlyBalance, MonthBreakdown, AccountBreakdownItem } from '../../types';

interface MonthlyTableProps {
  months: MonthlyBalance[];
  year: number;
  includeInternalTransfers: boolean;
  selectedMonth: number | null;
  onSelectedMonthChange: (month: number | null) => void;
}

export default function MonthlyTable({
  months,
  year,
  includeInternalTransfers,
  selectedMonth,
  onSelectedMonthChange,
}: MonthlyTableProps) {
  const [monthBreakdowns, setMonthBreakdowns] = useState<Map<string, MonthBreakdown>>(new Map());
  const [loadingBreakdown, setLoadingBreakdown] = useState<string | null>(null);
  const [showVariableExpenses, setShowVariableExpenses] = useState(false);

  // Limpiar expandidos cuando cambia el año o el filtro de traspasos
  useEffect(() => {
    onSelectedMonthChange(null);
    setMonthBreakdowns(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, includeInternalTransfers]);

  const toggleMonthExpanded = async (month: number) => {
    const key = `${year}-${month}`;
    if (selectedMonth === month) {
      onSelectedMonthChange(null);
    } else {
      if (!monthBreakdowns.has(key)) {
        try {
          setLoadingBreakdown(key);
          const breakdown = await getMonthBreakdown(year, month, includeInternalTransfers);
          setMonthBreakdowns((m) => new Map(m).set(key, breakdown));
        } catch (err) {
          console.error('Error loading month breakdown:', err);
        } finally {
          setLoadingBreakdown(null);
        }
      }
      onSelectedMonthChange(month);
    }
  };

  const monthlyRows = months.map((m) => {
    if (showVariableExpenses) return { id: m.month, ...m };
    // Exclude variable expenses: adjust totals for display
    const varExp = m.variable_expenses ?? 0;
    return {
      id: m.month,
      ...m,
      variable_expenses: 0,
      total_expenses: m.total_expenses - varExp,
      available_balance: m.available_balance + varExp,
      net_balance: m.net_balance + varExp,
    };
  });

  const selectedBreakdownKey = selectedMonth ? `${year}-${selectedMonth}` : null;
  const selectedBreakdown = selectedBreakdownKey ? monthBreakdowns.get(selectedBreakdownKey) : undefined;

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, mb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Detalle mensual
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showVariableExpenses}
                onChange={(e) => setShowVariableExpenses(e.target.checked)}
              />
            }
            label={<Typography variant="caption" color="text.secondary">Incluir gastos variables</Typography>}
            labelPlacement="start"
            sx={{ mr: 0, ml: 0 }}
          />
        </Stack>
        <TableContainer sx={{ maxHeight: 640 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 44 }} />
                <TableCell>Mes</TableCell>
                <TableCell align="right">Ingresos</TableCell>
                <TableCell align="right">Gtos Fijos</TableCell>
                <TableCell align="right">Cuotas</TableCell>
                {showVariableExpenses && <TableCell align="right">Gtos Variables</TableCell>}
                <TableCell align="right">Total gastos</TableCell>
                <TableCell align="right">Saldo disponible</TableCell>
                <TableCell align="right">Ahorro sugerido</TableCell>
                <TableCell align="right">Caja final</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monthlyRows.map((row) => {
                const isExpanded = selectedMonth === row.month;
                const key = `${year}-${row.month}`;
                const rowBreakdown = isExpanded ? selectedBreakdown : undefined;
                const rowIsLoading = loadingBreakdown === key;
                const finalIconColor = row.net_balance >= 0 ? 'success.main' : 'error.main';
                const FinalIcon = row.net_balance >= 0 ? TrendingUpIcon : TrendingDownIcon;
                const variableTooltip = row.variable_expenses_source === 'budget'
                  ? 'Basado en presupuestos recurrentes'
                  : row.variable_expenses_source === 'historical_avg'
                  ? 'Promedio histórico últimos 3 meses'
                  : 'Real: transacciones del mes';
                const colSpan = showVariableExpenses ? 10 : 9;

                return (
                  <Fragment key={row.month}>
                    <TableRow hover sx={{ bgcolor: row.net_balance < 0 ? 'error.50' : undefined }}>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleMonthExpanded(row.month)}>
                          {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2" fontWeight={600}>{row.label}</Typography>
                          {!row.is_actual && (
                            <Chip label="proyectado" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="success.main">{formatCurrency(row.total_income)}</Typography>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(row.fixed_expenses)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color={row.pending_installments > 0 ? 'warning.main' : 'text.primary'}>
                          {formatCurrency(row.pending_installments)}
                        </Typography>
                      </TableCell>
                      {showVariableExpenses && (
                        <TableCell align="right">
                          <Tooltip title={variableTooltip} placement="top">
                            <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                              <Typography variant="body2">{formatCurrency(row.variable_expenses)}</Typography>
                              {row.variable_expenses_source && (
                                <Chip
                                  label={row.variable_expenses_source === 'budget' ? 'Ppto' : 'Hist'}
                                  size="small"
                                  sx={{
                                    height: 16,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    bgcolor: row.variable_expenses_source === 'budget' ? 'info.light' : 'grey.200',
                                    color: row.variable_expenses_source === 'budget' ? 'info.dark' : 'text.secondary',
                                  }}
                                />
                              )}
                            </Stack>
                          </Tooltip>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Typography variant="body2" color="error.main">{formatCurrency(row.total_expenses)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color={row.available_balance >= 0 ? 'text.primary' : 'error.main'} fontWeight={600}>
                          {formatCurrency(row.available_balance)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" color="primary.main">
                            {formatCurrency(row.total_suggested_savings)}
                          </Typography>
                          {row.suggested_savings.length > 0 && (
                            <Tooltip title={row.suggested_savings.map((s) => `${s.goal_name}: ${formatCurrency(s.amount)}`).join(' | ')}>
                              <InfoOutlinedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                          <FinalIcon sx={{ fontSize: 16, color: finalIconColor }} />
                          <Typography variant="body2" fontWeight={700} color={finalIconColor}>
                            {formatCurrency(row.net_balance)}
                          </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell colSpan={colSpan} sx={{ p: 0, borderBottom: isExpanded ? '1px solid' : 0, borderColor: 'divider' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                            {rowIsLoading ? (
                              <Typography variant="body2" color="text.secondary">Cargando desglose...</Typography>
                            ) : rowBreakdown ? (
                              <Box>
                                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                                  Desglose por cuenta — {row.label}
                                </Typography>
                                <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow sx={{ bgcolor: 'action.selected' }}>
                                        <TableCell>Cuenta</TableCell>
                                        <TableCell align="right">Ingresos</TableCell>
                                        <TableCell align="right">Gtos Fijos</TableCell>
                                        <TableCell align="right">Gtos Variables</TableCell>
                                        <TableCell align="right">Cuotas</TableCell>
                                        <TableCell align="right">Total</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {rowBreakdown.breakdown.map((acc: AccountBreakdownItem) => (
                                        <Fragment key={acc.account_id}>
                                          <TableRow sx={{ bgcolor: 'action.hover' }}>
                                            <TableCell sx={{ fontWeight: 600 }}>{acc.account_name}</TableCell>
                                            <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(acc.income)}</TableCell>
                                            <TableCell align="right">{formatCurrency(acc.fixed_expenses)}</TableCell>
                                            <TableCell align="right">{formatCurrency(acc.variable_expenses)}</TableCell>
                                            <TableCell align="right">{formatCurrency(acc.installments)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                                              {formatCurrency(acc.income + acc.fixed_expenses + acc.variable_expenses + acc.installments)}
                                            </TableCell>
                                          </TableRow>
                                          {acc.transactions && acc.transactions.length > 0 && (
                                            <TableRow sx={{ bgcolor: 'background.paper' }}>
                                              <TableCell colSpan={6} sx={{ p: 1 }}>
                                                <Box sx={{ pl: 2, pr: 1 }}>
                                                  <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                                                    {acc.transactions.length} movimientos
                                                  </Typography>
                                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 150, overflowY: 'auto' }}>
                                                    {acc.transactions.map((tx: any, idx: number) => (
                                                      <Box
                                                        key={idx}
                                                        sx={{
                                                          display: 'flex',
                                                          justifyContent: 'space-between',
                                                          gap: 1,
                                                          p: 0.75,
                                                          bgcolor: 'action.hover',
                                                          border: '1px solid',
                                                          borderColor: 'divider',
                                                          borderRadius: 0.75,
                                                        }}
                                                      >
                                                        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap>
                                                          <strong>{tx.date}</strong> {tx.description}
                                                        </Typography>
                                                        <Typography
                                                          variant="caption"
                                                          sx={{ fontWeight: 700, color: tx.amount >= 0 ? 'success.main' : 'error.main', minWidth: 100, textAlign: 'right' }}
                                                        >
                                                          {formatCurrency(tx.amount)}
                                                        </Typography>
                                                      </Box>
                                                    ))}
                                                  </Box>
                                                </Box>
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </Fragment>
                                      ))}
                                      <TableRow sx={{ bgcolor: 'action.selected' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                                          {formatCurrency(rowBreakdown.breakdown.reduce((s, a) => s + a.income, 0))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                          {formatCurrency(rowBreakdown.breakdown.reduce((s, a) => s + a.fixed_expenses, 0))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                          {formatCurrency(rowBreakdown.breakdown.reduce((s, a) => s + a.variable_expenses, 0))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                          {formatCurrency(rowBreakdown.breakdown.reduce((s, a) => s + a.installments, 0))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                          {formatCurrency(
                                            rowBreakdown.breakdown.reduce(
                                              (s, a) => s + a.income + a.fixed_expenses + a.variable_expenses + a.installments,
                                              0,
                                            ),
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">No hay datos disponibles</Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

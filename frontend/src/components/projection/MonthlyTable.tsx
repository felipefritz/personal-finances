import { Fragment, useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
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
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
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

  const monthlyColumns: GridColDef[] = [
    {
      field: 'expand',
      headerName: '',
      width: 54,
      sortable: false,
      filterable: false,
      align: 'center',
      renderCell: (params) => {
        const month = params.row.month as number;
        const isExpanded = selectedMonth === month;
        return (
          <IconButton size="small" onClick={() => toggleMonthExpanded(month)}>
            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        );
      },
    },
    {
      field: 'label',
      headerName: 'Mes',
      minWidth: 150,
      flex: 1,
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        return (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
            <Typography variant="body2">{row.label}</Typography>
            {!row.is_actual && (
              <Chip label="proyectado" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
            )}
          </Stack>
        );
      },
    },
    {
      field: 'total_income',
      headerName: 'Ingresos',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography variant="body2" color="success.main" sx={{ width: '100%', textAlign: 'right' }}>
          {formatCurrency(params.row.total_income)}
        </Typography>
      ),
    },
    {
      field: 'fixed_expenses',
      headerName: 'Gtos Fijos',
      minWidth: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
    },
    {
      field: 'pending_installments',
      headerName: 'Cuotas',
      minWidth: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography
          variant="body2"
          color={params.row.pending_installments > 0 ? 'warning.main' : 'text.primary'}
          sx={{ width: '100%', textAlign: 'right' }}
        >
          {formatCurrency(params.row.pending_installments)}
        </Typography>
      ),
    },
    {
      field: 'variable_expenses',
      headerName: 'Gtos Variables',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        const src = row.variable_expenses_source;
        const tooltip = src === 'budget'
          ? 'Basado en presupuestos recurrentes'
          : src === 'historical_avg'
          ? 'Promedio histórico últimos 3 meses'
          : 'Real: transacciones del mes';
        return (
          <Tooltip title={tooltip} placement="top">
            <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ width: '100%' }}>
              <Typography variant="body2">
                {formatCurrency(row.variable_expenses)}
              </Typography>
              {src && (
                <Chip
                  label={src === 'budget' ? 'Ppto' : 'Hist'}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: src === 'budget' ? 'info.light' : 'grey.200',
                    color: src === 'budget' ? 'info.dark' : 'text.secondary',
                    px: 0.5,
                  }}
                />
              )}
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      field: 'total_expenses',
      headerName: 'Total gastos',
      minWidth: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography variant="body2" color="error.main" sx={{ width: '100%', textAlign: 'right' }}>
          {formatCurrency(params.row.total_expenses)}
        </Typography>
      ),
    },
    {
      field: 'available_balance',
      headerName: 'Saldo disponible',
      minWidth: 150,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => (
        <Typography
          variant="body2"
          color={params.row.available_balance >= 0 ? 'text.primary' : 'error.main'}
          sx={{ width: '100%', textAlign: 'right' }}
        >
          {formatCurrency(params.row.available_balance)}
        </Typography>
      ),
    },
    {
      field: 'total_suggested_savings',
      headerName: 'Ahorro sugerido',
      minWidth: 165,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const row = params.row as MonthlyBalance;
        return (
          <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5} sx={{ width: '100%' }}>
            <Typography variant="body2" color="primary.main">
              {formatCurrency(row.total_suggested_savings)}
            </Typography>
            {row.suggested_savings.length > 0 && (
              <Tooltip title={row.suggested_savings.map((s) => `${s.goal_name}: ${formatCurrency(s.amount)}`).join(' | ')}>
                <InfoOutlinedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              </Tooltip>
            )}
          </Stack>
        );
      },
    },
    {
      field: 'net_balance',
      headerName: 'Saldo neto',
      minWidth: 150,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => formatCurrency(Number(value)),
      renderCell: (params) => {
        const value = params.row.net_balance as number;
        const Icon = value >= 0 ? TrendingUpIcon : TrendingDownIcon;
        const color = value >= 0 ? 'success.main' : 'error.main';
        return (
          <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ width: '100%' }}>
            <Icon sx={{ fontSize: 16, color }} />
            <Typography variant="body2" fontWeight={700} color={color}>
              {formatCurrency(value)}
            </Typography>
          </Stack>
        );
      },
    },
  ];

  const selectedMonthData = selectedMonth ? months.find((m) => m.month === selectedMonth) : undefined;
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
        <Box sx={{ width: '100%', height: 580 }}>
          <DataGrid
            rows={monthlyRows}
            columns={monthlyColumns}
            columnVisibilityModel={{ variable_expenses: showVariableExpenses }}
            disableRowSelectionOnClick
            hideFooter
            rowHeight={46}
            getRowClassName={(params) => (params.row.net_balance < 0 ? 'row-negative-balance' : '')}
            sx={{
              border: 0,
              '& .MuiDataGrid-columnHeaders': {
                bgcolor: 'primary.50',
                borderBottom: '1px solid',
                borderColor: 'divider',
              },
              '& .MuiDataGrid-cell': {
                borderBottomColor: 'divider',
              },
              '& .row-negative-balance': {
                bgcolor: 'error.50',
              },
              '& .MuiDataGrid-row': {
                opacity: 1,
              },
            }}
          />
        </Box>

        {selectedMonth && (
          <Box sx={{ mt: 2, px: 1 }}>
            {loadingBreakdown === selectedBreakdownKey ? (
              <Typography variant="body2" color="text.secondary">
                Cargando desglose...
              </Typography>
            ) : selectedBreakdown && selectedMonthData ? (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                  Desglose por cuenta — {selectedMonthData.label}
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell>Cuenta</TableCell>
                        <TableCell align="right">Ingresos</TableCell>
                        <TableCell align="right">Gtos Fijos</TableCell>
                        <TableCell align="right">Gtos Variables</TableCell>
                        <TableCell align="right">Cuotas</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedBreakdown.breakdown.map((acc: AccountBreakdownItem) => (
                        <Fragment key={acc.account_id}>
                          <TableRow key={`row-${acc.account_id}`} sx={{ fontSize: '0.85rem', bgcolor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 500 }}>{acc.account_name}</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main' }}>
                              {formatCurrency(acc.income)}
                            </TableCell>
                            <TableCell align="right">{formatCurrency(acc.fixed_expenses)}</TableCell>
                            <TableCell align="right">{formatCurrency(acc.variable_expenses)}</TableCell>
                            <TableCell align="right">{formatCurrency(acc.installments)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, color: 'text.primary' }}>
                              {formatCurrency(acc.income + acc.fixed_expenses + acc.variable_expenses + acc.installments)}
                            </TableCell>
                          </TableRow>
                          {acc.transactions && acc.transactions.length > 0 && (
                            <TableRow key={`tx-${acc.account_id}`} sx={{ bgcolor: '#fafafa' }}>
                              <TableCell colSpan={6} sx={{ p: 1 }}>
                                <Box sx={{ pl: 2, pr: 1 }}>
                                  <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                                    {acc.transactions.length} movimientos
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 150, overflowY: 'auto' }}>
                                    {acc.transactions.map((tx: any, idx: number) => (
                                      <Box
                                        key={idx}
                                        sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', p: 0.5, bgcolor: 'white', borderRadius: '3px' }}
                                      >
                                        <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
                                          <strong>{tx.date}</strong> {tx.description.substring(0, 25)}...
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{ fontWeight: 600, color: tx.amount >= 0 ? 'success.main' : 'error.main', minWidth: 100, textAlign: 'right' }}
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
                      <TableRow sx={{ bgcolor: 'grey.100', fontWeight: 600 }}>
                        <TableCell sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.income, 0))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.fixed_expenses, 0))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.variable_expenses, 0))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(selectedBreakdown.breakdown.reduce((s, a) => s + a.installments, 0))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatCurrency(
                            selectedBreakdown.breakdown.reduce(
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
              <Typography variant="body2" color="text.secondary">
                No hay datos disponibles
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

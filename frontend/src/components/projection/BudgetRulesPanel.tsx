import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SavingsIcon from '@mui/icons-material/Savings';
import { getBudgetRules } from '../../api/projections';
import { formatCurrency } from '../../utils/formatters';

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BUDGET_RULE_PROFILES = [
  { id: 'r503020', label: '50/30/20 (Balanceada)', needs: 50, wants: 30, savings: 20 },
  { id: 'r602515', label: '60/25/15 (Conservadora)', needs: 60, wants: 25, savings: 15 },
  { id: 'r701515', label: '70/15/15 (Ajuste fuerte)', needs: 70, wants: 15, savings: 15 },
] as const;

type RuleId = (typeof BUDGET_RULE_PROFILES)[number]['id'];
type AllocationDetailKey = 'needs' | 'wants' | 'savings';

interface BudgetRuleCardProps {
  title: string;
  subtitle: string;
  targetPct: number;
  target: number;
  actual: number;
  actualPct: number;
  color: string;
  higherIsBetter?: boolean;
  helpText?: string;
  onOpenDetail?: () => void;
  targetLabel?: string;
}

function BudgetRuleCard({ title, subtitle, targetPct, target, actual, actualPct, color, higherIsBetter, helpText, onOpenDetail, targetLabel }: BudgetRuleCardProps) {
  const isOk = higherIsBetter ? actualPct >= targetPct * 0.8 : actualPct <= targetPct * 1.1;
  const barWidth = Math.min(actualPct / targetPct, 1.5); // cap at 150%
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={700}>{title}</Typography>
              {helpText && (
                <Tooltip title={helpText}>
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Tooltip>
              )}
              {onOpenDetail && (
                <Button size="small" variant="text" onClick={onOpenDetail} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                  Como se calcula
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Chip
            size="small"
            label={`${actualPct}%`}
            sx={{ bgcolor: isOk ? 'success.light' : 'error.light', color: isOk ? 'success.dark' : 'error.dark', fontWeight: 700 }}
          />
        </Stack>
        {/* Progress bar */}
        <Box sx={{ mt: 1.5, mb: 1, position: 'relative', height: 10, bgcolor: 'grey.200', borderRadius: 5 }}>
          <Box sx={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${Math.min(barWidth * 100, 100)}%`,
            bgcolor: isOk ? color : 'error.main',
            borderRadius: 5,
            transition: 'width 0.5s',
          }} />
          {/* Target marker */}
          <Box sx={{ position: 'absolute', left: '100%', top: -2, height: 14, width: 2, bgcolor: 'text.secondary', borderRadius: 1, transform: 'translateX(-2px)' }} />
        </Box>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">Actual: {formatCurrency(actual)}</Typography>
          <Typography variant="caption" color="text.secondary">{targetLabel ?? `Meta ${targetPct}%`}: {formatCurrency(target)}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

interface BudgetRulesPanelProps {
  year: number;
  month: number;
  includeInternalTransfers: boolean;
}

export default function BudgetRulesPanel({ year, month, includeInternalTransfers }: BudgetRulesPanelProps) {
  const [selectedRuleId, setSelectedRuleId] = useState<RuleId>('r503020');
  const [allocationDetailOpen, setAllocationDetailOpen] = useState<AllocationDetailKey | null>(null);

  const { data: budgetRules } = useQuery({
    queryKey: ['budget-rules', year, month, includeInternalTransfers],
    queryFn: () => getBudgetRules(undefined, year, month, includeInternalTransfers),
  });

  const recommendedRuleId = useMemo<RuleId>(() => {
    if (!budgetRules) return 'r503020';
    const needsPct = budgetRules.rules_5030_20.needs_pct;
    const debtPct = budgetRules.debt_pressure.debt_ratio_pct;
    if (debtPct >= 30 || needsPct >= 60) return 'r701515';
    if (needsPct >= 52) return 'r602515';
    return 'r503020';
  }, [budgetRules]);

  useEffect(() => {
    setSelectedRuleId(recommendedRuleId);
  }, [recommendedRuleId, year, month]);

  if (!budgetRules) return null;

  const selectedRule = BUDGET_RULE_PROFILES.find((r) => r.id === selectedRuleId) ?? BUDGET_RULE_PROFILES[0];
  const currentMonthlyIncome = budgetRules.monthly_income ?? 0;
  const currentNeeds = budgetRules.suggested_allocation.fixed_expenses + budgetRules.suggested_allocation.installments;
  const currentWants = budgetRules.suggested_allocation.wants ?? 0;
  const currentSavings = budgetRules.suggested_allocation.savings ?? 0;
  const currentNeedsPct = currentMonthlyIncome > 0 ? Number(((currentNeeds / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const currentWantsPct = currentMonthlyIncome > 0 ? Number(((currentWants / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const currentSavingsPct = currentMonthlyIncome > 0 ? Number(((currentSavings / currentMonthlyIncome) * 100).toFixed(1)) : 0;
  const wantsRuleTarget = Math.round((currentMonthlyIncome * selectedRule.wants) / 100);
  const wantsPracticalCap = Math.max(0, Math.min(wantsRuleTarget, currentWants));

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <SavingsIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Regla financiera — distribución mensual
          </Typography>
          <Tooltip title={`Basado en ${budgetRules.income_source === 'projection' ? 'proyección del mes seleccionado' : `promedio de los últimos ${budgetRules.samples_months} meses`}. Ingreso: ${budgetRules.income_source === 'real' ? 'real' : budgetRules.income_source === 'projection' ? 'proyección mensual' : 'ingresos recurrentes configurados'}.`}>
            <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          </Tooltip>
          <Box flexGrow={1} />
          <FormControl size="small" sx={{ minWidth: 210 }}>
            <InputLabel>Regla</InputLabel>
            <Select value={selectedRuleId} label="Regla" onChange={(e) => setSelectedRuleId(e.target.value as RuleId)}>
              {BUDGET_RULE_PROFILES.map((rule) => (
                <MenuItem key={rule.id} value={rule.id}>{rule.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Puedes cambiar la regla desde este selector. La etiqueta Recomendada se calcula automaticamente segun deuda y peso de necesidades.">
            <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          </Tooltip>
          <Chip size="small" label={`Recomendada: ${BUDGET_RULE_PROFILES.find((r) => r.id === recommendedRuleId)?.label ?? '50/30/20'}`} color="warning" variant="outlined" />
          <Chip
            size="small"
            label={`Ingreso base: ${formatCurrency(budgetRules.monthly_income)}/mes`}
            color="success"
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Mes analizado: ${MONTH_SHORT[(budgetRules.month ?? month) - 1]} ${budgetRules.year ?? year}`}
            color="primary"
            variant="outlined"
          />
        </Stack>

        {budgetRules.warnings.length > 0 && (
          <Stack spacing={0.5} mb={2}>
            {budgetRules.warnings.map((w, i) => (
              <Alert key={i} severity="warning" sx={{ py: 0.5 }}>{w}</Alert>
            ))}
          </Stack>
        )}

        <Grid container spacing={2} mb={3}>
          {/* NEEDS */}
          <Grid item xs={12} md={4}>
            <BudgetRuleCard
              title="Necesidades"
              subtitle="Distribución sugerida comprometida"
              targetPct={selectedRule.needs}
              target={Math.round((budgetRules.monthly_income * selectedRule.needs) / 100)}
              actual={currentNeeds}
              actualPct={currentNeedsPct}
              color="#d32f2f"
              helpText="Incluye gastos fijos y cuotas/deudas comprometidas del mes."
              onOpenDetail={() => setAllocationDetailOpen('needs')}
            />
          </Grid>
          {/* WANTS */}
          <Grid item xs={12} md={4}>
            <BudgetRuleCard
              title="Deseos / Variables"
              subtitle={`Tope real por caja. Regla ${selectedRule.wants}% referencial: ${formatCurrency(wantsRuleTarget)}`}
              targetPct={currentWantsPct}
              target={wantsPracticalCap}
              actual={currentWants}
              actualPct={currentWantsPct}
              color="#ed6c02"
              helpText="Se calcula como el saldo libre del mes despues de cubrir necesidades y ahorro sugerido."
              onOpenDetail={() => setAllocationDetailOpen('wants')}
              targetLabel="Tope real"
            />
          </Grid>
          {/* SAVINGS */}
          <Grid item xs={12} md={4}>
            <BudgetRuleCard
              title="Ahorro"
              subtitle="Ahorro sugerido según capacidad"
              targetPct={selectedRule.savings}
              target={Math.round((budgetRules.monthly_income * selectedRule.savings) / 100)}
              actual={currentSavings}
              actualPct={currentSavingsPct}
              color="#2e7d32"
              higherIsBetter
              helpText="Monto sugerido para transferir a ahorro este mes sin comprometer caja operativa."
              onOpenDetail={() => setAllocationDetailOpen('savings')}
            />
          </Grid>
        </Grid>

        {/* Asignación sugerida */}
        <Typography variant="body2" fontWeight={600} gutterBottom>
          Distribución sugerida considerando cuotas actuales
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Categoría</TableCell>
                <TableCell align="right">Monto sugerido</TableCell>
                <TableCell align="right">% del ingreso</TableCell>
                <TableCell>Detalle</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Gastos fijos (arriendo, servicios)</span>
                    <Tooltip title="Parte de necesidades: gastos comprometidos del mes.">
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Tooltip>
                    <Button size="small" variant="text" onClick={() => setAllocationDetailOpen('needs')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                      Como se calcula
                    </Button>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(budgetRules.suggested_allocation.fixed_expenses)}</TableCell>
                <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.fixed_expenses / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                <TableCell><Chip size="small" label="Comprometido" color="error" variant="outlined" /></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Cuotas en curso</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: 'warning.main' }}>{formatCurrency(budgetRules.suggested_allocation.installments)}</TableCell>
                <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.installments / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                <TableCell>
                  <Chip size="small" label={`${budgetRules.debt_pressure.debt_ratio_pct}% deuda`} color={budgetRules.debt_pressure.debt_ratio_pct > 30 ? 'error' : 'warning'} variant="outlined" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Gastos variables / deseos</span>
                    <Tooltip title="Este valor viene del saldo libre proyectado del mes (net balance), es decir, lo que queda utilizable despues de necesidades y ahorro sugerido.">
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    </Tooltip>
                    <Button size="small" variant="text" onClick={() => setAllocationDetailOpen('wants')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                      Como se calcula
                    </Button>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(budgetRules.suggested_allocation.wants)}</TableCell>
                <TableCell align="right">{budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.wants / budgetRules.monthly_income * 100).toFixed(1) : 0}%</TableCell>
                <TableCell><Chip size="small" label="Flexible" color="default" variant="outlined" /></TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: 'success.50' }}>
                <TableCell sx={{ fontWeight: 700, color: 'success.dark' }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Ahorro objetivo ({selectedRule.savings}%)</span>
                    <Tooltip title="Ahorro sugerido por el sistema considerando capacidad de caja y metas activas.">
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: 'success.dark' }} />
                    </Tooltip>
                    <Button size="small" variant="text" color="success" onClick={() => setAllocationDetailOpen('savings')} sx={{ minWidth: 0, px: 0.5, fontSize: 11 }}>
                      Como se calcula
                    </Button>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'success.dark' }}>{formatCurrency(budgetRules.suggested_allocation.savings)}</TableCell>
                <TableCell align="right" sx={{ color: 'success.dark' }}>
                  {budgetRules.monthly_income > 0 ? (budgetRules.suggested_allocation.savings / budgetRules.monthly_income * 100).toFixed(1) : 0}%
                </TableCell>
                <TableCell><Chip size="small" label="Meta" color="success" variant="outlined" /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog
          open={Boolean(allocationDetailOpen)}
          onClose={() => setAllocationDetailOpen(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {allocationDetailOpen === 'needs' && 'Como se calcula: Necesidades'}
            {allocationDetailOpen === 'wants' && 'Como se calcula: Deseos / Variables'}
            {allocationDetailOpen === 'savings' && 'Como se calcula: Ahorro'}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Fuente del ingreso base: {budgetRules.income_source === 'projection' ? 'proyeccion del mes seleccionado' : budgetRules.income_source === 'real' ? `promedio de los ultimos ${budgetRules.samples_months} meses` : 'ingresos recurrentes configurados'}.
              </Typography>
              <Typography variant="body2">
                Ingreso base mensual: <strong>{formatCurrency(currentMonthlyIncome)}</strong>
              </Typography>

              {allocationDetailOpen === 'needs' && (
                <>
                  <Typography variant="body2">Gastos fijos: {formatCurrency(budgetRules.suggested_allocation.fixed_expenses)}</Typography>
                  <Typography variant="body2">Cuotas en curso: {formatCurrency(budgetRules.suggested_allocation.installments)}</Typography>
                  <Typography variant="body2">
                    Formula aplicada: Necesidades = Gastos fijos + Cuotas = {formatCurrency(currentNeeds)} ({currentNeedsPct}%)
                  </Typography>
                  <Typography variant="body2">
                    Meta segun regla {selectedRule.label}: {selectedRule.needs}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.needs) / 100))}
                  </Typography>
                </>
              )}

              {allocationDetailOpen === 'wants' && (
                <>
                  <Typography variant="body2">Necesidades del mes: {formatCurrency(currentNeeds)}</Typography>
                  <Typography variant="body2">Ahorro sugerido: {formatCurrency(currentSavings)}</Typography>
                  <Typography variant="body2">
                    Formula aplicada: Deseos/Variables = Saldo libre utilizable del mes despues de necesidades y ahorro = {formatCurrency(currentWants)} ({currentWantsPct}%)
                  </Typography>
                  <Typography variant="body2">
                    Meta segun regla {selectedRule.label}: {selectedRule.wants}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.wants) / 100))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    La meta porcentual es una referencia ideal. El monto realmente gastable se limita al saldo libre del mes.
                  </Typography>
                </>
              )}

              {allocationDetailOpen === 'savings' && (
                <>
                  <Typography variant="body2">
                    Ahorro sugerido por motor de proyeccion (capacidad de caja y metas activas): {formatCurrency(currentSavings)} ({currentSavingsPct}%)
                  </Typography>
                  <Typography variant="body2">
                    Meta segun regla {selectedRule.label}: {selectedRule.savings}% = {formatCurrency(Math.round((currentMonthlyIncome * selectedRule.savings) / 100))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    El monto final puede ser menor a la meta porcentual si el sistema protege caja operativa o limita ahorro por disponibilidad mensual.
                  </Typography>
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAllocationDetailOpen(null)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}

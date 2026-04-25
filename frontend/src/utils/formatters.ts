export const formatCurrency = (amount: number, currency = 'CLP'): string => {
  if (currency === 'CLP') {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const hasTime = dateStr.includes('T') || dateStr.includes(' ');
  const normalized = hasTime ? dateStr : `${dateStr}T00:00:00`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
};

export const formatPercent = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const getMonthName = (month: number): string => MONTH_NAMES[month - 1] ?? '';

export const ACCOUNT_TYPES = [
  { value: 'corriente', label: 'Cuenta Corriente' },
  { value: 'vista', label: 'Cuenta Vista' },
  { value: 'ahorro', label: 'Cuenta Ahorro' },
  { value: 'tarjeta_credito', label: 'Tarjeta de Credito' },
  { value: 'inversion', label: 'Cuenta Inversion' },
  { value: 'efectivo', label: 'Efectivo' },
] as const;

export const EXPENSE_TYPES = [
  { value: 'dividendo', label: 'Dividendo' },
  { value: 'credito', label: 'Credito' },
  { value: 'colegio', label: 'Colegio' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'suscripcion', label: 'Suscripcion' },
  { value: 'otro', label: 'Otro' },
] as const;

export const TRANSACTION_TYPES = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
  { value: 'transfer', label: 'Transferencia' },
] as const;

export const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'fintoc', label: 'Fintoc' },
  { value: 'excel', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
] as const;

export const STATUS_LABELS = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'ignored', label: 'Ignorado' },
] as const;

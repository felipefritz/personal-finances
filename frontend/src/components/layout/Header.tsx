import { useQuery } from '@tanstack/react-query';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Tooltip,
  Stack,
  Chip,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import OnboardingWizard from '../common/OnboardingWizard';
import { getExchangeRates } from '../../api/exchangeRates';
import { useThemeMode } from '../../context/ThemeContext';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { mode, toggleMode } = useThemeMode();

  const { data: exchangeRates } = useQuery({
    queryKey: ['exchange-rates', 'header'],
    queryFn: getExchangeRates,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const formatIndicator = (value?: number, digits = 0) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  };

  const getTrend = (current?: number, prev?: number): 'up' | 'down' | null => {
    if (typeof current !== 'number' || typeof prev !== 'number') return null;
    if (current > prev) return 'up';
    if (current < prev) return 'down';
    return null;
  };

  const usdTrend = getTrend(exchangeRates?.USD, exchangeRates?.USD_prev);
  const ufTrend = getTrend(exchangeRates?.UF, exchangeRates?.UF_prev);

  const trendColor = (trend: 'up' | 'down' | null) =>
    trend === 'up' ? 'error.main' : trend === 'down' ? 'success.main' : 'text.secondary';

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | null }) => {
    if (!trend) return null;
    const Icon = trend === 'up' ? TrendingUpIcon : TrendingDownIcon;
    return <Icon sx={{ fontSize: 14, ml: 0.25 }} />;
  };

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ bgcolor: 'background.paper', width: '100%', borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
        <IconButton
          edge="start"
          onClick={onMenuClick}
          sx={{ display: { xs: 'flex', md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            Panel financiero
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Mes actual, deudas y presupuestos en un solo lugar
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ mr: 0.5, display: { xs: 'none', xl: 'flex' } }}>
          <Tooltip
            title={exchangeRates?.USD_prev
              ? `Ayer: $${formatIndicator(exchangeRates.USD_prev)}`
              : 'Sin dato del día anterior'}
          >
            <Chip
              size="small"
              variant="outlined"
              label={
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: trendColor(usdTrend) }}>
                  <span>USD {formatIndicator(exchangeRates?.USD)}</span>
                  <TrendIcon trend={usdTrend} />
                </Box>
              }
              sx={{
                fontWeight: 600,
                borderColor: usdTrend ? (usdTrend === 'up' ? 'error.light' : 'success.light') : 'divider',
                bgcolor: 'transparent',
                '& .MuiChip-label': { display: 'flex', alignItems: 'center', px: 1.25 },
              }}
            />
          </Tooltip>
          <Tooltip
            title={exchangeRates?.UF_prev
              ? `Ayer: ${formatIndicator(exchangeRates.UF_prev, 2)}`
              : 'Sin dato del día anterior'}
          >
            <Chip
              size="small"
              variant="outlined"
              label={
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: trendColor(ufTrend) }}>
                  <span>UF {formatIndicator(exchangeRates?.UF, 2)}</span>
                  <TrendIcon trend={ufTrend} />
                </Box>
              }
              sx={{
                fontWeight: 600,
                borderColor: ufTrend ? (ufTrend === 'up' ? 'error.light' : 'success.light') : 'divider',
                bgcolor: 'transparent',
                '& .MuiChip-label': { display: 'flex', alignItems: 'center', px: 1.25 },
              }}
            />
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' }, mx: 0.5 }} />

        <Tooltip title={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
          <IconButton onClick={toggleMode} sx={{ mr: 0.5 }}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        <OnboardingWizard />
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          {new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Typography>
      </Toolbar>
    </AppBar>
  );
}

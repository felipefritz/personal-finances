import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import type { PaletteMode } from '@mui/material';

interface ThemeModeContextType {
  mode: PaletteMode;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextType>({
  mode: 'dark',
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    return (saved as PaletteMode) ?? 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  const toggleMode = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === 'dark'
            ? {
                primary: { main: '#6366f1' },
                secondary: { main: '#a78bfa' },
                background: {
                  default: '#0f172a',
                  paper: '#1e293b',
                },
                divider: 'rgba(148,163,184,0.12)',
                text: {
                  primary: '#f1f5f9',
                  secondary: '#94a3b8',
                },
              }
            : {
                primary: { main: '#4f46e5' },
                secondary: { main: '#7c3aed' },
                background: {
                  default: '#f8fafc',
                  paper: '#ffffff',
                },
                divider: 'rgba(15,23,42,0.08)',
                text: {
                  primary: '#0f172a',
                  secondary: '#64748b',
                },
              }),
        },
        typography: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
          h5: { fontWeight: 700, letterSpacing: '-0.02em' },
          h6: { fontWeight: 700, letterSpacing: '-0.01em' },
          subtitle1: { fontWeight: 600, letterSpacing: '-0.01em' },
          subtitle2: { fontWeight: 600 },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiCard: {
            styleOverrides: {
              root: ({ theme: t }) => ({
                backgroundImage: 'none',
                border: `1px solid ${t.palette.divider}`,
                boxShadow: 'none',
              }),
            },
          },
          MuiAppBar: {
            styleOverrides: {
              root: ({ theme: t }) => ({
                backgroundImage: 'none',
                backgroundColor: t.palette.background.paper,
                boxShadow: 'none',
              }),
            },
          },
          MuiDrawer: {
            styleOverrides: {
              paper: ({ theme: t }) => ({
                backgroundImage: 'none',
                backgroundColor: t.palette.background.paper,
                borderRight: `1px solid ${t.palette.divider}`,
              }),
            },
          },
          MuiButton: {
            styleOverrides: {
              root: { textTransform: 'none', fontWeight: 600 },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: { fontWeight: 600 },
            },
          },
          MuiListItemButton: {
            styleOverrides: {
              root: ({ theme: t }) => ({
                borderRadius: 8,
                '&.active': {
                  backgroundColor: t.palette.mode === 'dark'
                    ? 'rgba(99,102,241,0.2)'
                    : 'rgba(79,70,229,0.1)',
                  color: t.palette.primary.main,
                  '& .MuiListItemIcon-root': { color: t.palette.primary.main },
                },
                '&:hover': {
                  backgroundColor: t.palette.mode === 'dark'
                    ? 'rgba(99,102,241,0.1)'
                    : 'rgba(79,70,229,0.06)',
                },
              }),
            },
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

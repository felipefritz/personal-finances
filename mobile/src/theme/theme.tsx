import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export const lightColors = {
  background: '#f6f8fb',
  surface: '#ffffff',
  surfaceSoft: '#eef4f1',
  primary: '#116d6e',
  primarySoft: '#dff2ee',
  secondary: '#254e7b',
  accent: '#d38b37',
  danger: '#b42318',
  success: '#18794e',
  warning: '#a15c07',
  text: '#172026',
  muted: '#64727d',
  border: '#d8e0e6',
  onPrimary: '#ffffff',
};

export const darkColors = {
  background: '#0d1418',
  surface: '#121d22',
  surfaceSoft: '#1b2b31',
  primary: '#40b8a6',
  primarySoft: '#173e3a',
  secondary: '#8ab4e6',
  accent: '#e1a85b',
  danger: '#ff8f80',
  success: '#72d6a2',
  warning: '#f0bd6f',
  text: '#edf4f7',
  muted: '#9fb0b8',
  border: '#263941',
  onPrimary: '#08201d',
};

export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radii = {
  sm: 6,
  md: 8,
};

export type ThemeMode = 'light' | 'dark';
export type ThemeColors = typeof lightColors;

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      isDark: mode === 'dark',
      toggleTheme: () => setMode((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}

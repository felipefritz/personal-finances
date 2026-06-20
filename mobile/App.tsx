import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { BudgetsScreen } from './src/screens/BudgetsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProjectionScreen } from './src/screens/ProjectionScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { spacing, ThemeProvider, useTheme } from './src/theme/theme';

type TabKey = 'home' | 'transactions' | 'budgets' | 'projection' | 'accounts';

const tabs: Array<{ key: TabKey; label: string; shortLabel: string }> = [
  { key: 'home', label: 'Inicio', shortLabel: 'Inicio' },
  { key: 'transactions', label: 'Movimientos', shortLabel: 'Movs.' },
  { key: 'budgets', label: 'Planes', shortLabel: 'Planes' },
  { key: 'projection', label: 'Proyeccion', shortLabel: 'Proy.' },
  { key: 'accounts', label: 'Cuentas', shortLabel: 'Ctas.' },
];

const guideSteps: Array<{
  title: string;
  body: string;
  tab: TabKey;
  action: string;
}> = [
  {
    title: '1. Agrega tus cuentas',
    body: 'Parte por tus cuentas reales: corriente, vista, ahorro, efectivo o tarjeta. Esto crea el saldo base del sistema.',
    tab: 'accounts',
    action: 'Ir a Cuentas',
  },
  {
    title: '2. Registra ingresos y gastos',
    body: 'Agrega sueldo, abonos y gastos frecuentes. No necesitas cargar todo perfecto al inicio; parte con lo más importante.',
    tab: 'transactions',
    action: 'Ir a Movimientos',
  },
  {
    title: '3. Ordena tu mes con planes',
    body: 'Define presupuestos, pagos fijos, cuotas y metas. Esta es la parte que transforma datos sueltos en decisiones.',
    tab: 'budgets',
    action: 'Ir a Planes',
  },
  {
    title: '4. Revisa la proyección',
    body: 'Mira cuánto te quedará disponible mes a mes después de pagos comprometidos y ahorro sugerido.',
    tab: 'projection',
    action: 'Ir a Proyección',
  },
];

function AppShell() {
  const { isReady, token, user, logout } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function goTo(tab: TabKey) {
    setActiveTab(tab);
    setIsMenuOpen(false);
  }

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'transactions':
        return <TransactionsScreen />;
      case 'budgets':
        return <BudgetsScreen />;
      case 'projection':
        return <ProjectionScreen />;
      case 'accounts':
        return <AccountsScreen />;
      case 'home':
      default:
        return <HomeScreen onOpenTab={setActiveTab} />;
    }
  }, [activeTab]);

  if (!isReady) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadingText}>Preparando tu espacio financiero...</Text>
      </SafeAreaView>
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.appHeader}>
        <Pressable onPress={() => setIsMenuOpen(true)} style={styles.menuButton}>
          <Text style={styles.menuIcon}>☰</Text>
          <Text style={styles.menuButtonText}>Menu</Text>
        </Pressable>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Finanzas</Text>
          <Text style={styles.currentSection}>{tabs.find((tab) => tab.key === activeTab)?.label}</Text>
        </View>
        <Pressable onPress={toggleTheme} style={styles.headerThemeButton}>
          <Text style={styles.headerThemeText}>{isDark ? 'Claro' : 'Oscuro'}</Text>
        </Pressable>
        <Pressable onPress={() => setIsGuideOpen(true)} style={styles.helpButton}>
          <Text style={styles.helpText}>?</Text>
        </Pressable>
      </View>
      <View style={styles.content}>{screen}</View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => goTo(tab.key)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.shortLabel}</Text>
            </Pressable>
          );
        })}
      </View>
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setIsMenuOpen(false)} />
          <SafeAreaView style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>Finanzas personales</Text>
                <Text style={styles.drawerSubtitle}>{user?.email}</Text>
              </View>
              <Pressable onPress={() => setIsMenuOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.drawerNav}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <Pressable key={tab.key} onPress={() => goTo(tab.key)} style={[styles.drawerItem, isActive && styles.drawerItemActive]}>
                    <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>{tab.label}</Text>
                    <Text style={[styles.drawerChevron, isActive && styles.drawerItemTextActive]}>›</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.drawerFooter}>
              <Pressable onPress={toggleTheme} style={styles.themeButton}>
                <Text style={styles.themeButtonText}>{isDark ? 'Usar modo claro' : 'Usar modo oscuro'}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setIsMenuOpen(false);
                  await logout();
                }}
                style={styles.logoutDrawerButton}
              >
                <Text style={styles.logoutDrawerText}>Cerrar sesion</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal visible={isGuideOpen} transparent animationType="slide" onRequestClose={() => setIsGuideOpen(false)}>
        <View style={styles.guideRoot}>
          <Pressable style={styles.guideBackdrop} onPress={() => setIsGuideOpen(false)} />
          <SafeAreaView style={styles.guideSheet}>
            <View style={styles.guideHandle} />
            <View style={styles.guideHeader}>
              <View style={styles.guideHeaderText}>
                <Text style={styles.guideKicker}>Guia de inicio</Text>
                <Text style={styles.guideTitle}>Carga tus datos sin enredarte</Text>
              </View>
              <Pressable onPress={() => setIsGuideOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.progressRow}>
              {guideSteps.map((step, index) => (
                <View key={step.title} style={[styles.progressDot, index <= guideIndex && styles.progressDotActive]} />
              ))}
            </View>

            <View style={styles.guideCard}>
              <Text style={styles.guideStepTitle}>{guideSteps[guideIndex].title}</Text>
              <Text style={styles.guideBody}>{guideSteps[guideIndex].body}</Text>
              <Pressable
                onPress={() => {
                  goTo(guideSteps[guideIndex].tab);
                  setIsGuideOpen(false);
                }}
                style={styles.guidePrimary}
              >
                <Text style={styles.guidePrimaryText}>{guideSteps[guideIndex].action}</Text>
              </Pressable>
            </View>

            <View style={styles.guideNav}>
              <Pressable
                disabled={guideIndex === 0}
                onPress={() => setGuideIndex((index) => Math.max(index - 1, 0))}
                style={[styles.guideSecondary, guideIndex === 0 && styles.disabledButton]}
              >
                <Text style={styles.guideSecondaryText}>Anterior</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (guideIndex === guideSteps.length - 1) {
                    setIsGuideOpen(false);
                    return;
                  }
                  setGuideIndex((index) => Math.min(index + 1, guideSteps.length - 1));
                }}
                style={styles.guideSecondary}
              >
                <Text style={styles.guideSecondaryText}>{guideIndex === guideSteps.length - 1 ? 'Listo' : 'Siguiente'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  appHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  menuButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  menuIcon: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  menuButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  brandBlock: {
    flex: 1,
  },
  brand: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  currentSection: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  headerThemeButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  headerThemeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  helpButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  helpText: {
    color: colors.onPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.surface,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
  },
  drawer: {
    width: '82%',
    maxWidth: 360,
    height: '100%',
    backgroundColor: colors.surface,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  drawerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  closeText: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 30,
  },
  drawerNav: {
    flex: 1,
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  drawerItem: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  drawerItemActive: {
    backgroundColor: colors.primary,
  },
  drawerItemText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  drawerItemTextActive: {
    color: colors.onPrimary,
  },
  drawerChevron: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '700',
  },
  drawerFooter: {
    paddingTop: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  logoutDrawerButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  logoutDrawerText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  themeButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    marginBottom: spacing.sm,
  },
  themeButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  guideRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  guideBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  guideSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  guideHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  guideHeaderText: {
    flex: 1,
    gap: 3,
  },
  guideKicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  guideTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  progressDot: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  guideCard: {
    gap: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  guideStepTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  guideBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  guidePrimary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  guidePrimaryText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  guideNav: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guideSecondary: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabledButton: {
    opacity: 0.45,
  },
  guideSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
});

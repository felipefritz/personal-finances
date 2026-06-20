import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { API_BASE_URL } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, useTheme } from '../theme/theme';

export function LoginScreen() {
  const { login, register } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === 'register';

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(email.trim(), password, fullName.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesion');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Finanzas personales</Text>
          <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Entra a tu tablero'}</Text>
          <Text style={styles.subtitle}>
            Mira tu disponible, tus pagos comprometidos y la proyeccion mensual sin mezclar cuentas.
          </Text>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setMode('login')}
              style={[styles.modeButton, !isRegister && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, !isRegister && styles.modeTextActive]}>Ingresar</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('register')}
              style={[styles.modeButton, isRegister && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, isRegister && styles.modeTextActive]}>Registrarme</Text>
            </Pressable>
          </View>

          {isRegister ? (
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              style={styles.input}
            />
          ) : null}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Contrasena"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable disabled={isSubmitting} onPress={submit} style={styles.submit}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.submitText}>{isRegister ? 'Crear cuenta' : 'Ingresar'}</Text>
            )}
          </Pressable>

          <Text style={styles.apiText}>API: {API_BASE_URL}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
  },
  modeText: {
    color: colors.muted,
    fontWeight: '800',
  },
  modeTextActive: {
    color: colors.text,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.background,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  submit: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  submitText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  apiText: {
    color: colors.muted,
    fontSize: 11,
  },
});

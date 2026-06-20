import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, useTheme } from '../theme/theme';

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
};

export function StatCard({ label, value, helper, tone = 'default' }: StatCardProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const toneStyle =
    tone === 'good'
      ? styles.good
      : tone === 'warn'
        ? styles.warn
        : tone === 'danger'
          ? styles.danger
          : styles.defaultTone;

  return (
    <View style={[styles.card, toneStyle]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) => StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 6,
  },
  defaultTone: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  good: {
    backgroundColor: isDark ? '#112e24' : '#e7f5ee',
    borderColor: isDark ? '#285b45' : '#b7ddca',
  },
  warn: {
    backgroundColor: isDark ? '#302412' : '#fff4df',
    borderColor: isDark ? '#705225' : '#f1d19f',
  },
  danger: {
    backgroundColor: isDark ? '#321916' : '#fff0ed',
    borderColor: isDark ? '#74423a' : '#f1b8ae',
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  helper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme/theme';

type FinanceTableRow = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
};

type FinanceTableProps = {
  rows: FinanceTableRow[];
};

export function FinanceTable({ rows }: FinanceTableProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.table}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <View style={styles.left}>
            <Text style={styles.label}>{row.label}</Text>
            {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
          </View>
          <Text
            style={[
              styles.value,
              row.tone === 'good' ? styles.good : row.tone === 'bad' ? styles.bad : row.tone === 'warn' ? styles.warn : null,
            ]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  table: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  good: {
    color: colors.success,
  },
  bad: {
    color: colors.danger,
  },
  warn: {
    color: colors.warning,
  },
});

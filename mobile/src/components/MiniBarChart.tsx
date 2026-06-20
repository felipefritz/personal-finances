import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, useTheme } from '../theme/theme';
import { formatCurrency } from '../utils/formatters';

type BarPoint = {
  label: string;
  value: number;
  secondaryValue?: number;
};

type MiniBarChartProps = {
  title: string;
  data: BarPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
};

export function MiniBarChart({ title, data, primaryLabel, secondaryLabel }: MiniBarChartProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const maxValue = Math.max(1, ...data.flatMap((item) => [Math.abs(item.value), Math.abs(item.secondaryValue ?? 0)]));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.legend}>
          <LegendDot color={colors.primary} label={primaryLabel} />
          {secondaryLabel ? <LegendDot color={colors.accent} label={secondaryLabel} /> : null}
        </View>
      </View>
      <View style={styles.chart}>
        {data.map((item) => {
          const primaryHeight = Math.max(4, Math.round((Math.abs(item.value) / maxValue) * 132));
          const secondaryHeight = Math.max(4, Math.round((Math.abs(item.secondaryValue ?? 0) / maxValue) * 132));
          return (
            <View key={item.label} style={styles.barColumn}>
              <View style={styles.barArea}>
                {secondaryLabel ? <View style={[styles.bar, styles.secondaryBar, { height: secondaryHeight }]} /> : null}
                <View style={[styles.bar, { height: primaryHeight }]} />
              </View>
              <Text style={styles.barLabel}>{item.label}</Text>
            </View>
          );
        })}
      </View>
      {data[0] ? <Text style={styles.caption}>Proximo: {formatCurrency(data[0].value)}</Text> : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chart: {
    minHeight: 170,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  barArea: {
    height: 136,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 10,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: colors.primary,
  },
  secondaryBar: {
    backgroundColor: colors.accent,
  },
  barLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});

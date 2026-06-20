import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, useTheme } from '../theme/theme';

type HelpTipProps = {
  title: string;
  body: string;
};

export function HelpTip({ title, body }: HelpTipProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.tip}>
      <Text style={styles.badge}>Ayuda</Text>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    textTransform: 'uppercase',
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});

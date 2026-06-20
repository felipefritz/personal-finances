import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, useTheme } from '../theme/theme';

type SectionCardProps = PropsWithChildren<{
  title?: string;
  footer?: string;
}>;

export function SectionCard({ title, footer, children }: SectionCardProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  footer: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});

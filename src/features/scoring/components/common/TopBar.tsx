import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, IconButton, Text, space, useGutter, type BadgeTone } from '@/ui';

export interface TopBarProps {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly onBack?: () => void;
  readonly backIcon?: 'chevron-left' | 'x';
  readonly backLabel?: string;
  readonly badge?: string | null;
  readonly badgeTone?: BadgeTone;
  readonly trailing?: ReactNode;
  readonly testID?: string;
}

export function TopBar({ title, subtitle, onBack, backIcon = 'chevron-left', backLabel = 'Back', badge, badgeTone = 'paused', trailing, testID }: TopBarProps) {
  const gutter = useGutter();
  const iconEdge = Math.max(0, gutter - space.sm);
  return (
    <View testID={testID} style={styles.bar}>
      <View style={[styles.row, { paddingLeft: onBack ? iconEdge : gutter, paddingRight: trailing ? iconEdge : gutter }]}>
        {onBack ? <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} testID="top-bar-back" /> : null}
        <View style={styles.titles}>
          <View style={styles.titleLine}>
            <Text variant="headline" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {badge ? <Badge label={badge} tone={badgeTone} /> : null}
          </View>
          {subtitle ? (
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignSelf: 'stretch' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  titles: { flex: 1, paddingVertical: space.xxs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { flexShrink: 1 },
});

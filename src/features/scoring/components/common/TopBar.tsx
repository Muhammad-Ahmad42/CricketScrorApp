import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, IconButton, Text, space, type BadgeTone } from '@/ui';

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
  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.row}>
        {onBack ? <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} testID="top-bar-back" /> : <View style={styles.spacer} />}
        <View style={styles.titles}>
          <View style={styles.titleLine}>
            <Text variant="subhead" weight="semibold" accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            {badge ? <Badge label={badge} tone={badgeTone} /> : null}
          </View>
          {subtitle ? (
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignSelf: 'stretch' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxs, gap: space.xxs },
  spacer: { width: space.sm },
  titles: { flex: 1, paddingVertical: space.xxs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { flexShrink: 1 },
});

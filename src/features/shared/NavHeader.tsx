import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, space, useGutter } from '@/ui';

export interface NavHeaderProps {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly onBack?: () => void;
  readonly backIcon?: 'chevron-left' | 'x';
  readonly backLabel?: string;
  readonly trailing?: ReactNode;
  readonly titleTestID?: string;
  readonly testID?: string;
}

export function navHeaderInset(gutter: number): number {
  return Math.max(space.xxs, gutter - space.xs);
}

export function NavHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'chevron-left',
  backLabel = 'Back',
  trailing,
  titleTestID,
  testID,
}: NavHeaderProps) {
  const gutter = useGutter();
  const inset = navHeaderInset(gutter);
  return (
    <View testID={testID} style={[styles.root, { paddingHorizontal: inset }]}>
      {onBack ? (
        <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} testID={backIcon === 'x' ? 'nav-btn-close' : 'nav-btn-back'} />
      ) : (
        <View style={{ width: gutter - inset }} />
      )}
      <View style={styles.titles}>
        <Text variant="headline" accessibilityRole="header" testID={titleTestID}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.xxs,
    paddingBottom: space.xs,
    gap: space.xxs,
  },
  titles: { flex: 1, minWidth: 0, gap: space.xxs },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});

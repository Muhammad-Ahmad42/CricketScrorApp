import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, space } from '@/ui';

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
  return (
    <View testID={testID} style={styles.root}>
      {onBack ? (
        <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} testID={backIcon === 'x' ? 'nav-btn-close' : 'nav-btn-back'} />
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.titles}>
        <Text variant="headline" accessibilityRole="header" numberOfLines={2} testID={titleTestID}>
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
    paddingHorizontal: space.xxs,
    paddingTop: space.xxs,
    paddingBottom: space.xs,
    gap: space.xxs,
  },
  spacer: { width: space.sm },
  titles: { flex: 1, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});

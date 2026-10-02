import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, space } from '@/ui';

export interface StackHeaderProps {
  readonly title: string;
  readonly onBack: () => void;
  readonly trailing?: ReactNode;
}

export function StackHeader({ title, onBack, trailing }: StackHeaderProps) {
  return (
    <View style={styles.bar} testID="settings-group-stack-bar">
      <IconButton icon="chevron-left" accessibilityLabel="Back" onPress={onBack} testID="nav-btn-back" />
      <View style={styles.title}>
        <Text variant="headline" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : <View style={styles.balance} />}
    </View>
  );
}

export interface StackIntroProps {
  readonly text: string;
  readonly testID?: string;
}

export function StackIntro({ text, testID }: StackIntroProps) {
  return (
    <Text variant="footnote" tone="secondary" style={styles.intro} testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xxs,
    paddingVertical: space.xxs,
    gap: space.xxs,
  },
  title: { flex: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  balance: { width: space.sm },
  intro: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs },
});

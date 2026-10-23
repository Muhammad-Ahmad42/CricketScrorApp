import { StyleSheet, View } from 'react-native';
import { Badge, PressableRow, Text, space } from '@/ui';
import type { MatchCardVM } from '../selectors/matchCard';

export interface MatchCardProps {
  readonly vm: MatchCardVM;
  readonly onPress: () => void;
  readonly onMenu?: () => void;
  readonly testID?: string;
}

export function MatchCard({ vm, onPress, onMenu, testID }: MatchCardProps) {
  return (
    <PressableRow
      testID={testID}
      accessibilityLabel={vm.accessibilityLabel}
      accessibilityHint={vm.inPlay ? 'Opens live scoring' : 'Opens the scorecard'}
      onPress={onPress}
      direction="column"
      align="stretch"
      gap="xxs"
      menu={onMenu ? { accessibilityLabel: `Options for ${vm.title}`, onPress: onMenu, testID: testID ? `${testID}-menu` : undefined } : undefined}
    >
      <Text variant="headline">{vm.title}</Text>
      {vm.inPlay ? (
        <View style={styles.statusLine}>
          <Badge label={vm.statusLabel} tone={vm.paused ? 'paused' : 'live'} />
        </View>
      ) : vm.resultLine ? (
        <Text variant="callout">{vm.resultLine}</Text>
      ) : (
        <Text variant="callout" tone="secondary">
          {vm.statusLabel}
        </Text>
      )}
      {vm.scoreLine ? (
        <Text variant="subhead" tone="secondary" style={styles.numbers}>
          {vm.scoreLine}
        </Text>
      ) : null}
      {vm.meta ? (
        <Text variant="footnote" tone="secondary" testID={testID ? `${testID}-meta` : undefined}>
          {vm.meta}
        </Text>
      ) : null}
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  numbers: { fontVariant: ['tabular-nums'] },
});

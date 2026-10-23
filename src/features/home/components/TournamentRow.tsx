import { StyleSheet, View } from 'react-native';
import { PressableRow, Text, space } from '@/ui';
import type { TournamentRowVM } from '../selectors/tournaments';

export interface TournamentRowProps {
  readonly vm: TournamentRowVM;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function TournamentRow({ vm, onPress, testID }: TournamentRowProps) {
  return (
    <PressableRow testID={testID} accessibilityLabel={vm.accessibilityLabel} onPress={onPress} chevron>
      <View style={styles.text}>
        <View style={styles.line}>
          <Text variant="headline" style={styles.flex}>
            {vm.name}
          </Text>
          <Text variant="subhead" tone="secondary" style={styles.numbers}>
            {vm.status}
          </Text>
        </View>
        {vm.detail ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {vm.detail}
          </Text>
        ) : null}
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  numbers: { fontVariant: ['tabular-nums'] },
});

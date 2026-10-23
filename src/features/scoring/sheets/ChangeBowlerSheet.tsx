import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { selectBowler, type ScoringIntent } from '@/domain/scoring/commands';
import { OptionTile, SegmentedControl, Sheet, Text, space } from '@/ui';
import type { ChangeBowlerVM } from '../selectors/options';

export interface ChangeBowlerSheetProps {
  readonly visible: boolean;
  readonly vm: ChangeBowlerVM;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

type Reason = 'injury' | 'suspended';

export function ChangeBowlerSheet({ visible, vm, onSubmit, onClose }: ChangeBowlerSheetProps) {
  const [reason, setReason] = useState<Reason>('injury');
  return (
    <Sheet visible={visible} title="Change bowler" subtitle="New bowler finishes this over" onClose={onClose} testID="sheet-change-bowler">
      <View style={styles.body}>
        <SegmentedControl
          options={[
            { value: 'injury', label: 'Injured', testID: 'change-bowler-injury' },
            { value: 'suspended', label: 'Suspended', testID: 'change-bowler-suspended' },
          ]}
          value={reason}
          onChange={setReason}
          accessibilityLabel="Reason for the change"
        />
        <Text variant="footnote" tone="secondary">
          {reason === 'suspended' ? "Can't bowl again this innings" : 'Can bowl again later'}
        </Text>
        {vm.eligible.map((option) => (
          <OptionTile
            key={option.id}
            kind="action"
            title={option.label}
            description={option.quota}
            value={option.figures}
            onPress={() => onSubmit(selectBowler(option.id, reason))}
            testID={`change-bowler-${option.id}`}
          />
        ))}
        {vm.eligible.length === 0 ? (
          <Text variant="body" tone="secondary">
            No one else can bowl this over
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xs },
});

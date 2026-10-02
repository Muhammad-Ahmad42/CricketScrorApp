import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlayerId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, Dialog, ListRow, SegmentedControl, Sheet, Text, space } from '@/ui';
import type { PlayerOption } from '../selectors/options';

export interface EndInningsSheetProps {
  readonly visible: boolean;
  readonly teamName: string;
  readonly scoreText: string;
  readonly yetToBat: readonly PlayerOption[];
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

type Reason = 'declared' | 'batters_unavailable';

export function EndInningsSheet({ visible, teamName, scoreText, yetToBat, onSubmit, onClose }: EndInningsSheetProps) {
  const [reason, setReason] = useState<Reason>('declared');
  const [absent, setAbsent] = useState<ReadonlyMap<PlayerId, boolean>>(new Map());
  const [confirming, setConfirming] = useState(false);

  const toggle = (playerId: PlayerId) => {
    const next = new Map(absent);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.set(playerId, false);
    }
    setAbsent(next);
  };
  const toggleHurt = (playerId: PlayerId) => {
    const next = new Map(absent);
    next.set(playerId, !(next.get(playerId) ?? false));
    setAbsent(next);
  };
  const intent = (): ScoringIntent =>
    reason === 'declared'
      ? { type: 'end_innings', reason }
      : { type: 'end_innings', reason, absentees: [...absent.entries()].map(([playerId, hurt]) => ({ playerId, hurt })) };

  return (
    <>
      <Sheet
        visible={visible && !confirming}
        title="End innings"
        onClose={onClose}
        testID="sheet-end-innings"
        footer={<Button label="End innings" size="lg" fullWidth onPress={() => setConfirming(true)} testID="end-innings-next" />}
      >
        <View style={styles.body}>
          <SegmentedControl
            options={[
              { value: 'declared', label: 'Declared', testID: 'end-innings-declared' },
              { value: 'batters_unavailable', label: 'No batters available', testID: 'end-innings-unavailable' },
            ]}
            value={reason}
            onChange={setReason}
            accessibilityLabel="Why the innings ends"
          />
          {reason === 'batters_unavailable' ? (
            <>
              <Text variant="footnote" tone="secondary">
                Mark the players who can't bat. The innings counts as all out.
              </Text>
              {yetToBat.map((option) => (
                <View key={option.id}>
                  <ListRow
                    title={option.label}
                    trailing={{ kind: 'switch', value: absent.has(option.id), onValueChange: () => toggle(option.id) }}
                    accessibilityLabel={`${option.label} absent`}
                    testID={`end-innings-absent-${option.id}`}
                  />
                  {absent.has(option.id) ? (
                    <ListRow
                      title="Absent hurt"
                      compact
                      trailing={{ kind: 'switch', value: absent.get(option.id) ?? false, onValueChange: () => toggleHurt(option.id) }}
                      accessibilityLabel={`${option.label} absent hurt`}
                      testID={`end-innings-hurt-${option.id}`}
                    />
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </Sheet>
      <Dialog
        visible={visible && confirming}
        title={`End ${teamName}'s innings at ${scoreText}?`}
        message={reason === 'declared' ? 'The innings is declared closed.' : 'The innings ends because no more batters are available.'}
        confirm={{
          label: 'End innings',
          onPress: () => {
            setConfirming(false);
            onSubmit(intent());
          },
          testID: 'end-innings-confirm',
        }}
        cancel={{ label: 'Cancel', onPress: () => setConfirming(false) }}
        onRequestClose={() => setConfirming(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

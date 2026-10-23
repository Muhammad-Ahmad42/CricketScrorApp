import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlayerId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, Chip, ChoiceRow, Dialog, RadioList, Sheet, Text, space } from '@/ui';
import type { PlayerOption } from '../selectors/options';
import { useDiscardGuard } from '../hooks/useDiscardGuard';

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
  const guard = useDiscardGuard(reason !== 'declared' || absent.size > 0, onClose);

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
        visible={visible && !confirming && !guard.asking}
        title="End innings"
        onClose={guard.requestClose}
        testID="sheet-end-innings"
        footer={<Button label="End innings" size="lg" fullWidth onPress={() => setConfirming(true)} testID="end-innings-next" />}
      >
        <View style={styles.body}>
          <RadioList
            accessibilityLabel="Why the innings ends"
            value={reason}
            onChange={setReason}
            choices={[
              { value: 'declared', label: 'Declared', testID: 'end-innings-declared' },
              { value: 'batters_unavailable', label: 'No batters available', testID: 'end-innings-unavailable' },
            ]}
          />
          {reason === 'batters_unavailable' ? (
            <>
              <Text variant="subhead" tone="secondary">
                {"Who can't bat?"}
              </Text>
              <View>
                {yetToBat.map((option, index) => {
                  const marked = absent.has(option.id);
                  return (
                    <ChoiceRow
                      key={option.id}
                      kind="checkbox"
                      label={option.label}
                      selected={marked}
                      onPress={() => toggle(option.id)}
                      accessibilityLabel={`${option.label} absent`}
                      separator={index < yetToBat.length - 1}
                      trailing={
                        marked ? (
                          <Chip
                            kind="checkbox"
                            label="Hurt"
                            selected={absent.get(option.id) ?? false}
                            onPress={() => toggleHurt(option.id)}
                            accessibilityLabel={`${option.label} absent hurt`}
                            testID={`end-innings-hurt-${option.id}`}
                          />
                        ) : undefined
                      }
                      testID={`end-innings-absent-${option.id}`}
                    />
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      </Sheet>
      <Dialog
        visible={visible && confirming}
        title={`End ${teamName}'s innings at ${scoreText}?`}
        message={reason === 'declared' ? 'Declared' : 'No batters available'}
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
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

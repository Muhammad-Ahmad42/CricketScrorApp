import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId, Toss, TossDecision } from '@/domain/types';
import { Button, RadioList, SegmentedControl, Sheet, Text, space } from '@/ui';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';

export interface TossSheetProps {
  readonly visible: boolean;
  readonly toss: Toss | null;
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly busy: boolean;
  readonly onSubmit: (toss: Toss | null) => void;
  readonly onClose: () => void;
}

const NOT_RECORDED = '__none__';

export function TossSheet({ visible, toss, teams, busy, onSubmit, onClose }: TossSheetProps) {
  const [winner, setWinner] = useState<TeamId | null>(toss?.winnerTeamId ?? null);
  const [decision, setDecision] = useState<TossDecision>(toss?.decision ?? 'bat');
  const guard = useDiscardGuard(winner !== (toss?.winnerTeamId ?? null) || (winner !== null && decision !== (toss?.decision ?? 'bat')), onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Toss"
        onClose={guard.requestClose}
        testID="sheet-toss"
        footer={
          <Button
            label="Save toss"
            size="lg"
            fullWidth
            loading={busy}
            onPress={() => onSubmit(winner === null ? null : { winnerTeamId: winner, decision })}
            testID="toss-save"
          />
        }
      >
        <View style={styles.body}>
          <RadioList
            accessibilityLabel="Toss won by"
            value={winner ?? NOT_RECORDED}
            onChange={(value) => setWinner(value === NOT_RECORDED ? null : value)}
            choices={[
              ...teams.map((team) => ({ value: team.id, label: team.name, testID: `toss-winner-${team.id}` })),
              { value: NOT_RECORDED, label: 'Toss not recorded', testID: 'toss-none' },
            ]}
          />
          {winner !== null ? (
            <>
              <Text variant="subhead" tone="secondary">
                Elected to
              </Text>
              <SegmentedControl
                options={[
                  { value: 'bat', label: 'Bat', testID: 'toss-bat' },
                  { value: 'bowl', label: 'Bowl', testID: 'toss-bowl' },
                ]}
                value={decision}
                onChange={setDecision}
                accessibilityLabel="Toss decision"
              />
            </>
          ) : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

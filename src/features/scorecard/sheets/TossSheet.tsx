import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId, Toss, TossDecision } from '@/domain/types';
import { Button, SegmentedControl, Sheet, Text, space } from '@/ui';
import { OptionButton } from '@/features/scoring/components/common/OptionButton';

export interface TossSheetProps {
  readonly visible: boolean;
  readonly toss: Toss | null;
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly busy: boolean;
  readonly onSubmit: (toss: Toss | null) => void;
  readonly onClose: () => void;
}

export function TossSheet({ visible, toss, teams, busy, onSubmit, onClose }: TossSheetProps) {
  const [winner, setWinner] = useState<TeamId | null>(toss?.winnerTeamId ?? null);
  const [decision, setDecision] = useState<TossDecision>(toss?.decision ?? 'bat');
  return (
    <Sheet
      visible={visible}
      title="Toss"
      onClose={onClose}
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
        {teams.map((team) => (
          <OptionButton key={team.id} label={team.name} selected={winner === team.id} onPress={() => setWinner(team.id)} testID={`toss-winner-${team.id}`} />
        ))}
        <OptionButton label="Toss not recorded" selected={winner === null} onPress={() => setWinner(null)} testID="toss-none" />
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
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

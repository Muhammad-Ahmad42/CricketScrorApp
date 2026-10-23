import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId, TieDecisionMethod } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, RadioList, Sheet, Text, space } from '@/ui';
import { TIE_METHOD_LABEL } from '../selectors/labels';

type Method = Exclude<TieDecisionMethod, 'super_over'>;

const METHODS: readonly Method[] = ['boundary_count', 'bowl_out', 'coin_toss', 'organizer'];

export interface DecideTieSheetProps {
  readonly visible: boolean;
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function DecideTieSheet({ visible, teams, onSubmit, onClose }: DecideTieSheetProps) {
  const [method, setMethod] = useState<Method>('boundary_count');
  const [winner, setWinner] = useState<TeamId | null>(null);
  return (
    <Sheet
      visible={visible}
      title="Decide the tie"
      onClose={onClose}
      testID="sheet-decide-tie"
      footer={
        <Button
          label="Record result"
          size="lg"
          fullWidth
          disabled={winner === null}
          onPress={() => {
            if (winner !== null) {
              onSubmit({ type: 'end_match', outcome: { type: 'tie_decided', method, winnerTeamId: winner } });
            }
          }}
          testID="decide-tie-submit"
        />
      }
    >
      <View style={styles.body}>
        <Text variant="subhead" tone="secondary">
          Decided by
        </Text>
        <RadioList
          accessibilityLabel="Decided by"
          value={method}
          onChange={setMethod}
          choices={METHODS.map((value) => ({ value, label: TIE_METHOD_LABEL[value], testID: `decide-tie-method-${value}` }))}
        />
        <Text variant="subhead" tone="secondary">
          Winner
        </Text>
        <RadioList
          accessibilityLabel="Winner"
          value={winner}
          onChange={setWinner}
          choices={teams.map((team) => ({ value: team.id, label: team.name, testID: `decide-tie-winner-${team.id}` }))}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

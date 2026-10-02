import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId, TieDecisionMethod } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, Sheet, Text, space } from '@/ui';
import { OptionButton } from '../components/common/OptionButton';
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
        <View style={styles.grid}>
          {METHODS.map((value) => (
            <View key={value} style={styles.cell}>
              <OptionButton
                label={TIE_METHOD_LABEL[value]}
                selected={method === value}
                compact
                onPress={() => setMethod(value)}
                testID={`decide-tie-method-${value}`}
              />
            </View>
          ))}
        </View>
        <Text variant="subhead" tone="secondary">
          Winner
        </Text>
        {teams.map((team) => (
          <OptionButton key={team.id} label={team.name} selected={winner === team.id} onPress={() => setWinner(team.id)} testID={`decide-tie-winner-${team.id}`} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { flexBasis: '48%', flexGrow: 1 },
});

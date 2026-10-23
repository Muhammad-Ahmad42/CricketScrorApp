import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MatchEndOutcome, TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, RadioList, Sheet, Text, space } from '@/ui';
import { isReasonValid, ReasonField } from '../components/common/ReasonField';
import { useDiscardGuard } from '../hooks/useDiscardGuard';

type Kind = 'abandoned' | 'no_result' | 'awarded';

const KINDS: readonly { readonly value: Kind; readonly label: string; readonly detail?: string }[] = [
  { value: 'abandoned', label: 'Abandoned', detail: "Play stopped and won't resume" },
  { value: 'no_result', label: 'No result', detail: 'Too little play for a result' },
  { value: 'awarded', label: 'Awarded' },
];

const NO_WINNER = '__none__';

export interface EndMatchSheetProps {
  readonly visible: boolean;
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly inTournament: boolean;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function endOutcome(kind: Kind, reason: string, winner: TeamId | null): MatchEndOutcome {
  const text = reason.trim();
  switch (kind) {
    case 'abandoned':
      return { type: 'abandoned', reason: text === '' ? null : text };
    case 'no_result':
      return { type: 'no_result', reason: text === '' ? null : text };
    case 'awarded':
      return { type: 'awarded', winnerTeamId: winner, reason: text, margin: null };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function EndMatchSheet({ visible, teams, inTournament, onSubmit, onClose }: EndMatchSheetProps) {
  const [kind, setKind] = useState<Kind>('abandoned');
  const [winner, setWinner] = useState<TeamId | null>(null);
  const [reason, setReason] = useState('');
  const reasonRequired = kind === 'awarded' || inTournament;
  const valid = !reasonRequired || isReasonValid(reason);
  const guard = useDiscardGuard(reason.trim() !== '', onClose);
  const submit = () => {
    if (valid) {
      onSubmit({ type: 'end_match', outcome: endOutcome(kind, reason, winner) });
    }
  };
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="End match"
        onClose={guard.requestClose}
        testID="sheet-end-match"
        footer={
          <Button
            label="End match"
            variant="destructiveConfirm"
            size="lg"
            fullWidth
            disabled={!valid}
            onPress={submit}
            testID="end-match-submit"
          />
        }
      >
        <View style={styles.body}>
          <RadioList
            accessibilityLabel="How the match ends"
            value={kind}
            onChange={setKind}
            choices={KINDS.map((entry) => ({ value: entry.value, label: entry.label, description: entry.detail, testID: `end-match-kind-${entry.value}` }))}
          />
          {kind === 'awarded' ? (
            <>
              <Text variant="subhead" tone="secondary">
                Awarded to
              </Text>
              <RadioList
                accessibilityLabel="Awarded to"
                value={winner ?? NO_WINNER}
                onChange={(value) => setWinner(value === NO_WINNER ? null : value)}
                choices={[
                  ...teams.map((team) => ({ value: team.id, label: team.name, testID: `end-match-winner-${team.id}` })),
                  { value: NO_WINNER, label: 'No winner', testID: 'end-match-winner-none' },
                ]}
              />
            </>
          ) : null}
          <ReasonField value={reason} onChange={setReason} required={reasonRequired} returnKeyType="done" submitBehavior="blurAndSubmit" testID="end-match-reason" />
          {inTournament ? (
            <Text variant="footnote" tone="secondary">
              Counts in the standings straight away
            </Text>
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

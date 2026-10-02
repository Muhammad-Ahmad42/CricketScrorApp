import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MatchEndOutcome, TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, Sheet, Text, space } from '@/ui';
import { OptionButton } from '../components/common/OptionButton';
import { isReasonValid, ReasonField } from '../components/common/ReasonField';

type Kind = 'abandoned' | 'no_result' | 'awarded';

const KINDS: readonly { readonly value: Kind; readonly label: string; readonly detail: string }[] = [
  { value: 'abandoned', label: 'Abandoned', detail: 'Play stopped and the match will not finish.' },
  { value: 'no_result', label: 'No result', detail: 'Play happened but no result is possible.' },
  { value: 'awarded', label: 'Awarded', detail: 'The organizer awards the match.' },
];

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
  return (
    <Sheet
      visible={visible}
      title="End match"
      onClose={onClose}
      testID="sheet-end-match"
      footer={
        <Button
          label="End match"
          variant="destructiveConfirm"
          size="lg"
          fullWidth
          disabled={!valid}
          onPress={() => onSubmit({ type: 'end_match', outcome: endOutcome(kind, reason, winner) })}
          testID="end-match-submit"
        />
      }
    >
      <View style={styles.body}>
        {KINDS.map((entry) => (
          <OptionButton
            key={entry.value}
            label={entry.label}
            detail={entry.detail}
            selected={kind === entry.value}
            onPress={() => setKind(entry.value)}
            testID={`end-match-kind-${entry.value}`}
          />
        ))}
        {kind === 'awarded' ? (
          <>
            <Text variant="subhead" tone="secondary">
              Awarded to
            </Text>
            {teams.map((team) => (
              <OptionButton
                key={team.id}
                label={team.name}
                compact
                selected={winner === team.id}
                onPress={() => setWinner(team.id)}
                testID={`end-match-winner-${team.id}`}
              />
            ))}
            <OptionButton label="No winner" compact selected={winner === null} onPress={() => setWinner(null)} testID="end-match-winner-none" />
          </>
        ) : null}
        <ReasonField value={reason} onChange={setReason} required={reasonRequired} testID="end-match-reason" />
        {inTournament ? (
          <Text variant="footnote" tone="secondary">
            The result counts in the tournament standings as soon as it is recorded.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, SegmentedControl, Sheet, Stepper, Text, space } from '@/ui';
import { isReasonValid, ReasonField } from '../components/common/ReasonField';
import { useDiscardGuard } from '../hooks/useDiscardGuard';

export interface PenaltySheetProps {
  readonly visible: boolean;
  readonly teams: readonly { readonly id: TeamId; readonly name: string; readonly shortName: string }[];
  readonly defaultTeamId: TeamId;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function PenaltySheet({ visible, teams, defaultTeamId, onSubmit, onClose }: PenaltySheetProps) {
  const [teamId, setTeamId] = useState<TeamId>(defaultTeamId);
  const [runs, setRuns] = useState(5);
  const [reason, setReason] = useState('');
  const valid = isReasonValid(reason) && runs > 0;
  const guard = useDiscardGuard(reason.trim() !== '', onClose);
  const submit = () => {
    if (valid) {
      onSubmit({ type: 'penalty', teamId, runs, reason: reason.trim() });
    }
  };
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Penalty runs"
        onClose={guard.requestClose}
        testID="sheet-penalty"
        footer={
          <Button
            label="Record penalty"
            size="lg"
            fullWidth
            disabled={!valid}
            onPress={submit}
            testID="penalty-submit"
          />
        }
      >
        <View style={styles.body}>
          <Text variant="subhead" tone="secondary">
            Awarded to
          </Text>
          <SegmentedControl
            options={teams.map((team) => ({ value: team.id, label: team.shortName, accessibilityLabel: team.name, testID: `penalty-team-${team.id}` }))}
            value={teamId}
            onChange={setTeamId}
            accessibilityLabel="Team awarded the penalty"
          />
          <Stepper label="Penalty runs" value={runs} min={1} max={20} onChange={setRuns} testID="penalty-runs" />
          <ReasonField value={reason} onChange={setReason} required returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={submit} testID="penalty-reason" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

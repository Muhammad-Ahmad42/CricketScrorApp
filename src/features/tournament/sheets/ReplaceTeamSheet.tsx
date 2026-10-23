import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { Button, ChoiceRow, RadioList, Sheet, Text, space, type ChoiceOption } from '@/ui';
import type { PickerOption } from './PickerSheet';

export type PriorResultsPolicy = 'transfer_to_replacement' | 'keep_for_opponents' | 'expunge';

export interface ReplaceTeamSubmit {
  readonly inTeamId: string;
  readonly priorResults: PriorResultsPolicy;
}

export interface ReplaceTeamSheetProps {
  readonly visible: boolean;
  readonly outName: string;
  readonly candidates: readonly PickerOption[];
  readonly busy?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (value: ReplaceTeamSubmit) => void;
}

const POLICY_CHOICES: readonly ChoiceOption<PriorResultsPolicy>[] = [
  { value: 'transfer_to_replacement', label: 'Transfer to the new team', testID: 'replace-chip-transfer' },
  { value: 'keep_for_opponents', label: 'Keep for opponents', description: 'New team starts at zero', testID: 'replace-chip-keep' },
  { value: 'expunge', label: 'Remove from tables', testID: 'replace-chip-expunge' },
];

export function ReplaceTeamSheet({ visible, outName, candidates, busy = false, onClose, onSubmit }: ReplaceTeamSheetProps) {
  const window = useWindowDimensions();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PriorResultsPolicy>('transfer_to_replacement');
  const guard = useDiscardGuard(teamId !== null || policy !== 'transfer_to_replacement', onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Replace team"
        subtitle={outName}
        onClose={guard.requestClose}
        scrollable={false}
        testID="sheet-replace-team"
        footer={
          <Button
            label="Review changes"
            onPress={() => {
              if (teamId) {
                onSubmit({ inTeamId: teamId, priorResults: policy });
              }
            }}
            disabled={teamId === null}
            loading={busy}
            fullWidth
            testID="replace-btn-review"
          />
        }
      >
        <View style={styles.body}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {`${outName}'s results`}
          </Text>
          <RadioList choices={POLICY_CHOICES} value={policy} onChange={setPolicy} accessibilityLabel={`What happens to ${outName}'s results`} />
          <Text variant="label" tone="secondary" accessibilityRole="header">
            New team
          </Text>
          {candidates.length === 0 ? (
            <Text variant="callout" tone="secondary">
              No other teams in your library
            </Text>
          ) : (
            <FlatList
              data={candidates}
              keyExtractor={(option) => option.key}
              style={{ maxHeight: window.height * 0.3 }}
              accessibilityRole="radiogroup"
              accessibilityLabel="New team"
              renderItem={({ item, index }) => (
                <ChoiceRow
                  kind="radio"
                  label={item.title}
                  meta={item.subtitle}
                  selected={item.key === teamId}
                  onPress={() => setTeamId(item.key)}
                  separator={index < candidates.length - 1}
                  testID={`replace-row-team-${index + 1}`}
                />
              )}
            />
          )}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

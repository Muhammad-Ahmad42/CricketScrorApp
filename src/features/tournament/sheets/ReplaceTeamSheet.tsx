import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ChoiceList, type Choice } from '@/features/shared';
import { Button, ListRow, Sheet, Text, space } from '@/ui';
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

function policyChoices(outName: string): readonly Choice<PriorResultsPolicy>[] {
  return [
    {
      value: 'transfer_to_replacement',
      label: 'Transfer to the new team',
      description: `The new team takes over ${outName}'s played results.`,
      testID: 'replace-chip-transfer',
    },
    {
      value: 'keep_for_opponents',
      label: 'Keep for opponents',
      description: `${outName} stays in the table as replaced; the new team starts at zero.`,
      testID: 'replace-chip-keep',
    },
    {
      value: 'expunge',
      label: 'Remove them',
      description: `Every result involving ${outName} is expunged.`,
      testID: 'replace-chip-expunge',
    },
  ];
}

export function ReplaceTeamSheet({ visible, outName, candidates, busy = false, onClose, onSubmit }: ReplaceTeamSheetProps) {
  const window = useWindowDimensions();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PriorResultsPolicy>('transfer_to_replacement');
  return (
    <Sheet
      visible={visible}
      title={`Replace ${outName}`}
      onClose={onClose}
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
          {`What happens to ${outName}'s results?`}
        </Text>
        <ChoiceList choices={policyChoices(outName)} value={policy} onChange={setPolicy} accessibilityLabel="Results policy" />
        <Text variant="label" tone="secondary" accessibilityRole="header">
          New team
        </Text>
        {candidates.length === 0 ? (
          <Text variant="callout" tone="secondary">
            Every team in your library is already in this tournament. Add a team in the team library first.
          </Text>
        ) : (
          <FlatList
            data={candidates}
            keyExtractor={(option) => option.key}
            style={{ maxHeight: window.height * 0.3 }}
            renderItem={({ item, index }) => (
              <ListRow
                title={item.title}
                subtitle={item.subtitle}
                trailing={item.key === teamId ? { kind: 'badge', badge: { label: 'Selected', tone: 'qualified' } } : undefined}
                onPress={() => setTeamId(item.key)}
                accessibilityLabel={item.key === teamId ? `${item.title}, selected` : item.title}
                testID={`replace-row-team-${index + 1}`}
              />
            )}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

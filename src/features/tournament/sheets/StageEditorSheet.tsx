import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SeedingMethod, Stage } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { Button, IconButton, ListRow, SegmentedControl, Separator, Sheet, Stepper, Text, TextField, space } from '@/ui';
import { SEEDING_LABEL } from '../labels';
import { topPerPoolCount, withStageConfig, withTopPerPool } from '../wizard/structure';

export interface StageEditorResult {
  readonly stage: Stage;
  readonly poolCount: number | null;
}

export interface StageEditorSheetProps {
  readonly visible: boolean;
  readonly stage: Stage;
  readonly poolCount: number;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canDelete: boolean;
  readonly onClose: () => void;
  readonly onSave: (result: StageEditorResult) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onDelete: () => void;
}

const LEGS = ['1', '2', '3'] as const;

export function StageEditorSheet({ visible, stage, poolCount, canMoveUp, canMoveDown, canDelete, onClose, onSave, onMove, onDelete }: StageEditorSheetProps) {
  const [draft, setDraft] = useState<Stage>(stage);
  const [pools, setPools] = useState(poolCount);
  const hasPools = poolCount > 0;
  const roundRobin = draft.config.fixtureGeneration.method === 'round_robin';
  const knockout = draft.type === 'knockout';
  const perPool = topPerPoolCount(draft);
  const knockoutConfig = draft.config.knockout;
  const guard = useDiscardGuard(JSON.stringify(draft) !== JSON.stringify(stage) || pools !== poolCount, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={stage.name}
        onClose={guard.requestClose}
        testID="sheet-stage-editor"
        footer={
          <Button
            label="Save stage"
            disabled={draft.name.trim().length === 0}
            onPress={() => onSave({ stage: { ...draft, name: draft.name.trim() }, poolCount: hasPools ? pools : null })}
            fullWidth
            testID="stage-btn-save"
          />
        }
      >
        <View style={styles.body}>
          <TextField label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} returnKeyType="done" testID="stage-input-name" />
          {hasPools ? <Stepper label="Pools" value={pools} onChange={setPools} min={1} max={64} testID="stage-input-pools" /> : null}
          {roundRobin ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary">
                Matches against each opponent
              </Text>
              <SegmentedControl
                options={LEGS.map((legs) => ({ value: legs, label: legs === '1' ? 'Once' : legs === '2' ? 'Twice' : '3 times', testID: `stage-chip-legs-${legs}` }))}
                value={String(Math.min(3, draft.config.fixtureGeneration.legs)) as (typeof LEGS)[number]}
                onChange={(legs) => setDraft(withStageConfig(draft, { fixtureGeneration: { ...draft.config.fixtureGeneration, legs: Number(legs) } }))}
                accessibilityLabel="Matches against each opponent"
              />
            </View>
          ) : null}
          {perPool !== null ? (
            <Stepper label="Qualifiers from each pool" value={perPool} onChange={(count) => setDraft(withTopPerPool(draft, count))} min={1} max={8} testID="stage-input-qualifiers" />
          ) : null}
          {knockout && knockoutConfig ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary">
                Bracket draw
              </Text>
              <SegmentedControl
                options={(['fixed', 'random', 'ranking'] as const).map((value) => ({ value, label: SEEDING_LABEL[value], testID: `stage-chip-seeding-${value}` }))}
                value={draft.config.seeding}
                onChange={(seeding: SeedingMethod) => setDraft(withStageConfig(draft, { seeding }))}
                accessibilityLabel="Bracket draw"
              />
              <ListRow
                title="Third-place play-off"
                trailing={{
                  kind: 'switch',
                  value: knockoutConfig.thirdPlacePlayoff,
                  onValueChange: (thirdPlacePlayoff) => setDraft(withStageConfig(draft, { knockout: { ...knockoutConfig, thirdPlacePlayoff } })),
                }}
                testID="stage-toggle-third-place"
              />
            </View>
          ) : null}
          <ListRow
            title="Decides the champion"
            trailing={{ kind: 'switch', value: draft.config.decidesChampion, onValueChange: (decidesChampion) => setDraft(withStageConfig(draft, { decidesChampion })) }}
            testID="stage-toggle-champion"
          />
          <View style={styles.actions}>
            <Text variant="subhead" tone="secondary" style={styles.orderLabel}>
              Order
            </Text>
            <IconButton icon="chevron-up" accessibilityLabel="Move stage up" disabled={!canMoveUp} onPress={() => onMove(-1)} testID="stage-btn-up" />
            <IconButton icon="chevron-down" accessibilityLabel="Move stage down" disabled={!canMoveDown} onPress={() => onMove(1)} testID="stage-btn-down" />
          </View>
          {canDelete ? (
            <View style={styles.danger}>
              <Separator />
              <View style={styles.deleteRow}>
                <Button label="Delete stage" variant="destructive" size="sm" icon="trash-2" onPress={onDelete} testID="stage-btn-delete" />
              </View>
            </View>
          ) : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  group: { gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  orderLabel: { flex: 1 },
  danger: { gap: space.sm, marginTop: space.xs },
  deleteRow: { flexDirection: 'row' },
});

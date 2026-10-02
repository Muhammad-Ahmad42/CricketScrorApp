import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StageId } from '@/domain/types';
import { ChoiceList, ReasonField, reasonReady, type Choice } from '@/features/shared';
import { Button, SegmentedControl, Sheet, Stepper, Text, space } from '@/ui';
import { overrideNeedsSlot, type OverrideAction } from '../selectors/overrides';
import type { OverrideTargetVM } from '../selectors/qualification';

export interface OverrideSubmit {
  readonly action: OverrideAction;
  readonly targetStageId: StageId | null;
  readonly slotId: string | null;
  readonly points: number;
  readonly reason: string;
}

export interface OverrideSheetProps {
  readonly visible: boolean;
  readonly teamName: string;
  readonly targets: readonly OverrideTargetVM[];
  readonly busy?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (value: OverrideSubmit) => void;
}

function actionChoices(target: OverrideTargetVM | null): readonly Choice<OverrideAction>[] {
  const points: Choice<OverrideAction> = {
    value: 'points',
    label: 'Adjust points…',
    description: 'Add or deduct points in this stage.',
    testID: 'override-chip-points',
  };
  if (target === null) {
    return [points];
  }
  return [
    {
      value: 'qualify',
      label: 'Qualify',
      description: `Put this team into a slot of the ${target.name}, displacing the automatic occupant.`,
      testID: 'override-chip-qualify',
    },
    {
      value: 'eliminate',
      label: 'Eliminate',
      description: `Keep this team out of the ${target.name}; the next eligible team moves up.`,
      testID: 'override-chip-eliminate',
    },
    {
      value: 'reassign',
      label: 'Reassign to slot…',
      description: `Move this team to a different slot of the ${target.name}.`,
      testID: 'override-chip-reassign',
    },
    points,
  ];
}

export function OverrideSheet({ visible, teamName, targets, busy = false, onClose, onSubmit }: OverrideSheetProps) {
  const [targetId, setTargetId] = useState<StageId | null>(targets[0]?.stageId ?? null);
  const target = targets.find((candidate) => candidate.stageId === targetId) ?? null;
  const [action, setAction] = useState<OverrideAction>(target ? 'qualify' : 'points');
  const [slotId, setSlotId] = useState<string | null>(null);
  const [points, setPoints] = useState(-2);
  const [reason, setReason] = useState('');
  const needsSlot = overrideNeedsSlot(action);
  const slotChosen = target !== null && target.slots.some((slot) => slot.id === slotId);
  const ready = reasonReady(reason) && (!needsSlot || slotChosen) && (action !== 'points' || points !== 0);
  return (
    <Sheet
      visible={visible}
      title={`Manual Override · ${teamName}`}
      subtitle="Overrides are marked Manual Override and recorded in the audit log."
      onClose={onClose}
      testID="sheet-override"
      footer={
        <Button
          label="Review changes"
          onPress={() =>
            onSubmit({
              action,
              targetStageId: action === 'points' ? null : targetId,
              slotId: needsSlot ? slotId : null,
              points,
              reason: reason.trim(),
            })
          }
          disabled={!ready}
          loading={busy}
          fullWidth
          accessibilityHint={reasonReady(reason) ? undefined : 'Type a reason first'}
          testID="override-btn-apply"
        />
      }
    >
      <View style={styles.body}>
        {targets.length > 1 ? (
          <SegmentedControl
            options={targets.map((candidate) => ({ value: candidate.stageId, label: candidate.name }))}
            value={targetId ?? targets[0].stageId}
            onChange={(next) => {
              setTargetId(next);
              setSlotId(null);
            }}
            accessibilityLabel="Qualification for"
          />
        ) : null}
        <ChoiceList choices={actionChoices(target)} value={action} onChange={setAction} accessibilityLabel="Override" />
        {needsSlot && target ? (
          <View style={styles.group}>
            <Text variant="label" tone="secondary" accessibilityRole="header">
              {`Slot in the ${target.name}`}
            </Text>
            <ChoiceList
              choices={target.slots.map((slot) => ({ value: slot.id, label: slot.label, testID: `override-chip-slot-${slot.index + 1}` }))}
              value={slotId}
              onChange={setSlotId}
              accessibilityLabel="Slot"
            />
          </View>
        ) : null}
        {action === 'points' ? (
          <Stepper
            label="Points adjustment"
            value={points}
            onChange={setPoints}
            min={-20}
            max={20}
            formatValue={(value) => (value > 0 ? `+${value}` : String(value))}
            testID="override-input-points"
          />
        ) : null}
        <ReasonField required value={reason} onChange={setReason} testID="override-input-reason" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  group: { gap: space.xs },
});

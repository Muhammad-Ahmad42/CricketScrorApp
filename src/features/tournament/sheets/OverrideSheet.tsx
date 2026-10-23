import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StageId } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { MANUAL_OVERRIDE_LABEL, ReasonField, REASON_HINT, reasonReady } from '@/features/shared';
import { Button, RadioList, SegmentedControl, Sheet, Stepper, Text, space, type ChoiceOption } from '@/ui';
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

function actionChoices(target: OverrideTargetVM | null): readonly ChoiceOption<OverrideAction>[] {
  const points: ChoiceOption<OverrideAction> = {
    value: 'points',
    label: 'Adjust points…',
    testID: 'override-chip-points',
  };
  if (target === null) {
    return [points];
  }
  return [
    {
      value: 'qualify',
      label: 'Qualify',
      description: `Into the ${target.name}, replacing the automatic team`,
      testID: 'override-chip-qualify',
    },
    {
      value: 'eliminate',
      label: 'Eliminate',
      description: `Out of the ${target.name}; the next team moves up`,
      testID: 'override-chip-eliminate',
    },
    {
      value: 'reassign',
      label: 'Reassign to slot…',
      description: `Another slot in the ${target.name}`,
      testID: 'override-chip-reassign',
    },
    points,
  ];
}

const DEFAULT_POINTS = -2;

export function OverrideSheet({ visible, teamName, targets, busy = false, onClose, onSubmit }: OverrideSheetProps) {
  const initialTarget = targets[0]?.stageId ?? null;
  const initialAction: OverrideAction = initialTarget !== null ? 'qualify' : 'points';
  const [targetId, setTargetId] = useState<StageId | null>(initialTarget);
  const target = targets.find((candidate) => candidate.stageId === targetId) ?? null;
  const [action, setAction] = useState<OverrideAction>(initialAction);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [points, setPoints] = useState(DEFAULT_POINTS);
  const [reason, setReason] = useState('');
  const dirty = reason.trim() !== '' || targetId !== initialTarget || action !== initialAction || slotId !== null || points !== DEFAULT_POINTS;
  const guard = useDiscardGuard(dirty, onClose);
  const needsSlot = overrideNeedsSlot(action);
  const slotChosen = target !== null && target.slots.some((slot) => slot.id === slotId);
  const ready = reasonReady(reason) && (!needsSlot || slotChosen) && (action !== 'points' || points !== 0);
  const hint = ready
    ? null
    : needsSlot && !slotChosen
      ? 'Choose a slot, then add a reason.'
      : action === 'points' && points === 0
        ? 'Set an adjustment other than 0.'
        : REASON_HINT;
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={MANUAL_OVERRIDE_LABEL}
        subtitle={teamName}
        onClose={guard.requestClose}
        testID="sheet-override"
        footer={
          <View style={styles.footer}>
            {hint && hint !== REASON_HINT ? (
              <Text variant="footnote" tone="secondary" testID="override-text-hint">
                {hint}
              </Text>
            ) : null}
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
              accessibilityHint={hint ?? undefined}
              testID="override-btn-apply"
            />
          </View>
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
          <RadioList choices={actionChoices(target)} value={action} onChange={setAction} accessibilityLabel="Override" />
          {needsSlot && target ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                {`Slot in the ${target.name}`}
              </Text>
              <RadioList
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
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space.xs },
  body: { gap: space.md },
  group: { gap: space.xs },
});

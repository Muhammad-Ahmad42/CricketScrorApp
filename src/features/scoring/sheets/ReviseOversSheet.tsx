import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, ListRow, Sheet, Stepper, Text, TextField, space } from '@/ui';
import { isReasonValid, ReasonField } from '../components/common/ReasonField';
import type { ReviseOversTarget } from '../selectors/options';

export interface ReviseOversSheetProps {
  readonly visible: boolean;
  readonly target: ReviseOversTarget;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

export function parseWhole(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function targetFromPar(par: number): number {
  return par + 1;
}

export function ReviseOversSheet({ visible, target, onSubmit, onClose }: ReviseOversSheetProps) {
  const [overs, setOvers] = useState(target.currentOvers);
  const [both, setBoth] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [bowlerText, setBowlerText] = useState(target.maxOversPerBowler === null ? '' : `${target.maxOversPerBowler}`);
  const [reason, setReason] = useState('');

  const typedTarget = parseWhole(targetText);
  const bowlerMax = parseWhole(bowlerText);
  const targetOk = !terminal || typedTarget !== null;
  const valid = isReasonValid(reason) && targetOk && overs >= 1;

  const submit = () => {
    if (!valid) {
      return;
    }
    const common = { type: 'revise_overs' as const, inningsIndex: target.inningsIndex, reason: reason.trim() };
    const bowler = bowlerMax === null ? {} : { maxOversPerBowler: bowlerMax };
    if (terminal && typedTarget !== null) {
      onSubmit({ ...common, balls: target.ballsBowled, target: targetFromPar(typedTarget), terminal: true });
      return;
    }
    onSubmit({
      ...common,
      overs,
      ...bowler,
      ...(target.isChase && typedTarget !== null ? { target: typedTarget } : {}),
      ...(both ? { scope: 'both_innings' as const } : {}),
    });
  };

  return (
    <Sheet
      visible={visible}
      title="Revise overs"
      subtitle={`${target.label} · currently ${target.currentLimit}`}
      onClose={onClose}
      testID="sheet-revise"
      footer={<Button label="Apply revision" size="lg" fullWidth disabled={!valid} onPress={submit} testID="revise-submit" />}
    >
      <View style={styles.body}>
        {target.isChase ? (
          <ListRow
            title="Chase ends here: decide on par score"
            subtitle="Use when no more play is possible."
            trailing={{ kind: 'switch', value: terminal, onValueChange: setTerminal }}
            testID="revise-terminal"
          />
        ) : null}
        {terminal ? (
          <>
            <TextField label="Par score" value={targetText} onChangeText={setTargetText} numeric testID="revise-par" />
            <Text variant="footnote" tone="secondary">
              {"Par is the score the chasing team needed at this point (for example from DLS tables). Scorebook doesn't calculate DLS. The chasing side wins by beating par."}
            </Text>
          </>
        ) : (
          <>
            <Stepper label="New overs" value={overs} min={1} max={999} onChange={setOvers} testID="revise-overs" />
            {target.canApplyToBoth ? (
              <ListRow
                title="Apply to both innings"
                trailing={{ kind: 'switch', value: both, onValueChange: setBoth }}
                testID="revise-both"
              />
            ) : null}
            {target.isChase ? (
              <TextField
                label="Revised target (optional)"
                value={targetText}
                onChangeText={setTargetText}
                numeric
                helper="Leave empty to keep the target."
                testID="revise-target"
              />
            ) : null}
            <TextField
              label="Max overs per bowler (optional)"
              value={bowlerText}
              onChangeText={setBowlerText}
              numeric
              helper="Leave empty for no limit change."
              testID="revise-bowler-max"
            />
          </>
        )}
        <ReasonField value={reason} onChange={setReason} required placeholder="For example: rain delay" testID="revise-reason" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

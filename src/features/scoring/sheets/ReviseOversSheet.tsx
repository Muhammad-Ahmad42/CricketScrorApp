import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, ListRow, Sheet, Stepper, TextField, space, useFormChain } from '@/ui';
import { isReasonValid, ReasonField } from '../components/common/ReasonField';
import type { ReviseOversTarget } from '../selectors/options';
import { useDiscardGuard } from '../hooks/useDiscardGuard';

export interface ReviseOversSheetProps {
  readonly visible: boolean;
  readonly target: ReviseOversTarget;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

type ReviseField = 'par' | 'target' | 'bowler' | 'reason';

const TERMINAL_FIELDS: readonly ReviseField[] = ['par', 'reason'];
const REVISE_FIELDS: readonly ReviseField[] = ['target', 'bowler', 'reason'];

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
  const chain = useFormChain<ReviseField>(terminal ? TERMINAL_FIELDS : REVISE_FIELDS, {
    skip: (key) => key === 'target' && !target.isChase,
    onSubmit: () => submit(),
  });

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

  const initialBowler = target.maxOversPerBowler === null ? '' : `${target.maxOversPerBowler}`;
  const guard = useDiscardGuard(reason.trim() !== '' || targetText.trim() !== '' || bowlerText.trim() !== initialBowler, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Revise overs"
        subtitle={`${target.label} · currently ${target.currentLimit}`}
        onClose={guard.requestClose}
        testID="sheet-revise"
        footer={<Button label="Apply revision" size="lg" fullWidth disabled={!valid} onPress={submit} testID="revise-submit" />}
      >
        <View style={styles.body}>
          {target.isChase ? (
            <ListRow
              title="End the chase on par"
              subtitle="When no more play is possible"
              trailing={{ kind: 'switch', value: terminal, onValueChange: setTerminal }}
              testID="revise-terminal"
            />
          ) : null}
          {terminal ? (
            <TextField
              {...chain.field('par')}
              label="Par score"
              value={targetText}
              onChangeText={setTargetText}
              numeric
              maxLength={4}
              helper="From DLS tables · beat par to win"
              testID="revise-par"
            />
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
                  {...chain.field('target')}
                  label="Revised target (optional)"
                  value={targetText}
                  onChangeText={setTargetText}
                  numeric
                  maxLength={4}
                  testID="revise-target"
                />
              ) : null}
              <TextField
                {...chain.field('bowler')}
                label="Max overs per bowler (optional)"
                value={bowlerText}
                onChangeText={setBowlerText}
                numeric
                maxLength={3}
                testID="revise-bowler-max"
              />
            </>
          )}
          <ReasonField {...chain.field('reason')} value={reason} onChange={setReason} required placeholder="e.g. rain delay" testID="revise-reason" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

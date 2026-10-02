import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { HistoryEditPreview } from '@/services/contracts';
import { scoreRuns, type ScoringIntent } from '@/domain/scoring/commands';
import type { HistoryEditOp } from '@/domain/scoring/history';
import { BallChip, Banner, Button, Dialog, EmptyState, ScoringPad, Screen, SectionHeader, Text, space } from '@/ui';
import { useLiveMatchStore, useSettingsStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { InsetBody } from '@/features/scoring/components/common/InsetBody';
import { isReasonValid, ReasonField } from '@/features/scoring/components/common/ReasonField';
import { leaveMatch, MatchGate } from '@/features/scoring/screens/MatchGate';
import { selectWicketOptions } from '@/features/scoring/selectors/options';
import { teamName } from '@/features/scoring/selectors/names';
import { chipOf } from '@/features/scoring/selectors/scoreboard';
import { ExtrasSheet } from '@/features/scoring/sheets/ExtrasSheet';
import { WicketSheet } from '@/features/scoring/sheets/WicketSheet';
import { WhatWillChange } from '../components/WhatWillChange';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { describeBall, findEditTarget, planEdit, selectEditPreview, type EditChoice } from '../selectors/historyEdit';

export interface EditBallScreenProps {
  readonly seq: number;
}

type Mode = 'replace' | 'insert_before';

interface Previewed {
  readonly ops: readonly HistoryEditOp[];
  readonly notes: readonly string[];
  readonly preview: HistoryEditPreview;
}

function EditBallBody({ seq }: EditBallScreenProps) {
  const live = useLiveMatchStore((s) => s.live);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const [mode, setMode] = useState<Mode>('replace');
  const [sheet, setSheet] = useState<'extras' | 'wicket' | null>(null);
  const [previewed, setPreviewed] = useState<Previewed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [lastChoice, setLastChoice] = useState<EditChoice | null>(null);
  const request = useRef(0);
  const flight = useSingleFlight();
  const target = useMemo(() => (live === null ? null : findEditTarget(live.setup, live.events, live.state, seq)), [live, seq]);

  if (live === null) {
    return null;
  }
  const label = target?.ball?.label ?? `${seq}`;
  if (target === null) {
    return (
      <Screen testID="screen-edit" scroll={false} header={<TopBar title="Edit ball" onBack={leaveMatch} />}>
        <InsetBody>
          <EmptyState title="This entry can't be edited here" body="Only deliveries can be changed from the ball log." testID="edit-not-delivery" />
        </InsetBody>
      </Screen>
    );
  }
  const { setup } = live;
  const preview = previewed?.preview ?? null;
  const ops = previewed?.ops ?? null;
  const notes = previewed?.notes ?? [];
  const vm = preview === null ? null : selectEditPreview(setup, preview, dotStyle);
  const wicketOptions = selectWicketOptions(setup, target.priorState);
  const requiresReason = preview?.requiresReason ?? false;
  const blocked = preview?.impact?.blocked ?? null;
  const canApply = ops !== null && preview !== null && blocked === null && (!requiresReason || isReasonValid(reason)) && !busy;
  const isLiveMatch = live.state.lifecycle === 'live' || live.state.lifecycle === 'paused';

  const choose = async (choice: EditChoice) => {
    request.current += 1;
    const ticket = request.current;
    setLastChoice(choice);
    setPreviewed(null);
    const next = planEdit(setup, live.events, target, choice);
    if (!next.ok) {
      setError(next.message);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await useLiveMatchStore.getState().previewHistoryEdit(next.ops);
    if (ticket !== request.current) {
      return;
    }
    setBusy(false);
    if (result === null) {
      const failure = useLiveMatchStore.getState().error;
      useLiveMatchStore.getState().clearError();
      setError(failure?.message ?? "This change can't be applied.");
      return;
    }
    setPreviewed({ ops: next.ops, notes: next.notes, preview: result });
  };
  const pick = (intent: ScoringIntent) => {
    setSheet(null);
    void choose({ kind: mode, intent });
  };
  const apply = async () => {
    if (ops === null || preview === null) {
      return;
    }
    setBusy(true);
    const text = reason.trim();
    const ok = await useLiveMatchStore.getState().applyHistoryEdit(ops, text === '' ? null : text, preview);
    setBusy(false);
    if (ok) {
      useToastStore.getState().show({ kind: 'success', message: `Ball ${label} changed`, action: null });
      router.back();
      return;
    }
    const failure = useLiveMatchStore.getState().error;
    useLiveMatchStore.getState().clearError();
    if (failure?.code === 'CONFLICT') {
      setConflict(true);
      return;
    }
    setError(failure?.message ?? "Couldn't apply the change. Nothing was changed.");
  };

  return (
    <Screen testID="screen-edit" header={<TopBar title={`Edit ball ${label}`} onBack={leaveMatch} />}>
      {isLiveMatch ? <Banner tone="info" message="This match is live. The change is recorded in the match's audit log." /> : null}
      <SectionHeader title="Recorded" />
      <View style={styles.recorded} testID="edit-recorded">
        {target.ball !== null ? (
          <BallChip
            text={chipOf(target.ball.token, dotStyle).text}
            kind={target.ball.token.kind}
            isFreeHit={target.ball.token.isFreeHit}
            accessibilityLabel={target.ball.token.accessibilityLabel}
          />
        ) : null}
        <Text variant="body" style={styles.flex}>
          {describeBall(setup, target.ball, target.event)}
        </Text>
      </View>
      <SectionHeader title={mode === 'replace' ? 'Change to' : `Insert a ball before ${label}`} />
      <ScoringPad
        onRuns={(runs) => void choose({ kind: mode, intent: scoreRuns(runs) })}
        onExtras={() => setSheet('extras')}
        onWicket={() => setSheet('wicket')}
        dotStyle={dotStyle}
        bottomInset={false}
        testIDPrefix="edit-btn"
      />
      <View style={styles.actions}>
        <Button label="Delete this ball" icon="trash-2" variant="tertiary" size="sm" onPress={() => void choose({ kind: 'delete' })} testID="edit-btn-delete" />
        <Button
          label={mode === 'replace' ? 'Insert a ball before' : 'Change this ball instead'}
          variant="tertiary"
          size="sm"
          onPress={() => setMode(mode === 'replace' ? 'insert_before' : 'replace')}
          testID="edit-btn-mode"
        />
      </View>
      {vm?.newToken ? (
        <View style={styles.recorded} testID="edit-new">
          <Text variant="subhead" tone="secondary">
            New:
          </Text>
          <BallChip text={vm.newToken.text} kind={vm.newToken.kind} isFreeHit={vm.newToken.isFreeHit} accessibilityLabel={vm.newToken.accessibilityLabel} />
          <Text variant="body">{vm.newToken.accessibilityLabel}</Text>
        </View>
      ) : null}
      {lastChoice?.kind === 'delete' && preview !== null ? (
        <Text variant="subhead" style={styles.padded} testID="edit-delete-note">{`Ball ${label} will be removed.`}</Text>
      ) : null}
      {error !== null ? (
        <View style={styles.padded}>
          <Banner tone="danger" message={error} testID="edit-error" />
        </View>
      ) : null}
      {vm !== null && preview !== null ? <WhatWillChange vm={vm} impact={preview.impact} notes={notes} teamName={(teamId) => teamName(setup, teamId)} /> : null}
      {preview !== null ? (
        <View style={styles.apply}>
          <ReasonField
            value={reason}
            onChange={setReason}
            required={requiresReason}
            label={requiresReason ? 'Reason (required for completed and tournament matches)' : 'Reason (optional)'}
            testID="edit-reason"
          />
          <Button
            label="Apply change"
            size="lg"
            fullWidth
            variant={preview.impact?.severity === 'destructive' ? 'destructiveConfirm' : 'primary'}
            disabled={!canApply}
            loading={busy}
            onPress={() => void flight(apply)}
            testID="edit-btn-apply"
          />
        </View>
      ) : null}
      <ExtrasSheet visible={sheet === 'extras'} rules={setup.rules} onSubmit={pick} onClose={() => setSheet(null)} title="Change to extras" />
      {wicketOptions !== null ? (
        <WicketSheet
          visible={sheet === 'wicket'}
          options={wicketOptions}
          title="Change to wicket"
          onSubmit={(intent) => {
            pick(intent);
            return Promise.resolve({ ok: true });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <Dialog
        visible={conflict}
        title="This match changed"
        message="The match changed after you opened the preview. Review the edit again."
        confirm={{
          label: 'Review again',
          onPress: () => {
            setConflict(false);
            if (lastChoice !== null) {
              void choose(lastChoice);
            }
          },
          testID: 'edit-conflict-review',
        }}
        onRequestClose={() => setConflict(false)}
      />
    </Screen>
  );
}

export function EditBallScreen(props: EditBallScreenProps) {
  return (
    <MatchGate title="Edit ball">
      <EditBallBody {...props} />
    </MatchGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  recorded: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 48 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: space.md, paddingTop: space.xs },
  padded: { paddingHorizontal: space.md, paddingTop: space.xs },
  apply: { padding: space.md, gap: space.md },
});

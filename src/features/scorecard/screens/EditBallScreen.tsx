import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { HistoryEditPreview } from '@/services/contracts';
import { scoreRuns, type ScoringIntent } from '@/domain/scoring/commands';
import type { HistoryEditOp } from '@/domain/scoring/history';
import type { EditConflict, EditResolution } from '@/domain/scoring/editPlanning';
import { BallChip, Banner, Button, Dialog, EmptyState, Inset, OptionTile, Screen, SectionHeader, Text, space, useGutter, type PadRuns } from '@/ui';
import { useLiveMatchStore, useSettingsStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { useLeaveGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { InsetBody } from '@/features/scoring/components/common/InsetBody';
import { isReasonValid, ReasonField } from '@/features/scoring/components/common/ReasonField';
import { MatchGate } from '@/features/scoring/screens/MatchGate';
import { selectWicketOptions } from '@/features/scoring/selectors/options';
import { inningsTitle, regularNumberOf } from '@/features/scoring/selectors/labels';
import { playerName, teamName, teamShortName } from '@/features/scoring/selectors/names';
import { chipOf } from '@/features/scoring/selectors/scoreboard';
import { ExtrasSheet } from '@/features/scoring/sheets/ExtrasSheet';
import { WicketSheet } from '@/features/scoring/sheets/WicketSheet';
import { EditKeypad, recordedKeyOf, type EditKey } from '../components/EditKeypad';
import { WhatWillChange } from '../components/WhatWillChange';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { describeBall, findEditTarget, planEdit, selectEditPreview, type EditChoice } from '../selectors/historyEdit';
import { errorHeadline, scannable } from '@/features/scoring/selectors/scannable';

export interface EditBallScreenProps {
  readonly seq: number;
}

type Mode = 'replace' | 'insert_before';

interface Previewed {
  readonly ops: readonly HistoryEditOp[];
  readonly notes: readonly string[];
  readonly preview: HistoryEditPreview;
}

const REASON_NEEDED = 'Add a reason to apply';

export function leaveEdit(matchId: string): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace({ pathname: '/match/[matchId]/balls', params: { matchId } });
}

function keyOfIntent(intent: ScoringIntent): EditKey | null {
  if (intent.type === 'wicket') {
    return 'wicket';
  }
  if (intent.type === 'runs') {
    const runs = (intent.boundary ?? 0) + intent.runsRun;
    return runs === 0 || runs === 1 || runs === 2 || runs === 3 || runs === 4 || runs === 6 ? (runs as PadRuns) : 'extras';
  }
  return 'extras';
}

function keyOfChoice(choice: EditChoice | null): EditKey | null {
  return choice === null || choice.kind === 'delete' ? null : keyOfIntent(choice.intent);
}

interface ConflictPanelProps {
  readonly conflict: EditConflict;
  readonly busy: boolean;
  readonly onResolve: (resolution: EditResolution) => void;
  readonly onCancel: () => void;
}

function ConflictPanel({ conflict, busy, onResolve, onCancel }: ConflictPanelProps) {
  const choices = conflict.resolutions.filter((resolution) => !resolution.automatic);
  const message = scannable(conflict);
  return (
    <View style={styles.conflict} testID="edit-conflict">
      <Banner tone="warning" message={message.headline} detail={message.detail} testID="edit-conflict-message" />
      <Inset gap="xs">
        {conflict.ballLabel !== null ? (
          <Text variant="subhead" tone="secondary" testID="edit-conflict-ball">{`Choose a fix for ball ${conflict.ballLabel}`}</Text>
        ) : null}
        {choices.map((resolution) => (
          <OptionTile
            key={resolution.kind}
            kind="action"
            title={resolution.label}
            description={resolution.description}
            disabled={busy}
            onPress={() => onResolve(resolution)}
            accessibilityHint="Shows what this fix would change"
            testID={`edit-resolution-${resolution.kind}`}
          />
        ))}
        {choices.length === 0 ? (
          <Text variant="body" tone="secondary">
            Choose a different change
          </Text>
        ) : null}
        <View style={styles.start}>
          <Button label="Cancel change" variant="secondary" size="sm" onPress={onCancel} testID="edit-conflict-cancel" />
        </View>
      </Inset>
    </View>
  );
}

function EditBallBody({ seq }: EditBallScreenProps) {
  const gutter = useGutter();
  const live = useLiveMatchStore((s) => s.live);
  const conflict = useLiveMatchStore((s) => s.editConflict ?? null);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const [mode, setMode] = useState<Mode>('replace');
  const [sheet, setSheet] = useState<'extras' | 'wicket' | null>(null);
  const [previewed, setPreviewed] = useState<Previewed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastChoice, setLastChoice] = useState<EditChoice | null>(null);
  const request = useRef(0);
  const flight = useSingleFlight();
  const target = useMemo(() => (live === null ? null : findEditTarget(live.setup, live.events, live.state, seq)), [live, seq]);
  const pending = previewed !== null || (lastChoice !== null && (busy || conflict !== null)) || reason.trim() !== '';
  const matchId = live?.match.id ?? null;
  const guard = useLeaveGuard(pending, () => {
    if (useLiveMatchStore.getState().editConflict) {
      useLiveMatchStore.getState().clearEditConflict?.();
    }
    if (matchId !== null) {
      leaveEdit(matchId);
    }
  }, 'edit-discard');

  if (live === null || matchId === null) {
    return null;
  }
  const label = target?.ball?.label ?? `${seq}`;
  if (target === null) {
    return (
      <Screen testID="screen-edit" scroll={false} header={<TopBar title="Edit ball" onBack={() => leaveEdit(matchId)} />}>
        <InsetBody>
          <EmptyState title="Can't edit this entry" body="Only deliveries can be changed" testID="edit-not-delivery" />
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
  const innings = target.innings;
  const inningsLabel =
    innings === null ? null : `${teamShortName(setup, innings.battingTeamId)} ${inningsTitle(innings, regularNumberOf(live.state.innings, innings.index))}`;
  const [teamA, teamB] = setup.teams;
  const subtitle = [`${teamA.shortName} v ${teamB.shortName}`, inningsLabel, `${playerName(setup, target.event.bowlerId)} to ${playerName(setup, target.event.strikerId)}`]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const selectedKey = preview !== null || busy || conflict !== null ? keyOfChoice(lastChoice) : null;
  const reasonMissing = preview !== null && requiresReason && blocked === null && !isReasonValid(reason);
  const recordedKey = recordedKeyOf(target.event);

  const showPreview = async (nextOps: readonly HistoryEditOp[], nextNotes: readonly string[], ticket: number) => {
    setBusy(true);
    const result = await useLiveMatchStore.getState().previewHistoryEdit(nextOps);
    if (ticket !== request.current) {
      return;
    }
    setBusy(false);
    if (result === null) {
      const state = useLiveMatchStore.getState();
      if ((state.editConflict ?? null) !== null) {
        setError(null);
        return;
      }
      const failure = state.error;
      state.clearError();
      setError(errorHeadline(failure, "This change can't be applied."));
      return;
    }
    setPreviewed({ ops: nextOps, notes: nextNotes, preview: result });
  };

  const choose = async (choice: EditChoice) => {
    request.current += 1;
    const ticket = request.current;
    setLastChoice(choice);
    setPreviewed(null);
    useLiveMatchStore.getState().clearEditConflict?.();
    const next = planEdit(setup, live.events, target, choice);
    if (!next.ok) {
      setError(next.message);
      return;
    }
    setError(null);
    await showPreview(next.ops, next.notes, ticket);
  };
  const resolve = async (resolution: EditResolution) => {
    request.current += 1;
    const ticket = request.current;
    setPreviewed(null);
    setError(null);
    await showPreview(resolution.ops, [resolution.description], ticket);
  };
  const cancelConflict = () => {
    request.current += 1;
    useLiveMatchStore.getState().clearEditConflict?.();
    setLastChoice(null);
    setPreviewed(null);
    setError(null);
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
      useToastStore.getState().show({ kind: 'success', message: vm?.reopensMatch ? `Ball ${label} changed · match reopened` : `Ball ${label} changed`, action: null });
      setPreviewed(null);
      leaveEdit(matchId);
      return;
    }
    const failure = useLiveMatchStore.getState().error;
    useLiveMatchStore.getState().clearError();
    if (failure?.code === 'CONFLICT') {
      setStale(true);
      return;
    }
    setError(errorHeadline(failure, "Couldn't apply the change. Nothing was changed."));
  };

  const footer =
    preview === null ? undefined : (
      <View style={styles.dock} testID="edit-dock">
        {reasonMissing ? (
          <Text variant="footnote" tone="secondary" testID="edit-apply-hint">
            {REASON_NEEDED}
          </Text>
        ) : null}
        <Button
          label={vm?.reopensMatch ? 'Apply and reopen' : 'Apply change'}
          size="lg"
          fullWidth
          variant={preview.impact?.severity === 'destructive' ? 'destructiveConfirm' : 'primary'}
          disabled={!canApply}
          loading={busy}
          accessibilityHint={reasonMissing ? REASON_NEEDED : undefined}
          onPress={() => void flight(apply)}
          testID="edit-btn-apply"
        />
      </View>
    );

  return (
    <Screen
      testID="screen-edit"
      header={<TopBar title={`Edit ball ${label}`} subtitle={subtitle} onBack={guard.requestClose} testID="edit-top-bar" />}
      footer={footer}
    >
      <Stack.Screen options={{ gestureEnabled: !pending }} />
      <SectionHeader title="Recorded" />
      <View style={[styles.recorded, { paddingHorizontal: gutter }]} testID="edit-recorded">
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
      <EditKeypad
        selected={selectedKey}
        recorded={mode === 'replace' ? recordedKey : null}
        dotStyle={dotStyle}
        onRuns={(runs) => void choose({ kind: mode, intent: scoreRuns(runs) })}
        onExtras={() => setSheet('extras')}
        onWicket={() => setSheet('wicket')}
      />
      <View style={[styles.actions, { paddingLeft: Math.max(0, gutter - space.sm), paddingRight: gutter }]} testID="edit-actions">
        <Button
          label={mode === 'replace' ? 'Insert ball before' : 'Change this ball'}
          icon={mode === 'replace' ? 'plus' : 'pencil-line'}
          variant="tertiary"
          size="sm"
          onPress={() => setMode(mode === 'replace' ? 'insert_before' : 'replace')}
          testID="edit-btn-mode"
        />
        <View style={styles.end}>
          <Button label="Delete ball" icon="trash-2" variant="destructive" size="sm" onPress={() => void choose({ kind: 'delete' })} testID="edit-btn-delete" />
        </View>
      </View>
      {vm?.newToken ? (
        <View style={[styles.recorded, { paddingHorizontal: gutter }]} testID="edit-new">
          <Text variant="subhead" tone="secondary">
            New:
          </Text>
          <BallChip text={vm.newToken.text} kind={vm.newToken.kind} isFreeHit={vm.newToken.isFreeHit} accessibilityLabel={vm.newToken.accessibilityLabel} />
          <Text variant="body" style={styles.flex}>
            {vm.newToken.accessibilityLabel}
          </Text>
        </View>
      ) : null}
      {lastChoice?.kind === 'delete' && preview !== null ? (
        <Inset top="xs">
          <Text variant="subhead" testID="edit-delete-note">{`Ball ${label} will be removed`}</Text>
        </Inset>
      ) : null}
      {conflict !== null && preview === null ? <ConflictPanel conflict={conflict} busy={busy} onResolve={(resolution) => void resolve(resolution)} onCancel={cancelConflict} /> : null}
      {error !== null ? <Banner tone="danger" message={error} testID="edit-error" /> : null}
      {vm !== null && preview !== null ? <WhatWillChange vm={vm} impact={preview.impact} notes={notes} teamName={(teamId) => teamName(setup, teamId)} /> : null}
      {preview !== null ? (
        <Inset top="md" bottom="md" testID="edit-reason-group">
          <ReasonField
            value={reason}
            onChange={setReason}
            required={requiresReason}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            testID="edit-reason"
          />
        </Inset>
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
        visible={stale}
        title="This match changed"
        message="Review the edit again."
        confirm={{
          label: 'Review again',
          onPress: () => {
            setStale(false);
            if (lastChoice !== null) {
              void choose(lastChoice);
            }
          },
          testID: 'edit-conflict-review',
        }}
        onRequestClose={() => setStale(false)}
      />
      {guard.dialog}
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
  flex: { flex: 1, minWidth: 0 },
  recorded: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.xs, paddingTop: space.sm },
  end: { marginLeft: 'auto' },
  dock: { gap: space.xs },
  conflict: { paddingTop: space.sm, gap: space.xs },
  start: { alignItems: 'flex-start' },
});

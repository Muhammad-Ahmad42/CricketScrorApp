import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { MatchPlayer, TeamId } from '@/domain/types';
import { matchEditPolicy, type EditPermission } from '@/domain/tournament/stateMachine';
import { Button, Dialog, ListRow, Screen, SectionHeader, space } from '@/ui';
import { useHomeStore, useLiveMatchStore, useMatchHistoryStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { ReasonDialog } from '@/features/scoring/components/common/ReasonDialog';
import { sendIntent } from '@/features/scoring/hooks/actions';
import { leaveMatch, MatchGate } from '@/features/scoring/screens/MatchGate';
import { teamName } from '@/features/scoring/selectors/names';
import { formatLabel } from '@/features/scoring/selectors/scoreboard';
import { AddPlayerSheet } from '@/features/scoring/sheets/AddPlayerSheet';
import { EndMatchSheet } from '@/features/scoring/sheets/EndMatchSheet';
import { ReviseOversSheet } from '@/features/scoring/sheets/ReviseOversSheet';
import { reviseTargetOf } from '@/features/scoring/selectors/options';
import { SuspendSheet } from '@/features/scoring/sheets/SuspendSheet';
import { formatDateLabel } from '@/features/scoring/selectors/dates';
import { RulesEditor } from '@/features/match-setup/components/RulesEditor';
import { rulesIssues } from '@/features/match-setup/selectors/rules';
import { DetailsSheet } from '../sheets/DetailsSheet';
import { SideSizesSheet } from '../sheets/SideSizesSheet';
import { SquadSheet } from '../sheets/SquadSheet';
import { TossSheet } from '../sheets/TossSheet';

type Overlay =
  | { readonly kind: 'details' }
  | { readonly kind: 'toss' }
  | { readonly kind: 'sizes' }
  | { readonly kind: 'squad'; readonly teamId: TeamId }
  | { readonly kind: 'add'; readonly teamId: TeamId }
  | { readonly kind: 'suspend' }
  | { readonly kind: 'revise' }
  | { readonly kind: 'end' }
  | { readonly kind: 'discard' }
  | { readonly kind: 'delete' }
  | null;

interface PendingReason {
  readonly title: string;
  readonly run: (reason: string) => Promise<boolean>;
}

const FORBIDDEN_TEXT = "This can't be changed at this stage of the match.";

function ManageBody() {
  const live = useLiveMatchStore((s) => s.live);
  const venues = useTeamLibraryStore((s) => s.venues);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pendingReason, setPendingReason] = useState<PendingReason | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  if (live === null) {
    return null;
  }
  const { match, setup, state } = live;
  const inTournament = match.tournamentId !== null;
  const policy = matchEditPolicy(match.status, { inTournament });
  const toasts = useToastStore.getState();
  const close = () => setOverlay(null);

  const execute = async (action: (reason: string | null) => Promise<boolean>, reason: string | null, success: string) => {
    if (inFlight.current) {
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    const ok = await action(reason);
    inFlight.current = false;
    setBusy(false);
    if (ok) {
      close();
      toasts.show({ kind: 'success', message: success, action: null });
      return true;
    }
    const failure = useLiveMatchStore.getState().error;
    useLiveMatchStore.getState().clearError();
    toasts.show({ kind: 'error', message: failure?.message ?? "Couldn't save the change. Nothing was changed.", action: null });
    return false;
  };
  const guarded = (permission: EditPermission, title: string, action: (reason: string | null) => Promise<boolean>, success: string) => {
    switch (permission) {
      case 'forbidden':
        toasts.show({ kind: 'warning', message: FORBIDDEN_TEXT, action: null });
        return;
      case 'confirm':
        close();
        setPendingReason({ title, run: (reason) => execute(action, reason, success) });
        return;
      case 'warn':
      case 'allowed':
        void execute(action, null, success);
        return;
      default: {
        const unreachable: never = permission;
        return unreachable;
      }
    }
  };
  const store = () => useLiveMatchStore.getState();
  const [teamA, teamB] = setup.teams;
  const squadOf = (teamId: TeamId): readonly MatchPlayer[] => setup.players.filter((player) => player.teamId === teamId);
  const subs = (teamId: TeamId) => squadOf(teamId).filter((player) => player.isSubstitute).length;
  const regulars = (teamId: TeamId) => squadOf(teamId).length - subs(teamId);
  const isLive = state.lifecycle === 'live' || state.lifecycle === 'paused';
  const reviseTarget = reviseTargetOf(setup, state);
  const terminal = state.lifecycle === 'completed' || state.lifecycle === 'abandoned';
  const venueName = match.venueId === null ? 'No venue' : venues.find((venue) => venue.id === match.venueId)?.name ?? 'Venue';
  const when = [formatDateLabel(match.scheduledDate), match.scheduledTime].filter((part): part is string => part !== null).join(' ') || 'Not set';
  const tossText = setup.toss === null ? 'Not recorded' : `${teamName(setup, setup.toss.winnerTeamId)}, ${setup.toss.decision}`;
  const lockHint = (permission: EditPermission) => (permission === 'forbidden' ? FORBIDDEN_TEXT : permission === 'confirm' ? 'Needs a reason' : undefined);

  const discard = async () => {
    if (overlay?.kind !== 'discard') {
      return;
    }
    close();
    const ok = await useHomeStore.getState().discard(match.id);
    if (ok) {
      toasts.show({ kind: 'info', message: 'Match discarded', action: null });
      router.replace('/');
    }
  };
  const remove = async () => {
    if (overlay?.kind !== 'delete') {
      return;
    }
    close();
    const ok = await useMatchHistoryStore.getState().remove(match.id);
    if (ok) {
      void useHomeStore.getState().load();
      toasts.show({ kind: 'success', message: 'Match deleted', action: null });
      router.replace('/history');
    } else {
      toasts.show({ kind: 'error', message: "Couldn't delete the match. Nothing was changed.", action: null });
    }
  };

  return (
    <Screen testID="screen-manage" header={<TopBar title="Match settings" onBack={leaveMatch} />}>
      <SectionHeader title="Details" />
      <ListRow
        title="Title, venue, date"
        subtitle={`${match.title} · ${venueName} · ${when}`}
        trailing={{ kind: 'chevron' }}
        accessibilityHint={lockHint(policy.details)}
        onPress={() => (policy.details === 'forbidden' ? toasts.show({ kind: 'warning', message: FORBIDDEN_TEXT, action: null }) : setOverlay({ kind: 'details' }))}
        testID="manage-row-details"
      />
      <RulesEditor
        rules={setup.rules}
        issues={rulesIssues(setup.rules)}
        locked={policy.rules === 'forbidden'}
        onChange={(rules) => guarded(policy.rules, 'Change the match rules?', (reason) => store().updateRules({ rules }, reason), 'Rules updated')}
      />
      <ListRow
        title="Format"
        trailing={{ kind: 'value', text: `${formatLabel(match.formatId, setup.rules.oversPerInnings)} · ${setup.rules.oversPerInnings} overs` }}
        testID="manage-row-format"
      />
      <ListRow
        title="Side sizes"
        trailing={{ kind: 'value', text: `${teamA.playersInSide} v ${teamB.playersInSide}`, chevron: policy.rules !== 'forbidden' }}
        accessibilityHint={lockHint(policy.rules)}
        onPress={() => (policy.rules === 'forbidden' ? toasts.show({ kind: 'warning', message: FORBIDDEN_TEXT, action: null }) : setOverlay({ kind: 'sizes' }))}
        testID="manage-row-sizes"
      />
      <ListRow
        title="Toss"
        trailing={{ kind: 'value', text: tossText, chevron: policy.toss !== 'forbidden' }}
        accessibilityHint={lockHint(policy.toss)}
        onPress={() => (policy.toss === 'forbidden' ? toasts.show({ kind: 'warning', message: FORBIDDEN_TEXT, action: null }) : setOverlay({ kind: 'toss' }))}
        testID="manage-row-toss"
      />
      <SectionHeader title="Squads" />
      {setup.teams.map((team) => (
        <ListRow
          key={team.id}
          title={team.name}
          trailing={{ kind: 'value', text: `${regulars(team.id)}${subs(team.id) > 0 ? ` + ${subs(team.id)} sub` : ''}`, chevron: true }}
          onPress={() => setOverlay({ kind: 'squad', teamId: team.id })}
          testID={`manage-row-squad-${team.id}`}
        />
      ))}
      {isLive ? (
        <>
          <SectionHeader title="Play" />
          {state.lifecycle === 'paused' ? (
            <ListRow title="Resume play" leading={{ icon: 'play' }} onPress={() => void sendIntent({ type: 'resume_play' })} testID="manage-row-resume" />
          ) : (
            <ListRow title="Suspend play" leading={{ icon: 'pause' }} trailing={{ kind: 'chevron' }} onPress={() => setOverlay({ kind: 'suspend' })} testID="manage-row-suspend" />
          )}
          <ListRow
            title="Revise overs"
            leading={{ icon: 'cloud-rain' }}
            trailing={{ kind: 'chevron' }}
            onPress={() => setOverlay({ kind: 'revise' })}
            testID="manage-row-revise"
          />
          <ListRow
            title="End match"
            subtitle="Abandoned · No result · Awarded"
            leading={{ icon: 'circle-alert' }}
            trailing={{ kind: 'chevron' }}
            onPress={() => setOverlay({ kind: 'end' })}
            testID="manage-row-end"
          />
        </>
      ) : null}
      <View style={styles.danger}>
        {isLive && !inTournament ? (
          <Button label="Discard match" variant="destructive" size="lg" fullWidth onPress={() => setOverlay({ kind: 'discard' })} testID="manage-btn-discard" />
        ) : null}
        {terminal && !inTournament ? (
          <Button label="Delete match" variant="destructive" size="lg" fullWidth onPress={() => setOverlay({ kind: 'delete' })} testID="manage-btn-delete" />
        ) : null}
      </View>
      {overlay?.kind === 'details' ? (
        <DetailsSheet
          visible
          values={{ title: match.title, venueId: match.venueId, scheduledDate: match.scheduledDate, scheduledTime: match.scheduledTime }}
          venues={venues}
          busy={busy}
          onSubmit={(patch) => void execute(() => store().updateDetails(patch), null, 'Details saved')}
          onClose={close}
        />
      ) : null}
      {overlay?.kind === 'toss' ? (
        <TossSheet
          visible
          toss={setup.toss}
          teams={setup.teams}
          busy={busy}
          onSubmit={(toss) => guarded(policy.toss, 'Change the toss?', (reason) => store().setToss(toss, reason), 'Toss saved')}
          onClose={close}
        />
      ) : null}
      {overlay?.kind === 'sizes' ? (
        <SideSizesSheet
          visible
          teamA={{ name: teamA.name, size: teamA.playersInSide }}
          teamB={{ name: teamB.name, size: teamB.playersInSide }}
          playersPerSide={setup.rules.playersPerSide}
          busy={busy}
          onSubmit={(teamSizes) => guarded(policy.rules, 'Change the side sizes?', (reason) => store().updateRules({ teamSizes }, reason), 'Side sizes saved')}
          onClose={close}
        />
      ) : null}
      {overlay?.kind === 'squad' ? (
        <SquadSheet
          visible
          teamName={teamName(setup, overlay.teamId)}
          players={squadOf(overlay.teamId)}
          canRemove={policy.squads !== 'forbidden'}
          onRemove={(player) => void execute(() => store().removeSquadPlayer(player.playerId), null, `${player.name} removed`)}
          onAdd={() => setOverlay({ kind: 'add', teamId: overlay.teamId })}
          onClose={close}
        />
      ) : null}
      {overlay?.kind === 'add' ? (
        <AddPlayerSheet
          visible
          teamName={teamName(setup, overlay.teamId)}
          allowSubstitute
          busy={busy}
          onSubmit={(player, isSubstitute) =>
            void execute(() => store().addSquadPlayer(overlay.teamId, { newPlayer: player }, { isSubstitute }), null, `${player.name} added`)
          }
          onClose={close}
        />
      ) : null}
      <SuspendSheet
        visible={overlay?.kind === 'suspend'}
        onSubmit={(intent) => {
          close();
          void sendIntent(intent);
        }}
        onClose={close}
      />
      {overlay?.kind === 'revise' && reviseTarget !== null ? (
        <ReviseOversSheet
          visible
          target={reviseTarget}
          onSubmit={(intent) => {
            close();
            void sendIntent(intent);
          }}
          onClose={close}
        />
      ) : null}
      <EndMatchSheet
        visible={overlay?.kind === 'end'}
        teams={setup.teams}
        inTournament={inTournament}
        onSubmit={(intent) => {
          close();
          void sendIntent(intent);
        }}
        onClose={close}
      />
      <Dialog
        visible={overlay?.kind === 'discard'}
        destructive
        title="Discard this match?"
        message={`${live.events.length} recorded events will be deleted. This can't be undone.`}
        confirm={{ label: 'Discard match', onPress: () => void discard(), testID: 'manage-discard-confirm' }}
        cancel={{ label: 'Cancel', onPress: close }}
        onRequestClose={close}
      />
      <Dialog
        visible={overlay?.kind === 'delete'}
        destructive
        title={`Delete ${match.title}?`}
        message={`Its scorecard and ${live.events.length} recorded events will be deleted. This can't be undone.`}
        confirm={{ label: 'Delete match', onPress: () => void remove(), testID: 'manage-delete-confirm' }}
        cancel={{ label: 'Cancel', onPress: close }}
        onRequestClose={close}
      />
      <ReasonDialog
        visible={pendingReason !== null}
        title={pendingReason?.title ?? ''}
        message={inTournament ? 'This match is part of a tournament. The change is recorded in the audit log with your reason.' : 'The change is recorded in the audit log with your reason.'}
        confirmLabel="Save change"
        busy={busy}
        onConfirm={(reason) => {
          const run = pendingReason?.run;
          setPendingReason(null);
          if (run !== undefined) {
            void run(reason);
          }
        }}
        onCancel={() => setPendingReason(null)}
      />
    </Screen>
  );
}

export function ManageMatchScreen() {
  return (
    <MatchGate title="Match settings">
      <ManageBody />
    </MatchGate>
  );
}

const styles = StyleSheet.create({
  danger: { padding: space.md, gap: space.sm },
});

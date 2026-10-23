import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canTransitionFixture } from '@/domain/tournament/stateMachine';
import type { Fixture, FixturePatch, FixtureStatus, TournamentId } from '@/domain/types';
import { ImpactSheet } from '@/features/shared';
import { Button, Dialog, EmptyState, ExplainedText, Icon, InlineNotice, Inset, ListRow, SectionHeader, Separator, Text, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { showError, showToast } from '../hooks/toast';
import { Scoreline } from '../components/Scoreline';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { PROVISIONAL_START_TITLE, useStartFixtureMatch } from '../hooks/useStartFixtureMatch';
import { tournamentVenues, useVenues, venueLookup } from '../hooks/useLibrary';
import { FIXTURE_STATUS_LABEL } from '../labels';
import { routes } from '../routes';
import { formatDateTime } from '../selectors/dates';
import { fixturePlayedOn, fixtureRow } from '../selectors/fixtures';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { ReasonSheet } from '../sheets/ReasonSheet';
import { ScheduleSheet, type ScheduleValues } from '../sheets/ScheduleSheet';
import { TournamentContainer } from './TournamentContainer';

export interface FixtureDetailScreenProps {
  readonly tournamentId: TournamentId;
  readonly fixtureId: string;
}

type Mode = 'idle' | 'edit' | 'postpone' | 'reschedule' | 'cancel';

function allowed(fixture: Fixture, to: FixtureStatus, replayAllowed: boolean): boolean {
  return canTransitionFixture(fixture.status, to, { hasMatch: fixture.matchId !== null, replayAllowed }).ok;
}

function subtitleFor(index: TournamentIndex, fixture: Fixture): string {
  const parts = [index.stageName(fixture.stageId)];
  const pool = index.poolName(fixture.poolId);
  if (pool) {
    parts.push(pool);
  }
  if (fixture.bracket) {
    parts.push(fixture.bracket.roundName);
  } else if (fixture.round !== null) {
    parts.push(`Round ${fixture.round}`);
  }
  return parts.join(' · ');
}

export const REPLAY_HEADLINE = 'The abandoned match stays in history';
export const REPLAY_SUPPORTING = 'A new match is played on the new date.';

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function waitingReasons(index: TournamentIndex, fixture: Fixture): readonly string[] {
  return [fixture.sideA, fixture.sideB].flatMap((side) => {
    if (side.kind !== 'slot' || index.side(side).resolved) {
      return [];
    }
    const resolution = index.slotResolution(side.slotId);
    if (!resolution?.detail) {
      return [];
    }
    return [`${sentence(resolution.headline ?? resolution.explanation)} ${resolution.detail}`];
  });
}

function FixtureBody({ tournamentId, index, fixture }: { readonly tournamentId: TournamentId; readonly index: TournamentIndex; readonly fixture: Fixture }) {
  const router = useRouter();
  const venues = useVenues();
  const flow = useChangeFlow();
  const start = useStartFixtureMatch(tournamentId, index);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const row = fixtureRow(index, fixture, venueLookup(venues));
  const policy = editPolicy(index);
  const stage = index.stage(fixture.stageId);
  const replayAllowed = stage?.config.abandonedMatches === 'replay';
  const played = fixture.matchId !== null;
  const playedOn = fixturePlayedOn(index, fixture);
  const replayWithData = fixture.status === 'abandoned' && played;
  const canSchedule = !played && policy.fixtureSchedule !== 'forbidden' && fixture.status !== 'cancelled';
  const venueName = fixture.venueId ? venueLookup(venues)(fixture.venueId) : null;
  const statusLine = [FIXTURE_STATUS_LABEL[fixture.status], formatDateTime(fixture.scheduledDate, fixture.scheduledTime)].filter(Boolean).join(' · ');

  const update = async (patch: FixturePatch, reason: string | null, message: string) => {
    setBusy(true);
    const ok = await useTournamentStore.getState().updateFixture(fixture.id, patch, reason);
    setBusy(false);
    if (ok) {
      setMode('idle');
      showToast('success', message);
    } else {
      showError(useTournamentStore.getState().error, "Couldn't update this fixture.");
    }
  };

  const scheduleInitial: ScheduleValues = {
    scheduledDate: fixture.scheduledDate,
    scheduledTime: fixture.scheduledTime,
    venueId: fixture.venueId,
    notes: fixture.notes,
    label: fixture.label,
  };

  const primary = () => {
    if (fixture.matchId !== null && fixture.status === 'live') {
      return <Button label="Resume scoring" icon="play" onPress={() => router.push(routes.matchScore(fixture.matchId ?? ''))} fullWidth testID="fixture-btn-open-match" />;
    }
    if (fixture.matchId !== null) {
      return <Button label="View scorecard" icon="file-text" variant="secondary" onPress={() => router.push(routes.matchScorecard(fixture.matchId ?? ''))} fullWidth testID="fixture-btn-open-match" />;
    }
    if (fixture.status === 'scheduled' || fixture.status === 'rescheduled') {
      if (!row.resolved) {
        return (
          <View style={styles.gap}>
            <Button label="Start match" icon="play" onPress={() => undefined} disabled fullWidth accessibilityHint={row.detail} testID="fixture-btn-start-match" />
            <ExplainedText
              headline={row.detail}
              detail={waitingReasons(index, fixture)}
              detailTitle="Waiting for teams"
              presentation="sheet"
              tone="secondary"
              size="subhead"
              testID="fixture-text-waiting"
            />
          </View>
        );
      }
      if (index.snapshot.tournament.status === 'archived') {
        return null;
      }
      return <Button label="Start match" icon="play" onPress={() => start.request(row)} loading={start.busy} fullWidth testID="fixture-btn-start-match" />;
    }
    if (fixture.status === 'postponed') {
      return <Button label="Reschedule" onPress={() => setMode('reschedule')} fullWidth testID="fixture-btn-reschedule" />;
    }
    if (fixture.status === 'cancelled' && allowed(fixture, 'scheduled', replayAllowed)) {
      return <Button label="Restore" variant="secondary" onPress={() => void update({ status: 'scheduled' }, null, 'Fixture restored')} loading={busy} fullWidth testID="fixture-btn-restore" />;
    }
    return null;
  };

  return (
    <View>
      <View style={styles.hero} accessible accessibilityLabel={[row.teamsText, statusLine, row.scoreline?.spoken ?? null, row.result].filter(Boolean).join('. ')}>
        <Inset gap="xs">
          <Text variant="title2" testID="fixture-text-teams">
            {row.teamsText}
          </Text>
          <Text variant="callout" tone="secondary" testID="fixture-text-status">
            {statusLine}
          </Text>
          {row.scoreline ? <Scoreline scoreline={row.scoreline} size="hero" testID="fixture-text-score" /> : null}
          {row.result ? (
            <Text variant="bodyStrong" testID="fixture-text-result">
              {row.result}
            </Text>
          ) : null}
          {venueName ? (
            <Text variant="footnote" tone="secondary">
              {venueName}
            </Text>
          ) : null}
        </Inset>
      </View>
      <Inset bottom="md" gap="md">
        {primary()}
        {played ? (
          <View style={styles.locked}>
            <Icon name="info" size={16} color="textSecondary" />
            <Text variant="footnote" tone="secondary" style={styles.flex} testID="fixture-text-locked">
              Fix results from the scorecard.
            </Text>
          </View>
        ) : null}
        {fixture.status === 'abandoned' && replayAllowed && allowed(fixture, 'rescheduled', replayAllowed) ? (
          <Button label="Reschedule replay" variant="secondary" onPress={() => setMode('reschedule')} fullWidth testID="fixture-btn-reschedule" />
        ) : null}
      </Inset>
      <Separator />
      <SectionHeader title="Schedule" />
      {playedOn !== null ? <ListRow title="Played" trailing={{ kind: 'value', text: playedOn }} compact testID="fixture-row-played" /> : null}
      <ListRow title={played ? 'Scheduled for' : 'Date & time'} trailing={{ kind: 'value', text: formatDateTime(fixture.scheduledDate, fixture.scheduledTime) ?? 'Not set' }} compact />
      <ListRow title="Venue" trailing={{ kind: 'value', text: venueName ?? 'Not set' }} compact />
      {fixture.notes ? <ListRow title="Notes" subtitle={fixture.notes} compact /> : null}
      {canSchedule ? (
        <Inset top="sm" bottom="sm">
          <View style={styles.actions}>
            <Button label="Edit schedule" variant="secondary" size="sm" icon="pencil-line" onPress={() => setMode('edit')} testID="fixture-btn-edit" />
            {policy.fixtureTeams !== 'forbidden' ? (
              <Button
                label="Swap sides"
                variant="secondary"
                size="sm"
                icon="arrow-left-right"
                onPress={() =>
                  void flow.start(
                    (fresh) => {
                      const current = fresh.snapshot.fixtures.find((candidate) => candidate.id === fixture.id);
                      return current ? { kind: 'fixture_update', fixtureId: current.id, patch: { sideA: current.sideB, sideB: current.sideA } } : null;
                    },
                    { successMessage: 'Sides swapped' },
                  )
                }
                testID="fixture-btn-swap-sides"
              />
            ) : null}
          </View>
        </Inset>
      ) : null}
      {!played && (allowed(fixture, 'postponed', replayAllowed) || allowed(fixture, 'cancelled', replayAllowed)) ? (
        <View>
          <Separator />
          <Inset top="sm" bottom="sm">
            <View style={styles.dangerActions} testID="fixture-row-called-off-actions">
              {allowed(fixture, 'postponed', replayAllowed) ? (
                <Button label="Postpone" variant="secondary" size="sm" icon="pause" onPress={() => setMode('postpone')} testID="fixture-btn-postpone" />
              ) : null}
              {allowed(fixture, 'cancelled', replayAllowed) ? (
                <Button label="Cancel match" variant="destructive" size="sm" icon="x" onPress={() => setMode('cancel')} testID="fixture-btn-cancel" />
              ) : null}
            </View>
          </Inset>
        </View>
      ) : null}
      {mode === 'edit' ? (
        <ScheduleSheet
          visible
          title="Edit schedule"
          initial={scheduleInitial}
          venues={tournamentVenues(venues, index.snapshot.tournament.venueIds, fixture.venueId)}
          confirmLabel="Save"
          busy={busy}
          onClose={() => setMode('idle')}
          onSubmit={(values) => void update(values, null, 'Fixture updated')}
        />
      ) : null}
      {mode === 'reschedule' ? (
        <ScheduleSheet
          visible
          title="Reschedule"
          initial={{ ...scheduleInitial, scheduledDate: null }}
          venues={venues}
          confirmLabel="Reschedule"
          requireDate
          showDetails={false}
          reason={replayWithData ? 'required' : 'optional'}
          extra={replayWithData ? <InlineNotice tone="warning" headline={REPLAY_HEADLINE} supporting={REPLAY_SUPPORTING} testID="schedule-text-replay" /> : undefined}
          busy={busy}
          onClose={() => setMode('idle')}
          onSubmit={(values, reason) =>
            void update({ status: 'rescheduled', scheduledDate: values.scheduledDate, scheduledTime: values.scheduledTime }, reason, 'Fixture rescheduled')
          }
        />
      ) : null}
      {mode === 'postpone' ? (
        <ReasonSheet
          visible
          title="Postpone this match?"
          message="You can reschedule it later."
          confirmLabel="Postpone"
          required={false}
          busy={busy}
          onClose={() => setMode('idle')}
          onSubmit={(reason) => void update({ status: 'postponed' }, reason, 'Fixture postponed')}
        />
      ) : null}
      {mode === 'cancel' ? (
        <ReasonSheet
          visible
          title="Cancel this match?"
          message="It won't count in the standings. You can restore it later."
          confirmLabel="Cancel match"
          required
          destructive
          busy={busy}
          onClose={() => setMode('idle')}
          onSubmit={(reason) => void update({ status: 'cancelled' }, reason, 'Fixture cancelled')}
        />
      ) : null}
      <Dialog
        visible={start.prompt !== null}
        title={PROVISIONAL_START_TITLE}
        message={start.prompt?.message}
        cancel={{ label: 'Cancel', onPress: start.dismiss }}
        confirm={{ label: 'Start anyway', onPress: start.confirm, loading: start.busy }}
        onRequestClose={start.dismiss}
        testID="dialog-start-provisional"
      />
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function FixtureDetailScreen({ tournamentId, fixtureId }: FixtureDetailScreenProps) {
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-fixture"
      title={(index) => {
        const fixture = index.snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
        return fixture ? index.fixtureTitle(fixture) : 'Fixture';
      }}
      subtitle={(index) => {
        const fixture = index.snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
        return fixture ? subtitleFor(index, fixture) : null;
      }}
      backTo={routes.fixtures(tournamentId)}
    >
      {(index) => {
        const fixture = index.snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
        if (!fixture) {
          return <EmptyState title="Fixture not found" body="It may have been regenerated or deleted." testID="fixture-missing" />;
        }
        return <FixtureBody tournamentId={tournamentId} index={index} fixture={fixture} />;
      }}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: space.md },
  gap: { gap: space.xs },
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  dangerActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
});

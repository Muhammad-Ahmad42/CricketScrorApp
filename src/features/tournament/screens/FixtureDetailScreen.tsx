import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canTransitionFixture } from '@/domain/tournament/stateMachine';
import type { Fixture, FixturePatch, FixtureStatus, TournamentId } from '@/domain/types';
import { ImpactSheet, Notice } from '@/features/shared';
import { BoundaryRule, Button, Dialog, EmptyState, Icon, ListRow, SectionHeader, Separator, Text, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { showError, showToast } from '../hooks/toast';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { useStartFixtureMatch } from '../hooks/useStartFixtureMatch';
import { useVenues, venueLookup } from '../hooks/useLibrary';
import { FIXTURE_STATUS_LABEL } from '../labels';
import { routes } from '../routes';
import { formatDateTime } from '../selectors/dates';
import { fixtureRow, type FixtureRowVM } from '../selectors/fixtures';
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

function replayNotice(index: TournamentIndex, fixture: Fixture): string {
  return `${index.fixtureTitle(fixture)} was abandoned with recorded scores. Rescheduling a replay keeps that match in the match history and plays a new match on the new date. The reason is saved in the audit log.`;
}

function waitingExplanation(index: TournamentIndex, row: FixtureRowVM, fixture: Fixture): string {
  const explanations = [fixture.sideA, fixture.sideB]
    .filter((side) => side.kind === 'slot' && !index.side(side).resolved)
    .map((side) => (side.kind === 'slot' ? index.slotResolution(side.slotId)?.explanation : undefined))
    .filter((text): text is string => Boolean(text));
  const waiting = [row.a, row.b].filter((side) => !side.resolved).map((side) => side.meaning ?? side.slotLabel ?? side.text);
  return [`Waiting for ${waiting.join(' and ')}.`, ...explanations].join(' ');
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
            <Button label={row.detail} onPress={() => undefined} disabled fullWidth testID="fixture-btn-start-match" />
            <Text variant="footnote" tone="secondary" testID="fixture-text-waiting">
              {waitingExplanation(index, row, fixture)}
            </Text>
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
      <BoundaryRule />
      <View style={styles.hero} accessible accessibilityLabel={`${row.teamsText}. ${statusLine}`}>
        <Text variant="title2" testID="fixture-text-teams">
          {row.teamsText}
        </Text>
        <Text variant="callout" tone="secondary" testID="fixture-text-status">
          {statusLine}
        </Text>
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
      </View>
      <View style={styles.primary}>{primary()}</View>
      {played ? (
        <View style={styles.locked}>
          <Icon name="info" size={16} color="textSecondary" />
          <Text variant="footnote" tone="secondary">
            Played fixtures keep their date and teams. Correct the result from the scorecard.
          </Text>
        </View>
      ) : null}
      {fixture.status === 'abandoned' && replayAllowed && allowed(fixture, 'rescheduled', replayAllowed) ? (
        <View style={styles.primary}>
          <Button label="Reschedule replay" variant="secondary" onPress={() => setMode('reschedule')} fullWidth testID="fixture-btn-reschedule" />
        </View>
      ) : null}
      <Separator />
      <SectionHeader title="Schedule" />
      <ListRow title="Date & time" trailing={{ kind: 'value', text: formatDateTime(fixture.scheduledDate, fixture.scheduledTime) ?? 'Not set' }} compact />
      <ListRow title="Venue" trailing={{ kind: 'value', text: venueName ?? 'Not set' }} compact />
      {fixture.notes ? <ListRow title="Notes" subtitle={fixture.notes} compact /> : null}
      {canSchedule ? (
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
      ) : null}
      {!played && (allowed(fixture, 'postponed', replayAllowed) || allowed(fixture, 'cancelled', replayAllowed)) ? (
        <View>
          <Separator />
          <View style={styles.actions}>
            {allowed(fixture, 'postponed', replayAllowed) ? (
              <Button label="Postpone" variant="secondary" size="sm" icon="pause" onPress={() => setMode('postpone')} testID="fixture-btn-postpone" />
            ) : null}
            {allowed(fixture, 'cancelled', replayAllowed) ? (
              <Button label="Cancel match" variant="destructive" size="sm" icon="x" onPress={() => setMode('cancel')} testID="fixture-btn-cancel" />
            ) : null}
          </View>
        </View>
      ) : null}
      {mode === 'edit' ? (
        <ScheduleSheet
          visible
          title="Edit schedule"
          initial={scheduleInitial}
          venues={venues}
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
          extra={replayWithData ? <Notice tone="warning" message={replayNotice(index, fixture)} testID="schedule-text-replay" /> : undefined}
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
          message="The fixture stays in the list as postponed until you reschedule it."
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
          message="A cancelled fixture is not played and does not count in the standings. You can restore it later."
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
        title="Start anyway?"
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
          return (
            <View>
              <Notice tone="warning" message="This fixture no longer exists. It may have been regenerated or deleted." testID="fixture-text-missing" />
              <EmptyState title="Fixture not found" testID="fixture-missing" />
            </View>
          );
        }
        return <FixtureBody tournamentId={tournamentId} index={index} fixture={fixture} />;
      }}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.xxs },
  primary: { paddingHorizontal: space.md, paddingBottom: space.md },
  gap: { gap: space.xs },
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
});

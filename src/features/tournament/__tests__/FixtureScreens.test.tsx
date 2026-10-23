import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Fixture, TournamentSnapshot } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { AddFixtureScreen } from '../screens/AddFixtureScreen';
import { FixtureDetailScreen } from '../screens/FixtureDetailScreen';
import { FixturesScreen } from '../screens/FixturesScreen';
import { loadTournament, resetAll } from './support/harness';
import { pickDate, pickTime } from './support/pickers';
import { useMatchSetupStore, useTournamentStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { GROUP_RESULTS, cupSnapshot, playPair } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function fixtureWhere(snapshot: TournamentSnapshot, predicate: (fixture: Fixture) => boolean): Fixture {
  const fixture = snapshot.fixtures.find(predicate);
  if (!fixture) {
    throw new Error('Fixture not found');
  }
  return fixture;
}

function withFixture(snapshot: TournamentSnapshot, id: string, patch: Partial<Fixture>): TournamentSnapshot {
  return { ...snapshot, fixtures: snapshot.fixtures.map((fixture) => (fixture.id === id ? { ...fixture, ...patch } : fixture)) };
}

describe('FixturesScreen (§35–§39)', () => {
  it('groups fixtures by stage, pool and round with slot labels until resolved', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-fixtures')).toBeOnTheScreen();
    expect(screen.getByText('Group Stage · Pool A · Round 1')).toBeOnTheScreen();
    expect(screen.getByTestId('fixtures-btn-add')).toBeOnTheScreen();
  });

  it('shows results and statuses as text and filters by status', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const played = fixtureWhere(snapshot, (fixture) => fixture.status === 'completed');
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('fixtures-tab-completed'));
    expect(screen.getByTestId(`fixtures-text-status-${played.matchNumber}`)).toHaveTextContent('Completed');
    expect(screen.getByText('Lions won by 6 runs')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('fixtures-tab-off'));
    expect(screen.getByTestId('fixtures-text-none')).toBeOnTheScreen();
  });

  it('searches by team name and opens a fixture', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    await fireEvent.changeText(screen.getByTestId('fixtures-input-search'), 'wolves');
    expect(screen.queryByText(/Lions v/)).not.toBeOnTheScreen();
    const rows = screen.getAllByText(/Wolves/);
    expect(rows.length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByRole('button', { name: /Wolves/ })[0]);
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/tournament/[tournamentId]/fixtures/[fixtureId]' }));
  });
});

describe('FixtureDetailScreen (§38, §39, §66)', () => {
  it('starts a resolved fixture through the match setup (§66)', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const fixture = snapshot.fixtures[0];
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    expect(screen.getByTestId('fixture-text-status')).toHaveTextContent('Scheduled');
    await fireEvent.press(screen.getByTestId('fixture-btn-start-match'));
    await waitFor(() => expect(useMatchSetupStore.getState().startFromFixture).toHaveBeenCalledWith('t1', fixture.id));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/match/new', params: { tournamentId: 't1', fixtureId: fixture.id } });
  });

  it('disables start while slots are unresolved and explains why', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const semi = fixtureWhere(snapshot, (fixture) => fixture.bracket?.round === 1 && fixture.bracket.position === 0);
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={semi.id} />);
    expect(screen.getByTestId('fixture-text-teams')).toHaveTextContent('A1 v B2');
    expect(screen.getByTestId('fixture-btn-start-match')).toBeDisabled();
    expect(screen.getByTestId('fixture-btn-start-match')).toHaveTextContent('Start match');
    expect(screen.getByTestId('fixture-text-waiting-headline')).toHaveTextContent('Waiting for Pool A winner and Pool B runner-up');
  });

  it('asks before starting with provisional sides', async () => {
    const order = [...GROUP_RESULTS.slice(6), ...GROUP_RESULTS.slice(0, 3)];
    const snapshot = order.reduce((current, [winner, loser]) => playPair(current, winner, loser, winner), cupSnapshot());
    loadTournament(snapshot);
    const semi = fixtureWhere(snapshot, (fixture) => fixture.bracket?.round === 1 && fixture.bracket.position === 1);
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={semi.id} />);
    expect(screen.getByTestId('fixture-text-teams')).toHaveTextContent(/Bulls v A2 · .* \(provisional\)/);
    await fireEvent.press(screen.getByTestId('fixture-btn-start-match'));
    expect(screen.getByText('Stage not finished')).toBeOnTheScreen();
    expect(screen.getByTestId('dialog-text-message')).toHaveTextContent(/^Starting now locks in .*, even if the table changes\.$/);
    expect(screen.getByTestId('dialog-btn-confirm')).toHaveTextContent('Start anyway');
    expect(useMatchSetupStore.getState().startFromFixture).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    await waitFor(() => expect(useMatchSetupStore.getState().startFromFixture).toHaveBeenCalledWith('t1', semi.id));
  });

  it('postpones with an optional reason', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const fixture = snapshot.fixtures[0];
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-postpone'));
    await fireEvent.changeText(screen.getByTestId('reason-input'), 'Rain');
    await fireEvent.press(screen.getByTestId('reason-btn-confirm'));
    await waitFor(() => expect(useTournamentStore.getState().updateFixture).toHaveBeenCalledWith(fixture.id, { status: 'postponed' }, 'Rain'));
  });

  it('reschedules a postponed fixture, requiring a valid date', async () => {
    const base = cupSnapshot();
    const fixture = base.fixtures[0];
    loadTournament(withFixture(base, fixture.id, { status: 'postponed' }));
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-reschedule'));
    expect(screen.getByTestId('schedule-btn-save')).toBeDisabled();
    expect(screen.queryByTestId('schedule-input-date-clear')).not.toBeOnTheScreen();
    await pickDate('schedule-input-date', '2026-09-20');
    await pickTime('schedule-input-time', '10:00');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().updateFixture).toHaveBeenCalledWith(
        fixture.id,
        { status: 'rescheduled', scheduledDate: '2026-09-20', scheduledTime: '10:00' },
        null,
      ),
    );
  });

  it('cancels only with a reason', async () => {
    const base = cupSnapshot();
    const fixture = base.fixtures[0];
    loadTournament(base);
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-cancel'));
    expect(screen.getByTestId('reason-btn-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('reason-input'), 'Ground unavailable');
    await fireEvent.press(screen.getByTestId('reason-btn-confirm'));
    await waitFor(() => expect(useTournamentStore.getState().updateFixture).toHaveBeenCalledWith(fixture.id, { status: 'cancelled' }, 'Ground unavailable'));
  });

  it('restores a cancelled fixture', async () => {
    const base = cupSnapshot();
    const fixture = base.fixtures[0];
    loadTournament(withFixture(base, fixture.id, { status: 'cancelled' }));
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-restore'));
    await waitFor(() => expect(useTournamentStore.getState().updateFixture).toHaveBeenCalledWith(fixture.id, { status: 'scheduled' }, null));
  });

  it('opens the scorecard of a completed fixture and locks its schedule', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const played = fixtureWhere(snapshot, (fixture) => fixture.status === 'completed');
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={played.id} />);
    expect(screen.getByTestId('fixture-text-result')).toHaveTextContent('Lions won by 6 runs');
    expect(screen.queryByTestId('fixture-btn-edit')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('fixture-btn-postpone')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('fixture-btn-open-match'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/scorecard', params: { matchId: `m-${played.id}` } });
  });

  it('edits the schedule with updateFixture', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const fixture = snapshot.fixtures[0];
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={fixture.id} />);
    await fireEvent.press(screen.getByTestId('fixture-btn-edit'));
    await pickDate('schedule-input-date', '2026-09-14');
    await fireEvent.changeText(screen.getByTestId('schedule-input-label'), 'Opener');
    await fireEvent.press(screen.getByTestId('schedule-btn-save'));
    await waitFor(() =>
      expect(useTournamentStore.getState().updateFixture).toHaveBeenCalledWith(
        fixture.id,
        { scheduledDate: '2026-09-14', scheduledTime: null, venueId: null, notes: null, label: 'Opener' },
        null,
      ),
    );
  });
});

describe('AddFixtureScreen (§37)', () => {
  it('adds a manual fixture between two teams', async () => {
    loadTournament(cupSnapshot({ status: 'fixtures_generated' }));
    await renderWithTheme(<AddFixtureScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('addfix-btn-side-a'));
    await fireEvent.press(screen.getByTestId('picker-row-1'));
    await fireEvent.press(screen.getByTestId('addfix-btn-side-b'));
    await fireEvent.press(screen.getByTestId('picker-row-2'));
    await pickDate('addfix-input-date', '2026-09-26');
    await fireEvent.changeText(screen.getByTestId('addfix-input-overs'), '10');
    await fireEvent.changeText(screen.getByTestId('addfix-input-label'), 'Friendly');
    await fireEvent.press(screen.getByTestId('addfix-btn-submit'));
    await waitFor(() => expect(useTournamentStore.getState().addFixture).toHaveBeenCalled());
    const draft = jest.mocked(useTournamentStore.getState().addFixture).mock.calls[0][0];
    expect(draft).toMatchObject({
      tournamentId: 't1',
      sideA: { kind: 'team', teamId: 'LIO' },
      sideB: { kind: 'team', teamId: 'TIG' },
      scheduledDate: '2026-09-26',
      label: 'Friendly',
      matchNumber: 16,
      status: 'scheduled',
    });
    expect(draft.matchRules?.oversPerInnings).toBe(10);
  });

  it('refuses the same side twice', async () => {
    loadTournament(cupSnapshot({ status: 'fixtures_generated' }));
    await renderWithTheme(<AddFixtureScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('addfix-btn-side-a'));
    await fireEvent.press(screen.getByTestId('picker-row-1'));
    await fireEvent.press(screen.getByTestId('addfix-btn-side-b'));
    await fireEvent.press(screen.getByTestId('picker-row-1'));
    await fireEvent.press(screen.getByTestId('addfix-btn-submit'));
    expect(screen.getByTestId('addfix-text-error-sides')).toHaveTextContent('A side cannot play itself.');
    expect(useTournamentStore.getState().addFixture).not.toHaveBeenCalled();
  });

  it('goes through the impact preview once matches have started', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    await renderWithTheme(<AddFixtureScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('addfix-btn-side-a'));
    await fireEvent.press(screen.getByTestId('picker-row-1'));
    await fireEvent.press(screen.getByTestId('addfix-btn-side-b'));
    await fireEvent.press(screen.getByTestId('picker-row-3'));
    await fireEvent.press(screen.getByTestId('addfix-btn-submit'));
    await waitFor(() => expect(useTournamentStore.getState().previewChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fixture_add' })));
    expect(useTournamentStore.getState().addFixture).not.toHaveBeenCalled();
  });
});

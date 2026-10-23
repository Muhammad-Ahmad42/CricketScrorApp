import '@/ui/testing';
import { Dimensions } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { simulate } from '@/domain/tournament/whatif';
import type { HypotheticalResult, TournamentRecordLine, TournamentSnapshot, TournamentStats, WhatIfResult } from '@/domain/types';
import { conciseExplanation } from '@/features/shared';
import { renderWithTheme } from '@/ui/testing';
import { MIN_TEAM_WIDTH, standingsLayout, teamColumnWidth } from '../components/StandingsTable';
import { AddFixtureScreen } from '../screens/AddFixtureScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FixtureDetailScreen } from '../screens/FixtureDetailScreen';
import { FixturesScreen } from '../screens/FixturesScreen';
import { QualificationScreen } from '../screens/QualificationScreen';
import { StandingsScreen } from '../screens/StandingsScreen';
import { WhatIfScreen } from '../screens/WhatIfScreen';
import { tournamentVenues } from '../hooks/useLibrary';
import { impactLabel } from '../selectors/audit';
import { tournamentIndex } from '../selectors/names';
import type { StandingRowVM } from '../selectors/standings';
import { recordsVM } from '../selectors/stats';
import { whatIfNrr } from '../selectors/whatIf';
import { ScheduleDatesSheet } from '../sheets/ScheduleDatesSheet';
import { loadTournament, resetAll } from './support/harness';
import { pickDate, pickTime } from './support/pickers';
import { useTournamentStore } from './support/mockStores';
import { cupSnapshot, evaluated, playGroups, playPair } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const LONG_NAMES: Readonly<Record<string, string>> = {
  LIO: 'Riverside Lions',
  TIG: 'Northside Strikers',
  EAG: 'Eastend Eagles',
  HAW: 'Hilltop Hawks',
  BUL: 'Southbay Bulls',
  BEA: 'Westfield Bears',
  COB: 'Harbour Cobras',
  WOL: 'Westfield Wolves',
};

function withLongNames(snapshot: TournamentSnapshot): TournamentSnapshot {
  return {
    ...snapshot,
    teams: snapshot.teams.map((view) => ({ ...view, team: { ...view.team, name: LONG_NAMES[view.team.id] ?? view.team.name } })),
  };
}

function atWidth<T>(width: number, height: number, run: () => Promise<T>): Promise<T> {
  const original = Dimensions.get('window');
  const next = { ...original, width, height, fontScale: 1, scale: 2 };
  Dimensions.set({ window: next, screen: next });
  return run().finally(() => Dimensions.set({ window: original, screen: original }));
}

function row(overrides: Partial<StandingRowVM> = {}): StandingRowVM {
  return {
    key: 'a:LIO',
    rank: 1,
    position: '1',
    team: 'Northside Strikers',
    teamShort: 'NSS',
    teamId: 'LIO',
    played: 3,
    won: 2,
    lost: 1,
    tied: 0,
    noResult: 0,
    points: 4,
    nrr: '+1.500',
    qualification: null,
    adjustment: null,
    remaining: null,
    note: null,
    muted: false,
    accessibilityLabel: 'Position 1',
    ...overrides,
  };
}

describe('Standings never drop or squash the team column (#12, critical at 320)', () => {
  it('keeps every column when there is room, as in a tablet pane', () => {
    const layout = standingsLayout([row()], false, { width: 820, fontScale: 1 });
    expect(layout.columns.map((column) => column.key)).toEqual(['pos', 'team', 'p', 'w', 'l', 'nr', 'pts', 'nrr']);
    expect(layout.short).toBe(false);
  });

  it('drops NR first at 390 and gives the team column at least the minimum width', () => {
    const layout = standingsLayout([row()], false, { width: 390, fontScale: 1 });
    expect(layout.dropped).toEqual(['nr']);
    expect(layout.columns.map((column) => column.key)).toContain('team');
    expect(teamColumnWidth(layout.columns, 390)).toBeGreaterThanOrEqual(MIN_TEAM_WIDTH);
  });

  it('drops NR, L and P at 320 but always keeps Pos, Team, W, Pts and NRR', () => {
    const layout = standingsLayout([row()], false, { width: 320, fontScale: 1 });
    expect(layout.columns.map((column) => column.key)).toEqual(['pos', 'team', 'w', 'pts', 'nrr']);
    expect(layout.dropped).toEqual(['nr', 'l', 'p']);
    expect(teamColumnWidth(layout.columns, 320)).toBeGreaterThanOrEqual(MIN_TEAM_WIDTH);
    expect(layout.short).toBe(false);
  });

  it('falls back to short team names only when even the reduced table is too narrow', () => {
    const layout = standingsLayout([row()], false, { width: 260, fontScale: 1 });
    expect(layout.short).toBe(true);
    expect(layout.columns.find((column) => column.key === 'team')?.value(row())).toBe('NSS');
  });

  it('shows a team label on every mini-standings row of the dashboard at 320 wide', async () => {
    await atWidth(320, 640, async () => {
      loadTournament(withLongNames(playGroups(cupSnapshot(), 3)));
      await renderWithTheme(<DashboardScreen tournamentId="t1" />);
      for (let n = 1; n <= 4; n += 1) {
        const cell = screen.getByTestId(`dash-standings-cell-a-${n}-team`);
        expect(cell).toHaveTextContent(/\w{3,}/);
        expect(cell.props.numberOfLines).toBeUndefined();
      }
      expect(screen.queryByTestId('dash-standings-cell-a-1-nr')).not.toBeOnTheScreen();
    });
  });

  it('shows full team names on the standings screen at 320 without a hidden-columns note', async () => {
    await atWidth(320, 640, async () => {
      loadTournament(withLongNames(playGroups(cupSnapshot(), 3)));
      await renderWithTheme(<StandingsScreen tournamentId="t1" />);
      const names = [1, 2, 3, 4].map((n) => screen.getByTestId(`standings-cell-a-${n}-team`).props.children as string);
      expect(names.every((name) => Object.values(LONG_NAMES).includes(name))).toBe(true);
      expect(screen.queryByText(/Not shown/)).not.toBeOnTheScreen();
    });
  });

  it('keeps every column and the full names at 820 wide', async () => {
    await atWidth(820, 1180, async () => {
      loadTournament(withLongNames(playGroups(cupSnapshot(), 3)));
      await renderWithTheme(<StandingsScreen tournamentId="t1" />);
      expect(screen.getByTestId('standings-cell-a-1-nr')).toBeOnTheScreen();
    });
  });
});

describe('Standings rows say only what the chip does not (review: standings)', () => {
  it('strips the "still in contention" boilerplate and the repeated rule, keeping the actionable condition', () => {
    expect(conciseExplanation('Lions are still in contention for the Knockouts.', 'Lions')).toBeNull();
    expect(conciseExplanation('Lions are still in contention for the Knockouts. A win against Hawks guarantees qualification.', 'Lions')).toBe(
      'A win against Hawks guarantees qualification.',
    );
    expect(
      conciseExplanation('Lions have mathematically qualified for the Knockouts as Pool A winner (Top 2 from each pool; Points → NRR → Head-to-Head).', 'Lions'),
    ).toBe('Lions have mathematically qualified for the Knockouts as Pool A winner.');
  });

  it('shows no "In contention" chip and no boilerplate sentence on rows still in contention', async () => {
    loadTournament(playGroups(cupSnapshot(), 3));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.queryByText('In contention')).not.toBeOnTheScreen();
    expect(screen.queryByText(/are still in contention/)).not.toBeOnTheScreen();
  });
});

describe('Fixture rows and the fixture page lead with the scores (review: fixtures, completed fixture)', () => {
  it('puts the pairing on its own line, a status chip with the date, the full result and a scoreline', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const played = snapshot.fixtures.find((fixture) => fixture.status === 'completed');
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    const n = played?.matchNumber ?? 0;
    expect(screen.getByTestId(`fixtures-text-status-${n}`)).toHaveTextContent('Completed');
    expect(screen.getByTestId(`fixtures-text-note-${n}`)).toHaveTextContent('Lions won by 6 runs');
    expect(screen.getByTestId(`fixtures-text-score-${n}`)).toHaveTextContent(/LIO.*6\/0.*\(1\)/);
    expect(screen.getByTestId(`fixtures-text-teams-${n}`).props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Played Tue 1 Sep')).toBeOnTheScreen();
  });

  it('filters postponed and cancelled fixtures together under "Called off" so the tab row fits a phone', async () => {
    const base = cupSnapshot();
    const [first, second] = base.fixtures;
    loadTournament({
      ...base,
      fixtures: base.fixtures.map((fixture) =>
        fixture.id === first.id ? { ...fixture, status: 'postponed' } : fixture.id === second.id ? { ...fixture, status: 'cancelled' } : fixture,
      ),
    });
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    expect(screen.getByTestId('fixtures-tab-off')).toHaveTextContent('Called off');
    await fireEvent.press(screen.getByTestId('fixtures-tab-off'));
    expect(screen.getByTestId(`fixtures-row-${first.matchNumber}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`fixtures-row-${second.matchNumber}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('fixtures-tab-postponed')).not.toBeOnTheScreen();
  });

  it('shows both innings totals on a completed fixture page', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const played = snapshot.fixtures.find((fixture) => fixture.status === 'completed');
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={played?.id ?? ''} />);
    const score = screen.getByTestId('fixture-text-score');
    expect(score).toHaveTextContent(/Lions/);
    expect(score).toHaveTextContent(/Tigers/);
    expect(score).toHaveTextContent(/6\/0/);
    expect(screen.getByTestId('fixture-row-played')).toHaveTextContent(/Tue 1 Sep/);
  });
});

describe('Tournament statistics records (#8, review: records)', () => {
  function line(overrides: Partial<TournamentRecordLine>): TournamentRecordLine {
    return { matchId: 'm1', teamId: 'LIO', playerId: null, value: 0, detail: 'v Tigers', ...overrides };
  }

  function stats(overrides: Partial<TournamentStats>): TournamentStats {
    return {
      totalMatches: 15,
      completedMatches: 1,
      totalRuns: 0,
      totalWickets: 0,
      totalFours: 0,
      totalSixes: 0,
      highestTeamScore: null,
      highestIndividualScore: null,
      bestBowling: null,
      mostSixes: null,
      mostFours: null,
      highestPartnership: null,
      teams: [],
      players: [],
      ...overrides,
    };
  }

  it('prints the domain value text and names both batters of a partnership', () => {
    const data = evaluated(cupSnapshot());
    const index = tournamentIndex(data.snapshot, data.evaluation);
    const names = new Map([
      ['p1', 'Rizwan'],
      ['p2', 'Shan'],
      ['p3', 'Shaheen'],
    ]);
    const records = recordsVM(
      index,
      stats({
        bestBowling: line({ playerId: 'p3', value: 1, valueText: '1 wicket', detail: '1/12 v Tigers' }),
        highestPartnership: line({ playerId: 'p1', playerIds: ['p1', 'p2'], value: 26, valueText: '26', detail: '26 runs (14 balls) v Tigers' }),
      }),
      names,
    );
    const bowling = records.find((record) => record.key === 'best-bowling');
    const partnership = records.find((record) => record.key === 'highest-partnership');
    expect(bowling?.value).toBe('1 wicket');
    expect(bowling?.value).not.toMatch(/wkts/);
    expect(partnership?.holder).toBe('Rizwan & Shan (LIO)');
  });
});

describe('What-if shows whether net run rate was simulated (core: what-if NRR)', () => {
  it('labels the column "NRR now", marks uncertain places and lists the notes when no score or margin was given', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals));
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const fixture = data.snapshot.fixtures.find((candidate) => candidate.status === 'scheduled' && candidate.poolId !== null);
    const mn = fixture?.matchNumber ?? 0;
    expect(screen.getByTestId('whatif-btn-reset')).toBeDisabled();
    expect(screen.getByTestId(`whatif-row-${mn}`)).toHaveTextContent(/Pick result/);
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-b`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    expect(screen.getByTestId('whatif-btn-reset')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(screen.getByTestId('whatif-result')).toBeOnTheScreen());
    const result = await whatIf.mock.results[0].value;
    expect(result.nrr?.simulated).toBe(false);
    expect(screen.getAllByText('NRR now', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('whatif-text-nrr-headline')).toHaveTextContent('Net run rate not simulated');
    expect(screen.queryByTestId('whatif-text-nrr-legend')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('whatif-btn-nrr-details'));
    expect(screen.getByTestId('whatif-text-nrr-legend')).toHaveTextContent(/current net run rate/);
    expect(screen.getByTestId('whatif-text-nrr-note-1')).toHaveTextContent(new RegExp(`^${result.nrr?.noteItems?.[0]?.headline ?? ''}`));
  });

  it('passes a winning margin so the simulation can move net run rate', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals));
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const fixture = data.snapshot.fixtures.find((candidate) => candidate.status === 'scheduled' && candidate.poolId !== null);
    const mn = fixture?.matchNumber ?? 0;
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-a`));
    await fireEvent.press(screen.getByTestId('whatif-chip-margin-runs'));
    expect(screen.getByTestId('whatif-btn-done')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('whatif-input-margin-runs'), '25');
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    expect(screen.getByTestId(`whatif-row-${mn}`)).toHaveTextContent(/by 25 runs/);
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(whatIf).toHaveBeenCalled());
    expect(whatIf.mock.calls[0][0][0]).toMatchObject({ outcome: 'side_a_win', score: null, margin: { kind: 'runs', runs: 25 } });
  });

  it('labels a partly estimated NRR column as an estimate rather than the current figure', () => {
    const base = { simulated: false, unscoredFixtureIds: ['f2'], parRunsPerOver: 7, nrrUncertainTeamIds: ['LIO'], notes: [] };
    const partial = whatIfNrr({ nrr: { ...base, estimatedFixtureIds: ['f1'] } } as unknown as WhatIfResult);
    expect(partial.header).toBe('NRR est.');
    expect(partial.legend).toMatch(/^NRR est\. uses the margins you entered/);
    expect(partial.legend).toMatch(/†/);
    expect(partial.headline).toBe('Net run rate partly estimated');
    const none = whatIfNrr({ nrr: { ...base, estimatedFixtureIds: [] } } as unknown as WhatIfResult);
    expect(none.header).toBe('NRR now');
  });
});

describe('Qualification rows are team-specific (review: qualification)', () => {
  it('drops the boilerplate and repeated chip, and shows points and matches left', async () => {
    loadTournament(playGroups(cupSnapshot(), 3));
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    expect(screen.queryByText(/are still in contention for the/)).not.toBeOnTheScreen();
    const first = screen.getByTestId('qual-row-1');
    expect(first).toHaveTextContent(/\d+ pts? · (\d+ left|all played)/);
    expect(within(first).queryByText('In contention')).not.toBeOnTheScreen();
  });
});

describe('Shared controls (venue/structure lists, dates)', () => {
  it('draws single choice lists as design-system radios with a checked state', async () => {
    loadTournament(cupSnapshot({ status: 'fixtures_generated' }));
    await renderWithTheme(<AddFixtureScreen tournamentId="t1" />);
    const stage = screen.getByTestId('addfix-chip-stage-1');
    expect(stage).toHaveProp('accessibilityRole', 'radio');
    expect(stage.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('addfix-chip-stage-2').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId('addfix-chip-stage-1-mark', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('picks dates and start times with pickers, never typed ISO text', async () => {
    const onSubmit = jest.fn();
    await renderWithTheme(<ScheduleDatesSheet visible initialStart="2026-10-03" onClose={jest.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'First match day, Saturday 3 October 2026' })).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('2026-10-03')).not.toBeOnTheScreen();
    expect(screen.queryByDisplayValue('10:00, 14:00')).not.toBeOnTheScreen();
    await pickDate('twiz-input-schedule-start', '2026-11-14');
    await pickTime('twiz-input-time-2', '15:30');
    await fireEvent.press(screen.getByTestId('twiz-btn-add-time'));
    await fireEvent.press(screen.getByTestId('twiz-btn-remove-time-1'));
    await fireEvent.press(screen.getByTestId('twiz-btn-fill-dates'));
    expect(onSubmit).toHaveBeenCalledWith({ startDate: '2026-11-14', matchesPerDay: 2, times: ['15:30', '19:30'] });
  });
});

describe('Audit impact expanders use short labels (review: audit)', () => {
  it('names the number of fixtures instead of the whole headline', () => {
    const base = {
      severity: 'info' as const,
      headline: 'This change affects 7 fixtures.',
      lines: [],
      fixtures: [],
      standings: [],
      qualification: [],
      slots: [],
      nrrChanged: false,
      completedMatchesAffected: 0,
      requiresConfirmation: false,
      requiresReason: false,
      blocked: null,
    };
    const fixture = { fixtureId: 'f1', label: 'M1', change: 'removed' as const, hasMatchData: false };
    expect(impactLabel({ ...base, fixtures: Array.from({ length: 7 }, (_, n) => ({ ...fixture, fixtureId: `f${n}` })) })).toBe('Impact · 7 fixtures');
    expect(impactLabel(base)).toBe('No impact on results');
  });
});

describe('§107 ambient behind every tournament screen with glass chrome (review: tournament-2)', () => {
  it('draws the ambient atmosphere on the standings screen, not only on the dashboard', async () => {
    loadTournament(playGroups(cupSnapshot(), 3));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-standings-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('draws it on the fixtures screen too', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<FixturesScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-fixtures-ambient', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('Fixture venue choices (QA: edit-fixture venue list)', () => {
  it('offers only the tournament venues, keeps a venue already set, and falls back to the library when none were chosen', () => {
    const venue = (id: string) => ({ id, name: id, location: null, notes: null, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', archivedAt: null });
    const library = [venue('central'), venue('harbour'), venue('riverside')];
    expect(tournamentVenues(library, ['central', 'harbour']).map((entry) => entry.id)).toEqual(['central', 'harbour']);
    expect(tournamentVenues(library, ['central'], 'riverside').map((entry) => entry.id)).toEqual(['central', 'riverside']);
    expect(tournamentVenues(library, []).map((entry) => entry.id)).toEqual(['central', 'harbour', 'riverside']);
  });
});

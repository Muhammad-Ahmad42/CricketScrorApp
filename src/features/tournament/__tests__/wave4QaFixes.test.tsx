import '@/ui/testing';
import { Dimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { draftsFromRoundRobin, roundRobin } from '@/domain/tournament/fixtures';
import type { Stage, StageType, Team, TeamId, TournamentSnapshot } from '@/domain/types';
import { space } from '@/ui';
import { renderWithTheme } from '@/ui/testing';
import {
  MIN_TEAM_WIDTH,
  NUMERIC_GAP,
  WIDE_TEAM_WIDTH,
  cellTextWidth,
  standingsLayout,
  teamColumnWidth,
  type StandingsColumn,
} from '../components/StandingsTable';
import { DashboardScreen } from '../screens/DashboardScreen';
import { StandingsScreen } from '../screens/StandingsScreen';
import { FixturesStepScreen, fixtureFormatLine } from '../screens/wizard/FixturesStepScreen';
import { ReviewStepScreen, fixturesLine } from '../screens/wizard/ReviewStepScreen';
import { TeamsStepScreen } from '../screens/wizard/TeamsStepScreen';
import { dashboardVM } from '../selectors/dashboard';
import { tournamentIndex } from '../selectors/names';
import { stageLine, structureShortLabel } from '../selectors/stages';
import type { StandingRowVM } from '../selectors/standings';
import { libraryTeams, liveWizard, loadTournament, resetAll } from './support/harness';
import { useTeamLibraryStore, useTournamentStore } from './support/mockStores';
import { T_ID, asFixture, counter, cupSnapshot, evaluated, leagueSnapshot, playFixture, teamSide } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const LEAGUE_NAMES = ['Northside Strikers', 'Riverside Lions', 'Eastside Eagles', 'Westside Warriors'];

function atWindow<T>(width: number, height: number, fontScale: number, run: () => Promise<T>): Promise<T> {
  const original = Dimensions.get('window');
  const next = { ...original, width, height, fontScale, scale: 2 };
  Dimensions.set({ window: next, screen: next });
  return run().finally(() => Dimensions.set({ window: original, screen: original }));
}

function teamIdOf(snapshot: TournamentSnapshot, index: number): TeamId {
  return snapshot.teams[index].team.id;
}

function cityLeague(played: boolean): TournamentSnapshot {
  const base = leagueSnapshot(4);
  const teams = base.teams.map((view, index) => ({ ...view, team: { ...view.team, name: LEAGUE_NAMES[index] } }));
  const fixtures = draftsFromRoundRobin(
    roundRobin(teams.map((view) => teamSide(view.team.id)), 1),
    { tournamentId: T_ID, stageId: 'league', poolId: 'league-pool', formatId: null, matchRules: null, venueId: null, startMatchNumber: 1 },
    counter('lf'),
  ).map(asFixture);
  const snapshot: TournamentSnapshot = {
    ...base,
    tournament: { ...base.tournament, name: 'City Champions League', structureKind: 'groups_knockout' },
    teams,
    pools: base.pools.map((pool) => ({ ...pool, name: 'Pool A' })),
    fixtures: fixtures.map((fixture, index) => (index === 0 ? { ...fixture, scheduledDate: '2026-10-06' } : fixture)),
  };
  if (!played) {
    return snapshot;
  }
  const first = snapshot.fixtures[0];
  const a = first.sideA.kind === 'team' ? first.sideA.teamId : teamIdOf(snapshot, 0);
  const b = first.sideB.kind === 'team' ? first.sideB.teamId : teamIdOf(snapshot, 1);
  return playFixture(snapshot, first.id, a, b, b, 23);
}

function stage(type: StageType, orderIndex: number, name = type): Stage {
  const base = leagueSnapshot(4).stages[0];
  return { ...base, id: `${type}-${orderIndex}`, name, type, orderIndex };
}

function row(overrides: Partial<StandingRowVM> = {}): StandingRowVM {
  return {
    key: 'a:LIO',
    rank: 1,
    position: '1',
    team: 'Westside Warriors',
    teamShort: 'WAR',
    teamId: 'LIO',
    played: 1,
    won: 1,
    lost: 0,
    tied: 0,
    noResult: 0,
    points: 2,
    nrr: '+11.500',
    qualification: null,
    adjustment: null,
    remaining: null,
    note: null,
    muted: false,
    accessibilityLabel: 'Position 1',
    ...overrides,
  };
}

function column(columns: readonly StandingsColumn[], key: StandingsColumn['key']): StandingsColumn {
  const found = columns.find((candidate) => candidate.key === key);
  if (!found) {
    throw new Error(`No ${key} column`);
  }
  return found;
}

describe('Dashboard header shows the confirmed format, not the wizard default (QA: League shown as Groups + KO)', () => {
  it('derives League from a league-only tournament even when the stored kind says groups + knockout', async () => {
    await atWindow(411, 914, 1, async () => {
      loadTournament(cityLeague(false));
      await renderWithTheme(<DashboardScreen tournamentId="t1" />);
      expect(screen.getByText('4 teams · League · T20')).toBeOnTheScreen();
      expect(screen.queryByText(/Groups \+ KO/)).not.toBeOnTheScreen();
      expect(screen.getByText('Standings · League')).toBeOnTheScreen();
      expect(screen.queryByText(/Pool A/)).not.toBeOnTheScreen();
    });
  });

  it('keeps Groups + KO for a real groups-then-knockout tournament', () => {
    const vm = dashboardVM(tournamentIndex(cupSnapshot(), evaluated(cupSnapshot()).evaluation));
    expect(vm.metaLine).toBe('8 teams · 2 pools · Groups + KO · T20');
  });

  it('labels every stage shape from the stages themselves', () => {
    expect(structureShortLabel([stage('league', 0)], 'groups_knockout')).toBe('League');
    expect(structureShortLabel([stage('group', 0)], 'league')).toBe('Groups');
    expect(structureShortLabel([stage('knockout', 0)], 'league')).toBe('Knockout');
    expect(structureShortLabel([stage('knockout', 1), stage('group', 0)], 'league')).toBe('Groups + KO');
    expect(structureShortLabel([stage('league', 0), stage('knockout', 1)], 'groups')).toBe('League + KO');
    expect(structureShortLabel([stage('knockout', 0), stage('league', 1)], 'league')).toBe('Custom');
    expect(structureShortLabel([stage('custom', 0)], 'league')).toBe('Custom');
    expect(structureShortLabel([], 'knockout')).toBe('Knockout');
  });
});

describe('Dashboard progress is said once (QA: "1 of 6 played" + "1 of 6 matches played")', () => {
  it('drops the repeated detail line for a single-stage tournament', async () => {
    await atWindow(411, 914, 1, async () => {
      loadTournament(cityLeague(true));
      await renderWithTheme(<DashboardScreen tournamentId="t1" />);
      expect(screen.getByTestId('dash-text-progress')).toHaveTextContent('1 of 6 played');
      expect(screen.queryByTestId('dash-text-progress-detail')).not.toBeOnTheScreen();
      expect(screen.queryByText(/matches played/)).not.toBeOnTheScreen();
    });
  });

  it('keeps the detail line when it adds the overall count of a multi-stage tournament', () => {
    const vm = dashboardVM(tournamentIndex(cupSnapshot(), evaluated(cupSnapshot()).evaluation));
    expect(vm.progressDetail).toMatch(/overall/);
  });
});

describe('Standings numbers never run together (QA: "2 +11.500")', () => {
  it('sizes every numeric column from its content and separates them by at least space.sm', () => {
    const rows = [row(), row({ key: 'a:TIG', position: '2', team: 'Northside Strikers', won: 0, lost: 1, points: 0, nrr: '-11.500' })];
    const { columns } = standingsLayout(rows, false, { width: 820, fontScale: 1 });
    expect(NUMERIC_GAP).toBeGreaterThanOrEqual(space.sm);
    expect(column(columns, 'nrr').width).toBeGreaterThanOrEqual(cellTextWidth('+11.500', 'tableNumeric'));
    expect(column(columns, 'pts').width).toBeGreaterThanOrEqual(cellTextWidth('Pts', 'label'));
    expect(column(columns, 'p').width).toBeLessThan(column(columns, 'nrr').width ?? 0);
  });

  it('renders Pts and NRR as separate cells with the gutter between them on the dashboard', async () => {
    await atWindow(411, 914, 1, async () => {
      loadTournament(cityLeague(true));
      await renderWithTheme(<DashboardScreen tournamentId="t1" />);
      const pts = screen.getByTestId('dash-standings-cell-a-1-pts');
      const nrr = screen.getByTestId('dash-standings-cell-a-1-nrr');
      expect(pts).toHaveTextContent('2');
      expect(nrr).toHaveTextContent(/^\+\d+\.\d{3}$/);
      const cells = pts.parent?.parent;
      expect(cells).toBeDefined();
      expect(cells?.props.style).toEqual(expect.objectContaining({ gap: NUMERIC_GAP }));
    });
  });
});

describe('Standings headers fit at large text (QA: "P…", "W" over "PT…")', () => {
  it('makes every column at least as wide as its header at font scale 1.3 (Android reports 1.2999)', () => {
    const { columns } = standingsLayout([row()], false, { width: 411, fontScale: 1.2999999523162842 });
    for (const candidate of columns.filter((entry) => entry.width !== null)) {
      expect(candidate.width).toBeGreaterThanOrEqual(cellTextWidth(candidate.header, 'label', 1.3));
    }
    expect(teamColumnWidth(columns, 411)).toBeGreaterThanOrEqual(Math.round(MIN_TEAM_WIDTH * 1.3));
  });

  it('lets headers wrap instead of truncating them', async () => {
    await atWindow(411, 914, 1, async () => {
      loadTournament(cityLeague(true));
      await renderWithTheme(<DashboardScreen tournamentId="t1" />);
      for (const key of ['pos', 'pts', 'nrr']) {
        expect(screen.getByTestId(`dash-standings-header-a-${key}`, { includeHiddenElements: true }).props.numberOfLines).toBeUndefined();
      }
    });
  });
});

describe('Standings give the team column the room on tablets (QA: names wrap at 800 dp)', () => {
  it('drops the least important column in a tablet pane until the team column reaches the wide target', () => {
    const layout = standingsLayout([row({ nrr: '+1.500' })], false, { width: 448, fontScale: 1, gutter: space['2xl'], teamTarget: WIDE_TEAM_WIDTH });
    expect(teamColumnWidth(layout.columns, 448, space['2xl'])).toBeGreaterThanOrEqual(WIDE_TEAM_WIDTH);
    expect(layout.dropped).toEqual(['nr']);
    expect(layout.short).toBe(false);
  });

  it('keeps every column on a phone-width table that already fits the compact target', () => {
    const layout = standingsLayout([row({ nrr: '+1.500' })], false, { width: 448, fontScale: 1, gutter: space['2xl'] });
    expect(layout.dropped).toEqual([]);
  });

  it('gives the full standings screen all columns and the remaining width to the team at 800 wide', async () => {
    await atWindow(800, 1280, 1, async () => {
      loadTournament(cityLeague(true));
      await renderWithTheme(<StandingsScreen tournamentId="t1" />);
      expect(screen.getByTestId('standings-cell-a-1-nr')).toBeOnTheScreen();
      expect(screen.getByTestId('standings-cell-a-1-l')).toBeOnTheScreen();
    });
  });
});

describe('Standings footer says only what helps (QA copy)', () => {
  it('does not add "Positions can still change." or a hidden-columns note', async () => {
    await atWindow(320, 640, 1, async () => {
      loadTournament(cityLeague(true));
      await renderWithTheme(<StandingsScreen tournamentId="t1" />);
      expect(screen.queryByText('Positions can still change.')).not.toBeOnTheScreen();
      expect(screen.queryByText(/Not shown/)).not.toBeOnTheScreen();
    });
  });
});

describe('Wizard New team works like the match-setup New team (QA: 2–5 vs 2–4, no auto short name, false discard)', () => {
  const created = (name: string, shortName: string): Team => ({ ...libraryTeams(['NEW'])[0], id: `team-${shortName}`, name, shortName });

  async function openNewTeam() {
    liveWizard({ tournamentId: 't1' }, 'teams');
    const createTeam = jest.fn(async (input: { readonly name: string; readonly shortName: string }) => created(input.name, input.shortName));
    useTeamLibraryStore.setState({ teams: [], createTeam });
    await renderWithTheme(<TeamsStepScreen />);
    await fireEvent.press(screen.getByTestId('twiz-btn-add-team'));
    await fireEvent.press(screen.getByTestId('twiz-btn-new-team'));
    return createTeam;
  }

  it('suggests the short name from the team name and uses the 2–4 letter rule', async () => {
    const createTeam = await openNewTeam();
    expect(screen.getByText('2–4 letters')).toBeOnTheScreen();
    expect(screen.queryByText('2–5 letters')).not.toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('twiz-input-team-name'), 'Northside Strikers');
    expect(screen.getByTestId('twiz-input-team-short')).toHaveProp('value', 'NOR');
    expect(screen.getByTestId('twiz-input-team-short')).toHaveProp('maxLength', 4);
    expect(screen.getByTestId('twiz-btn-create-team')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('twiz-btn-create-team'));
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith({ name: 'Northside Strikers', shortName: 'NOR', players: [] }));
  });

  it('rejects a one-letter short name like the match-setup sheet', async () => {
    await openNewTeam();
    await fireEvent.changeText(screen.getByTestId('twiz-input-team-name'), 'Northside Strikers');
    await fireEvent.changeText(screen.getByTestId('twiz-input-team-short'), 'n');
    expect(screen.getByText('Use 2 to 4 letters', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('twiz-btn-create-team')).toBeDisabled();
  });

  it('resets the form after each create, so Done on the empty form closes without "Discard changes?"', async () => {
    const createTeam = await openNewTeam();
    for (const name of ['Northside Strikers', 'Riverside Lions']) {
      await fireEvent.changeText(screen.getByTestId('twiz-input-team-name'), name);
      await fireEvent.press(screen.getByTestId('twiz-btn-create-team'));
      await waitFor(() => expect(screen.getByTestId('twiz-input-team-name')).toHaveProp('value', ''));
    }
    expect(createTeam).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('twiz-input-team-short')).toHaveProp('value', '');
    await fireEvent.press(screen.getByTestId('twiz-btn-new-team-done'));
    expect(screen.queryByTestId('dialog-discard')).not.toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('twiz-input-team-name')).not.toBeOnTheScreen());
  });

  it('still asks before discarding a half-typed team', async () => {
    await openNewTeam();
    await fireEvent.changeText(screen.getByTestId('twiz-input-team-name'), 'Eastside');
    await fireEvent.press(screen.getByTestId('twiz-btn-new-team-done'));
    expect(screen.getByTestId('dialog-discard')).toBeOnTheScreen();
  });
});

describe('Wizard copy says each fact once (QA copy)', () => {
  it('reviews a league as "League · single round robin"', async () => {
    const league = cityLeague(false);
    liveWizard(
      {
        tournamentId: 't1',
        info: { name: 'City Champions League', season: null, description: null, organizer: null, startDate: null, endDate: null, venueIds: [], structureKind: 'league', templateId: null },
        teams: league.teams.map((view) => ({ teamId: view.team.id, seed: null })),
        rules: league.rules,
        stages: league.stages,
        pools: league.pools,
      },
      'review',
    );
    useTeamLibraryStore.setState({ teams: league.teams.map((view) => view.team) });
    useTournamentStore.setState({ tournamentId: 't1', snapshot: league });
    await renderWithTheme(<ReviewStepScreen />);
    expect(screen.getByTestId('twiz-review-format')).toHaveTextContent(/^League · single round robin$/);
    expect(screen.getByTestId('twiz-review-fixtures')).toHaveTextContent('6 matches · 1 dated');
  });

  it('summarises fixture dates without calling undated matches scheduled', () => {
    const dated = { scheduledDate: '2026-10-06' };
    const undated = { scheduledDate: null };
    expect(fixturesLine([dated, undated, undated])).toBe('3 matches · 1 dated');
    expect(fixturesLine([undated, undated])).toBe('2 matches · dates to be set');
    expect(fixturesLine([dated, dated])).toBe('2 matches · all dated');
  });

  it('describes the first stage without "Each pool" for a league', () => {
    const league = cityLeague(false);
    expect(fixtureFormatLine(league.stages[0], league.pools)).toBe('Single round robin');
    const cup = cupSnapshot();
    const groups = [...cup.stages].sort((a, b) => a.orderIndex - b.orderIndex)[0];
    expect(fixtureFormatLine(groups, cup.pools)).toBe('Single round robin · 2 pools');
    expect(stageLine(league.stages[0], league.pools, new Map())).toBe('League · single round robin');
  });

  it('keeps the draw number behind "Repeat a draw" on the fixtures step', async () => {
    const league = cityLeague(false);
    liveWizard(
      {
        tournamentId: 't1',
        teams: league.teams.map((view) => ({ teamId: view.team.id, seed: null })),
        rules: league.rules,
        stages: league.stages,
        pools: league.pools,
      },
      'fixtures',
    );
    useTournamentStore.setState({ tournamentId: 't1', snapshot: { ...league, fixtures: [] } });
    await renderWithTheme(<FixturesStepScreen />);
    expect(screen.getByTestId('twiz-text-fixture-format')).toHaveTextContent('Single round robin');
    expect(screen.queryByText(/Draw number/)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('twiz-btn-fixture-repeat-draw'));
    expect(screen.getByTestId('twiz-input-fixture-seed')).toBeOnTheScreen();
    expect(screen.queryByText(/optional/)).not.toBeOnTheScreen();
  });
});

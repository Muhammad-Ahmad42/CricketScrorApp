import '@/ui/testing';
import { act, configure, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import type { Fixture } from '@/domain/types';
import { createSqlJsDatabase } from '@/db/testing';
import { createTestApp, type TestApp } from '@/services/testing';
import { expectOk } from '@/services/__tests__/support/app';
import { createLeague, type League } from '@/services/__tests__/support/league';
import { createSide, sixNames, type Side } from '@/services/__tests__/support/sides';
import { useLiveMatchStore, useTournamentStore } from '@/stores';
import { clearAppServices, setAppServices } from '@/stores/services';
import { resetStores } from '@/stores/__tests__/support/harness';
import { renderWithTheme } from '@/ui/testing';
import { APP_ROUTES, AppHost } from './support/appHost';
import { currentPath, stackPaths, startAt, unmatchedPaths } from './support/appRouter';
import { sourceTree } from './sourceTree';

jest.mock('expo-router', () => jest.requireActual('./support/appRouter').expoRouterModule);
jest.mock('expo-router/js-tabs', () => jest.requireActual('./support/appRouter').jsTabsModule);
jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [true, null]) }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));
jest.mock('expo-crypto', () => {
  let next = 0;
  return {
    randomUUID: () => {
      next += 1;
      return `uuid-${next}`;
    },
  };
});

jest.setTimeout(180000);
configure({ asyncUtilTimeout: 15000 });

type User = ReturnType<typeof userEvent.setup>;

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

let app: TestApp;
let user: User;

beforeAll(() => {
  Dimensions.set({ window: PHONE, screen: PHONE });
});

afterAll(() => {
  Dimensions.set(original);
});

beforeEach(async () => {
  resetStores();
  clearAppServices();
  app = createTestApp(await createSqlJsDatabase());
  setAppServices(app);
  expectOk(await app.bootstrap());
  user = userEvent.setup();
});

afterEach(() => {
  expect(unmatchedPaths()).toEqual([]);
});

function eventCount(): number {
  return useLiveMatchStore.getState().live?.events.length ?? 0;
}

async function press(testID: string): Promise<void> {
  await user.press(await screen.findByTestId(testID));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

async function onRoute(path: string): Promise<void> {
  await waitFor(() => expect(currentPath()).toBe(path));
}

async function deliver(testID: string): Promise<void> {
  const before = eventCount();
  await press(testID);
  await waitFor(() => expect(eventCount()).toBeGreaterThan(before));
  await waitFor(() => expect(useLiveMatchStore.getState().status).toBe('ready'));
}

async function runs(...values: readonly number[]): Promise<void> {
  for (const value of values) {
    await deliver(`score-btn-${value}`);
  }
}

async function wide(): Promise<void> {
  await press('score-btn-extras');
  await deliver('extras-chip-wd');
}

async function bowled(): Promise<void> {
  await press('score-btn-wicket');
  await deliver('wicket-btn-bowled');
}

async function nextBowler(bowler: Side, number: number): Promise<void> {
  await screen.findByTestId('prompt-next-bowler');
  await deliver(`prompt-bowler-${bowler.p(number)}`);
}

async function startSecondInnings(batting: Side, fielding: Side): Promise<void> {
  await press('prompt-innings-continue');
  await press('prompt-start-striker');
  await press(`prompt-start-striker-${batting.p(1)}`);
  await press('prompt-start-nonStriker');
  await press(`prompt-start-nonStriker-${batting.p(2)}`);
  await press('prompt-start-bowler');
  await press(`prompt-start-bowler-${fielding.p(6)}`);
  await deliver('prompt-start-submit');
}

async function pickSquads(first: Side, second: Side): Promise<void> {
  await screen.findByTestId(`setup-player-${first.p(1)}`);
  await press('setup-players-all');
  await press('setup-players-tab-B');
  await screen.findByTestId(`setup-player-${second.p(1)}`);
  await press('setup-players-all');
  await press('wizard-btn-next');
  await onRoute('/match/new/toss');
}

async function tossAndOpeners(winner: Side, fielding: Side): Promise<string> {
  await press(`setup-toss-winner-${winner.team.id}`);
  await press('setup-toss-bat');
  expect(screen.getByTestId('setup-toss-summary')).toHaveTextContent(`${winner.team.name} will bat first.`);
  await press('wizard-btn-next');
  await onRoute('/match/new/openers');
  await press('setup-opener-bowlerId');
  await press(`setup-opener-bowlerId-${fielding.p(6)}`);
  await press('wizard-btn-next');
  await waitFor(() => expect(currentPath()).toMatch(/^\/match\/[^/]+\/score$/));
  await screen.findByTestId('screen-score');
  await waitFor(() => expect(useLiveMatchStore.getState().live).not.toBeNull());
  return currentPath().split('/')[2];
}

function routeFiles(): readonly string[] {
  return sourceTree('src/app')
    .map((source) => source.rel.replace(/^src\/app/, '').replace(/\.tsx$/, ''))
    .filter((rel) => !rel.endsWith('/_layout'))
    .map((rel) => rel.replace(/\/\([^)]+\)/g, '').replace(/\/index$/, ''))
    .map((rel) => (rel === '' ? '/' : rel))
    .sort();
}

describe('app routes (ARCHITECTURE §9)', () => {
  it('the integration host registers exactly the route files in src/app', () => {
    expect([...APP_ROUTES.map((route) => route.pattern)].sort()).toEqual(routeFiles());
  });
});

describe('standalone match, end to end through the real screens, stores and services (§64, §65, §81)', () => {
  it('sets up a 2-over match, scores it ball by ball to a result and finds it in History', async () => {
    const lions = await createSide(app, 'Lions', 'LIO', sixNames('Lion'));
    const tigers = await createSide(app, 'Tigers', 'TIG', sixNames('Tiger'));
    startAt('/');
    await renderWithTheme(<AppHost />);

    await press('home-btn-new-match');
    await onRoute('/match/new');
    await user.type(await screen.findByTestId('setup-overs-custom'), '2');
    await press('wizard-btn-next');
    await onRoute('/match/new/teams');

    await press('setup-team-A');
    await press(`team-picker-${lions.team.id}`);
    await press('setup-team-B');
    await press(`team-picker-${tigers.team.id}`);
    await press('wizard-btn-next');
    await onRoute('/match/new/players');

    await pickSquads(lions, tigers);
    const matchId = await tossAndOpeners(lions, tigers);
    expect(stackPaths()).toEqual(['/', `/match/${matchId}/score`]);
    expect(useLiveMatchStore.getState().live?.match.rules.oversPerInnings).toBe(2);

    await runs(1, 4, 0);
    await wide();
    await runs(6, 2, 1);
    await nextBowler(tigers, 5);
    expect(screen.getByTestId('score-text-overs')).toHaveTextContent('1.0');
    await runs(0);
    await bowled();
    await runs(1, 4, 0, 1);
    await screen.findByTestId('prompt-innings-confirm');
    expect(screen.getByTestId('score-text-score')).toHaveProp('accessibilityLabel', 'Lions 21 for 1');

    await startSecondInnings(tigers, lions);
    expect(screen.getByTestId('score-text-target')).toHaveProp('accessibilityLabel', 'Target 22');
    await runs(4, 4, 1, 0, 2, 1);
    await nextBowler(lions, 5);
    await runs(6, 4);

    expect(await screen.findByTestId('prompt-result-text')).toHaveTextContent(/Tigers won/);
    await press('prompt-confirm-btn');
    await onRoute(`/match/${matchId}/scorecard`);
    expect(await screen.findByTestId('scorecard-result')).toHaveTextContent(/Tigers won/);

    await press('top-bar-back');
    await onRoute('/');
    await press('tab-history');
    await onRoute('/history');
    const row = await screen.findByTestId(`history-row-${matchId}`);
    expect(within(row).getByText('Lions v Tigers')).toBeOnTheScreen();
    expect(within(row).getByText(/Tigers won/)).toBeOnTheScreen();
    await settle();

    const stored = expectOk(await app.matches.load(matchId));
    expect(stored.match.status).toBe('completed');
    expect(stored.state.innings.map((innings) => [innings.runs, innings.wickets])).toEqual([
      [21, 1],
      [22, 0],
    ]);
  });
});

describe('tournament fixture → match routes → standings (§66, §50)', () => {
  let league: League;

  function firstFixture(fixtures: readonly Fixture[]): Fixture {
    const [first] = [...fixtures].sort((a, b) => a.matchNumber - b.matchNumber);
    return first;
  }

  it('starts the next fixture from the dashboard, plays it and shows the refreshed standings', async () => {
    league = await createLeague(app);
    const { snapshot } = await league.evaluate();
    const fixture = firstFixture(snapshot.fixtures);
    const [home, away] = league.sidesOf(fixture);
    startAt('/tournaments');
    await renderWithTheme(<AppHost />);

    await press('tournaments-row-1');
    await onRoute(`/tournament/${league.tournamentId}`);
    await screen.findByTestId('dash-row-next-match');
    await press('dash-btn-start-next');
    await onRoute('/match/new/players');
    expect(stackPaths()).toEqual(['/tournaments', `/tournament/${league.tournamentId}`, '/match/new/players']);

    await pickSquads(home, away);
    const matchId = await tossAndOpeners(home, away);
    expect(useLiveMatchStore.getState().live?.match.fixtureId).toBe(fixture.id);
    expect(stackPaths()).toEqual(['/tournaments', `/tournament/${league.tournamentId}`, `/match/${matchId}/score`]);

    await runs(1, 1, 1, 1, 1, 1);
    await nextBowler(away, 5);
    await runs(1, 1, 1, 1, 1, 1);
    await startSecondInnings(away, home);
    await runs(6, 6, 1);
    expect(await screen.findByTestId('prompt-result-text')).toHaveTextContent(new RegExp(`${away.team.name} won`));
    await press('prompt-confirm-btn');
    await onRoute(`/match/${matchId}/scorecard`);
    await waitFor(() =>
      expect(useTournamentStore.getState().snapshot?.fixtures.find((entry) => entry.id === fixture.id)?.status).toBe('completed'),
    );

    await press('top-bar-back');
    await onRoute(`/tournament/${league.tournamentId}`);
    expect(screen.getByLabelText(new RegExp(`^Position 1, ${away.team.name}, played 1, won 1, lost 0, no result 0, 2 points`))).toBeOnTheScreen();
    expect(screen.getByLabelText(new RegExp(`^Position \\d, ${home.team.name}, played 1, won 0, lost 1, no result 0, 0 points`))).toBeOnTheScreen();

    await press('dash-btn-standings-full');
    await onRoute(`/tournament/${league.tournamentId}/standings`);
    expect(await screen.findByLabelText(new RegExp(`^Position 1, ${away.team.name}, played 1, won 1`))).toBeOnTheScreen();
    await settle();

    await act(async () => {
      await useTournamentStore.getState().refresh();
    });
    const { evaluation } = await league.evaluate();
    const rows = evaluation.stages.flatMap((stage) => stage.tables.flatMap((table) => table.rows));
    expect(rows.find((entry) => entry.teamId === away.team.id)).toMatchObject({ played: 1, won: 1, points: 2 });
  });
});

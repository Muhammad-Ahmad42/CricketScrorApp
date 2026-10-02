import '@/ui/testing';
import type { ComponentType } from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import TournamentsRoute from '@/app/(tabs)/tournaments';
import TournamentLayout from '@/app/tournament/[tournamentId]/_layout';
import AuditRoute from '@/app/tournament/[tournamentId]/audit';
import BracketRoute from '@/app/tournament/[tournamentId]/bracket';
import FixtureRoute from '@/app/tournament/[tournamentId]/fixtures/[fixtureId]';
import FixturesRoute from '@/app/tournament/[tournamentId]/fixtures/index';
import AddFixtureRoute from '@/app/tournament/[tournamentId]/fixtures/new';
import DashboardRoute from '@/app/tournament/[tournamentId]/index';
import ManageRoute from '@/app/tournament/[tournamentId]/manage';
import PoolsRoute from '@/app/tournament/[tournamentId]/pools';
import QualificationRoute from '@/app/tournament/[tournamentId]/qualification';
import StageRoute from '@/app/tournament/[tournamentId]/stages/[stageId]';
import StagesRoute from '@/app/tournament/[tournamentId]/stages/index';
import StandingsRoute from '@/app/tournament/[tournamentId]/standings';
import StatsRoute from '@/app/tournament/[tournamentId]/stats';
import TeamsRoute from '@/app/tournament/[tournamentId]/teams';
import WhatIfRoute from '@/app/tournament/[tournamentId]/what-if';
import WizardLayout from '@/app/tournament/new/_layout';
import WizardFixturesRoute from '@/app/tournament/new/fixtures';
import WizardInfoRoute from '@/app/tournament/new/index';
import WizardPoolsRoute from '@/app/tournament/new/pools';
import WizardReviewRoute from '@/app/tournament/new/review';
import WizardRulesRoute from '@/app/tournament/new/rules';
import WizardStructureRoute from '@/app/tournament/new/structure';
import WizardTeamsRoute from '@/app/tournament/new/teams';
import { loadTournament, resetAll } from './support/harness';
import { useTournamentStore } from './support/mockStores';
import { mockParams } from './support/router';
import { cupSnapshot } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const TOURNAMENT_ROUTES: readonly (readonly [string, ComponentType, string])[] = [
  ['dashboard', DashboardRoute, 'screen-tournament'],
  ['standings', StandingsRoute, 'screen-standings'],
  ['fixtures', FixturesRoute, 'screen-fixtures'],
  ['add fixture', AddFixtureRoute, 'screen-add-fixture'],
  ['pools', PoolsRoute, 'screen-pools'],
  ['stages', StagesRoute, 'screen-stages'],
  ['qualification', QualificationRoute, 'screen-qualification'],
  ['bracket', BracketRoute, 'screen-bracket'],
  ['what-if', WhatIfRoute, 'screen-what-if'],
  ['stats', StatsRoute, 'screen-tournament-stats'],
  ['audit', AuditRoute, 'screen-audit'],
  ['teams', TeamsRoute, 'screen-tournament-teams'],
  ['manage', ManageRoute, 'screen-tournament-manage'],
];

const WIZARD_ROUTES: readonly (readonly [string, ComponentType])[] = [
  ['info', WizardInfoRoute],
  ['teams', WizardTeamsRoute],
  ['structure', WizardStructureRoute],
  ['rules', WizardRulesRoute],
  ['pools', WizardPoolsRoute],
  ['fixtures', WizardFixturesRoute],
  ['review', WizardReviewRoute],
];

describe('thin routes (ARCHITECTURE §9)', () => {
  it.each(TOURNAMENT_ROUTES)('renders the %s screen from the route params', async (_name, Route, testID) => {
    loadTournament(cupSnapshot());
    mockParams.current = { tournamentId: 't1' };
    await renderWithTheme(<Route />);
    expect(screen.getByTestId(testID)).toBeOnTheScreen();
  });

  it.each(WIZARD_ROUTES)('renders the %s wizard step', async (_name, Route) => {
    await renderWithTheme(<Route />);
    expect(screen.getByTestId('screen-tournament-new')).toBeOnTheScreen();
  });

  it('passes nested ids to the fixture and stage screens', async () => {
    const data = loadTournament(cupSnapshot());
    mockParams.current = { tournamentId: 't1', fixtureId: data.snapshot.fixtures[0].id };
    await renderWithTheme(<FixtureRoute />);
    expect(screen.getByTestId('screen-fixture')).toBeOnTheScreen();
    expect(screen.getByTestId('fixture-text-teams')).toBeOnTheScreen();
  });

  it('renders the stage screen', async () => {
    const data = loadTournament(cupSnapshot());
    mockParams.current = { tournamentId: 't1', stageId: data.snapshot.stages[0].id };
    await renderWithTheme(<StageRoute />);
    expect(screen.getByTestId('stage-text-entry')).toBeOnTheScreen();
  });

  it('opens the tournament in the shared store from the layout', async () => {
    mockParams.current = { tournamentId: 't9' };
    await renderWithTheme(<TournamentLayout />);
    expect(useTournamentStore.getState().open).toHaveBeenCalledWith('t9');
  });

  it('renders the wizard layout and the tournaments tab', async () => {
    await renderWithTheme(<WizardLayout />);
    await renderWithTheme(<TournamentsRoute />);
    expect(screen.getByTestId('screen-tournaments')).toBeOnTheScreen();
  });
});

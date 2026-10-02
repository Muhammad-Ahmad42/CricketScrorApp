import type { ComponentType } from 'react';
import RootLayout from '@/app/_layout';
import TabsLayout from '@/app/(tabs)/_layout';
import HistoryRoute from '@/app/(tabs)/history';
import HomeRoute from '@/app/(tabs)/index';
import SettingsRoute from '@/app/(tabs)/settings';
import TournamentsRoute from '@/app/(tabs)/tournaments';
import MatchLayout from '@/app/match/[matchId]/_layout';
import AnalyticsRoute from '@/app/match/[matchId]/analytics';
import BallsRoute from '@/app/match/[matchId]/balls';
import EditBallRoute from '@/app/match/[matchId]/edit/[seq]';
import ManageRoute from '@/app/match/[matchId]/manage';
import ScoreRoute from '@/app/match/[matchId]/score';
import ScorecardRoute from '@/app/match/[matchId]/scorecard';
import NewMatchLayout from '@/app/match/new/_layout';
import NewMatchRoute from '@/app/match/new/index';
import NewMatchOpenersRoute from '@/app/match/new/openers';
import NewMatchPlayersRoute from '@/app/match/new/players';
import NewMatchTeamsRoute from '@/app/match/new/teams';
import NewMatchTossRoute from '@/app/match/new/toss';
import AboutRoute from '@/app/settings/about';
import BackupRoute from '@/app/settings/backup';
import DiagnosticsRoute from '@/app/settings/diagnostics';
import PresetsRoute from '@/app/settings/presets';
import TeamRoute from '@/app/teams/[teamId]';
import TeamsRoute from '@/app/teams/index';
import TournamentLayout from '@/app/tournament/[tournamentId]/_layout';
import TournamentAuditRoute from '@/app/tournament/[tournamentId]/audit';
import TournamentBracketRoute from '@/app/tournament/[tournamentId]/bracket';
import TournamentFixtureRoute from '@/app/tournament/[tournamentId]/fixtures/[fixtureId]';
import TournamentFixturesRoute from '@/app/tournament/[tournamentId]/fixtures/index';
import TournamentAddFixtureRoute from '@/app/tournament/[tournamentId]/fixtures/new';
import TournamentDashboardRoute from '@/app/tournament/[tournamentId]/index';
import TournamentManageRoute from '@/app/tournament/[tournamentId]/manage';
import TournamentPoolsRoute from '@/app/tournament/[tournamentId]/pools';
import TournamentQualificationRoute from '@/app/tournament/[tournamentId]/qualification';
import TournamentStageRoute from '@/app/tournament/[tournamentId]/stages/[stageId]';
import TournamentStagesRoute from '@/app/tournament/[tournamentId]/stages/index';
import TournamentStandingsRoute from '@/app/tournament/[tournamentId]/standings';
import TournamentStatsRoute from '@/app/tournament/[tournamentId]/stats';
import TournamentTeamsRoute from '@/app/tournament/[tournamentId]/teams';
import TournamentWhatIfRoute from '@/app/tournament/[tournamentId]/what-if';
import TournamentWizardLayout from '@/app/tournament/new/_layout';
import TournamentFixturesStepRoute from '@/app/tournament/new/fixtures';
import TournamentInfoRoute from '@/app/tournament/new/index';
import TournamentPoolsStepRoute from '@/app/tournament/new/pools';
import TournamentReviewRoute from '@/app/tournament/new/review';
import TournamentRulesRoute from '@/app/tournament/new/rules';
import TournamentStructureRoute from '@/app/tournament/new/structure';
import TournamentTeamsStepRoute from '@/app/tournament/new/teams';
import { configureRoutes, NavigatorHost, type GroupDef, type RouteDef } from './appRouter';

const TABS: GroupDef = { id: '(tabs)', prefix: '', layout: TabsLayout, tabs: true };
const NEW_MATCH: GroupDef = { id: 'match/new', prefix: '/match/new', layout: NewMatchLayout, tabs: false };
const MATCH: GroupDef = { id: 'match/[matchId]', prefix: '/match/[matchId]', layout: MatchLayout, tabs: false };
const NEW_TOURNAMENT: GroupDef = { id: 'tournament/new', prefix: '/tournament/new', layout: TournamentWizardLayout, tabs: false };
const TOURNAMENT: GroupDef = { id: 'tournament/[tournamentId]', prefix: '/tournament/[tournamentId]', layout: TournamentLayout, tabs: false };

function own(pattern: string): GroupDef {
  return { id: pattern, prefix: pattern, layout: null, tabs: false };
}

function tab(pattern: string, name: string, screen: ComponentType): RouteDef {
  return { pattern, group: TABS, screen, tab: name };
}

function inGroup(group: GroupDef, suffix: string, screen: ComponentType): RouteDef {
  return { pattern: `${group.prefix}${suffix}`, group, screen, tab: null };
}

function standalone(pattern: string, screen: ComponentType): RouteDef {
  return { pattern, group: own(pattern), screen, tab: null };
}

export const APP_ROUTES: readonly RouteDef[] = [
  tab('/', 'index', HomeRoute),
  tab('/tournaments', 'tournaments', TournamentsRoute),
  tab('/history', 'history', HistoryRoute),
  tab('/settings', 'settings', SettingsRoute),
  inGroup(NEW_MATCH, '', NewMatchRoute),
  inGroup(NEW_MATCH, '/teams', NewMatchTeamsRoute),
  inGroup(NEW_MATCH, '/players', NewMatchPlayersRoute),
  inGroup(NEW_MATCH, '/toss', NewMatchTossRoute),
  inGroup(NEW_MATCH, '/openers', NewMatchOpenersRoute),
  inGroup(MATCH, '/score', ScoreRoute),
  inGroup(MATCH, '/scorecard', ScorecardRoute),
  inGroup(MATCH, '/balls', BallsRoute),
  inGroup(MATCH, '/analytics', AnalyticsRoute),
  inGroup(MATCH, '/manage', ManageRoute),
  inGroup(MATCH, '/edit/[seq]', EditBallRoute),
  inGroup(NEW_TOURNAMENT, '', TournamentInfoRoute),
  inGroup(NEW_TOURNAMENT, '/teams', TournamentTeamsStepRoute),
  inGroup(NEW_TOURNAMENT, '/structure', TournamentStructureRoute),
  inGroup(NEW_TOURNAMENT, '/rules', TournamentRulesRoute),
  inGroup(NEW_TOURNAMENT, '/pools', TournamentPoolsStepRoute),
  inGroup(NEW_TOURNAMENT, '/fixtures', TournamentFixturesStepRoute),
  inGroup(NEW_TOURNAMENT, '/review', TournamentReviewRoute),
  inGroup(TOURNAMENT, '', TournamentDashboardRoute),
  inGroup(TOURNAMENT, '/standings', TournamentStandingsRoute),
  inGroup(TOURNAMENT, '/fixtures', TournamentFixturesRoute),
  inGroup(TOURNAMENT, '/fixtures/new', TournamentAddFixtureRoute),
  inGroup(TOURNAMENT, '/fixtures/[fixtureId]', TournamentFixtureRoute),
  inGroup(TOURNAMENT, '/pools', TournamentPoolsRoute),
  inGroup(TOURNAMENT, '/stages', TournamentStagesRoute),
  inGroup(TOURNAMENT, '/stages/[stageId]', TournamentStageRoute),
  inGroup(TOURNAMENT, '/qualification', TournamentQualificationRoute),
  inGroup(TOURNAMENT, '/bracket', TournamentBracketRoute),
  inGroup(TOURNAMENT, '/what-if', TournamentWhatIfRoute),
  inGroup(TOURNAMENT, '/stats', TournamentStatsRoute),
  inGroup(TOURNAMENT, '/audit', TournamentAuditRoute),
  inGroup(TOURNAMENT, '/teams', TournamentTeamsRoute),
  inGroup(TOURNAMENT, '/manage', TournamentManageRoute),
  standalone('/teams', TeamsRoute),
  standalone('/teams/[teamId]', TeamRoute),
  standalone('/settings/about', AboutRoute),
  standalone('/settings/backup', BackupRoute),
  standalone('/settings/diagnostics', DiagnosticsRoute),
  standalone('/settings/presets', PresetsRoute),
];

configureRoutes(APP_ROUTES);

export function AppHost() {
  return <NavigatorHost root={RootLayout} />;
}

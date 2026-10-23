import { TOURNAMENT_STATUSES, type FixtureStatus, type MatchStatus, type StageStatus, type TournamentStatus } from '../types';
import { deletePermission, matchPolicyFor, tournamentRow, tournamentSituation } from './structure/editPolicyRows';
import {
  edgeKey,
  FIXTURE_STATUS_LABELS,
  MATCH_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  TOURNAMENT_STATUS_LABELS,
} from './structure/statusLabels';

export type Guard = { readonly ok: true; readonly warnings: readonly string[] } | { readonly ok: false; readonly reason: string };

export type EditPermission = 'allowed' | 'warn' | 'confirm' | 'forbidden';

export interface TournamentGuardContext {
  readonly activeTeamCount: number;
  readonly stageCount: number;
  readonly poolsComplete: boolean;
  readonly firstStageFixturesConfirmed: boolean;
  readonly matchesStarted: number;
  readonly matchesCompleted: number;
  readonly allStagesComplete: boolean;
  readonly championDecided: boolean;
}

function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'An' : 'A'} ${word}`;
}

const OK: Guard = { ok: true, warnings: [] };

function refuse(reason: string): Guard {
  return { ok: false, reason };
}

function allowIf(condition: boolean, reason: string, warnings: readonly string[] = []): Guard {
  return condition ? { ok: true, warnings } : refuse(reason);
}

type Rule<C> = (ctx: C) => Guard;

const NO_MATCHES_STARTED: Rule<TournamentGuardContext> = (ctx) => allowIf(ctx.matchesStarted === 0, 'Matches have already started.');

const TOURNAMENT_EDGES: ReadonlyMap<string, Rule<TournamentGuardContext>> = new Map<string, Rule<TournamentGuardContext>>([
  [edgeKey('draft', 'registration'), () => OK],
  [
    edgeKey('registration', 'structure_configured'),
    (ctx) => allowIf(ctx.activeTeamCount >= 2 && ctx.stageCount >= 1, 'Add at least two teams and one stage.'),
  ],
  [edgeKey('structure_configured', 'pools_configured'), (ctx) => allowIf(ctx.poolsComplete, 'Some teams are not in a pool yet.')],
  [
    edgeKey('pools_configured', 'fixtures_generated'),
    (ctx) => allowIf(ctx.firstStageFixturesConfirmed, "Confirm the first stage's fixtures."),
  ],
  [edgeKey('fixtures_generated', 'active'), () => OK],
  [
    edgeKey('active', 'completed'),
    (ctx) => allowIf(ctx.championDecided || ctx.allStagesComplete, "The champion hasn't been decided yet."),
  ],
  [edgeKey('completed', 'archived'), () => OK],
  [edgeKey('archived', 'completed'), () => OK],
  [
    edgeKey('completed', 'active'),
    () => ({ ok: true, warnings: ['The tournament reopens for corrections.'] }),
  ],
  [edgeKey('structure_configured', 'registration'), NO_MATCHES_STARTED],
  [edgeKey('pools_configured', 'structure_configured'), NO_MATCHES_STARTED],
  [edgeKey('fixtures_generated', 'pools_configured'), NO_MATCHES_STARTED],
]);

function isBackward(from: TournamentStatus, to: TournamentStatus): boolean {
  return TOURNAMENT_STATUSES.indexOf(to) < TOURNAMENT_STATUSES.indexOf(from);
}

export function canTransitionTournament(from: TournamentStatus, to: TournamentStatus, ctx: TournamentGuardContext): Guard {
  if (from === to) {
    return refuse(`The tournament is already ${TOURNAMENT_STATUS_LABELS[to]}.`);
  }
  const rule = TOURNAMENT_EDGES.get(edgeKey(from, to));
  if (!rule) {
    const direction = isBackward(from, to) ? 'back to' : 'to';
    return refuse(`A tournament can't go from ${TOURNAMENT_STATUS_LABELS[from]} ${direction} ${TOURNAMENT_STATUS_LABELS[to]}.`);
  }
  return rule(ctx);
}

export interface TournamentEditPolicy {
  readonly info: EditPermission;
  readonly addTeams: EditPermission;
  readonly removeTeams: EditPermission;
  readonly stages: EditPermission;
  readonly pools: EditPermission;
  readonly generateFixtures: EditPermission;
  readonly fixtureSchedule: EditPermission;
  readonly fixtureTeams: EditPermission;
  readonly rules: EditPermission;
  readonly overrides: EditPermission;
  readonly matchResults: EditPermission;
  readonly seeds: EditPermission;
  readonly deleteTournament: EditPermission;
}

export function tournamentEditPolicy(status: TournamentStatus, ctx: TournamentGuardContext): TournamentEditPolicy {
  const situation = tournamentSituation(status, ctx);
  const row = tournamentRow(situation);
  return { ...row, seeds: row.rules, deleteTournament: deletePermission(situation, ctx) };
}

type StageContext = { readonly fixturesConfirmed: boolean; readonly entrantsResolved: boolean; readonly allFixturesTerminal: boolean };

const STAGE_EDGES: ReadonlyMap<string, Rule<StageContext>> = new Map<string, Rule<StageContext>>([
  [
    edgeKey('pending', 'active'),
    (ctx) =>
      allowIf(
        ctx.fixturesConfirmed,
        "Confirm this stage's fixtures first.",
        ctx.entrantsResolved ? [] : ['Some places in this stage are still to be decided.'],
      ),
  ],
  [edgeKey('active', 'completed'), (ctx) => allowIf(ctx.allFixturesTerminal, "Some matches in this stage haven't finished yet.")],
  [edgeKey('completed', 'active'), () => OK],
]);

export function canTransitionStage(
  from: StageStatus,
  to: StageStatus,
  ctx: { readonly fixturesConfirmed: boolean; readonly entrantsResolved: boolean; readonly allFixturesTerminal: boolean },
): Guard {
  const rule = STAGE_EDGES.get(edgeKey(from, to));
  if (!rule) {
    return refuse(`A stage can't go from ${STAGE_STATUS_LABELS[from]} to ${STAGE_STATUS_LABELS[to]}.`);
  }
  return rule(ctx);
}

const MIRROR_STATUSES: ReadonlySet<FixtureStatus> = new Set<FixtureStatus>(['live', 'completed', 'abandoned']);

const FIXTURE_EDGES: ReadonlySet<string> = new Set([
  edgeKey('scheduled', 'postponed'),
  edgeKey('postponed', 'rescheduled'),
  edgeKey('rescheduled', 'postponed'),
  edgeKey('scheduled', 'cancelled'),
  edgeKey('postponed', 'cancelled'),
  edgeKey('rescheduled', 'cancelled'),
  edgeKey('cancelled', 'scheduled'),
  edgeKey('scheduled', 'live'),
  edgeKey('rescheduled', 'live'),
  edgeKey('scheduled', 'completed'),
  edgeKey('postponed', 'completed'),
  edgeKey('rescheduled', 'completed'),
  edgeKey('scheduled', 'abandoned'),
  edgeKey('rescheduled', 'abandoned'),
  edgeKey('live', 'completed'),
  edgeKey('live', 'abandoned'),
  edgeKey('abandoned', 'rescheduled'),
  edgeKey('completed', 'live'),
  edgeKey('abandoned', 'live'),
]);

export function canTransitionFixture(
  from: FixtureStatus,
  to: FixtureStatus,
  ctx: { readonly hasMatch: boolean; readonly replayAllowed: boolean },
): Guard {
  if (!FIXTURE_EDGES.has(edgeKey(from, to))) {
    return refuse(`${withArticle(FIXTURE_STATUS_LABELS[from].toLowerCase())} fixture can't be marked ${FIXTURE_STATUS_LABELS[to].toLowerCase()}.`);
  }
  if (from === 'abandoned' && to === 'rescheduled') {
    return allowIf(
      ctx.replayAllowed,
      "This stage doesn't allow replays. The match stays a no result.",
      ['The replay is a new match. The abandoned one stays in history.'],
    );
  }
  if (MIRROR_STATUSES.has(to)) {
    return allowIf(ctx.hasMatch, `A fixture only becomes ${FIXTURE_STATUS_LABELS[to].toLowerCase()} through its match.`);
  }
  return OK;
}

const MATCH_EDGES: ReadonlySet<string> = new Set([
  edgeKey('scheduled', 'postponed'),
  edgeKey('postponed', 'scheduled'),
  edgeKey('scheduled', 'cancelled'),
  edgeKey('postponed', 'cancelled'),
  edgeKey('cancelled', 'scheduled'),
  edgeKey('scheduled', 'live'),
  edgeKey('scheduled', 'completed'),
  edgeKey('postponed', 'completed'),
  edgeKey('scheduled', 'abandoned'),
  edgeKey('postponed', 'abandoned'),
  edgeKey('live', 'paused'),
  edgeKey('paused', 'live'),
  edgeKey('live', 'completed'),
  edgeKey('paused', 'completed'),
  edgeKey('live', 'abandoned'),
  edgeKey('paused', 'abandoned'),
  edgeKey('completed', 'live'),
  edgeKey('completed', 'paused'),
  edgeKey('abandoned', 'live'),
  edgeKey('abandoned', 'paused'),
]);

export function canTransitionMatch(from: MatchStatus, to: MatchStatus, ctx: { readonly hasDeliveries: boolean }): Guard {
  if (!MATCH_EDGES.has(edgeKey(from, to))) {
    return refuse(`${withArticle(MATCH_STATUS_LABELS[from].toLowerCase())} match can't become ${MATCH_STATUS_LABELS[to].toLowerCase()}.`);
  }
  if ((from === 'scheduled' || from === 'postponed') && to === 'completed') {
    return allowIf(!ctx.hasDeliveries, 'Too late for a walkover or award. Play has started.');
  }
  return OK;
}

export interface MatchEditPolicy {
  readonly details: EditPermission;
  readonly teams: EditPermission;
  readonly rules: EditPermission;
  readonly squads: EditPermission;
  readonly toss: EditPermission;
  readonly scoring: EditPermission;
  readonly history: EditPermission;
  readonly delete: EditPermission;
}

export function matchEditPolicy(status: MatchStatus, ctx: { readonly inTournament: boolean }): MatchEditPolicy {
  return matchPolicyFor(status, ctx.inTournament);
}

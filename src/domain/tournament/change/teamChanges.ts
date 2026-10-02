import type {
  ChangePlan,
  Fixture,
  FixtureSide,
  MatchEventInput,
  NewMatchInput,
  PoolEntry,
  ProposedChange,
  Stage,
  StageSlot,
  TeamId,
  TournamentTeam,
} from '../../types';
import { runEvaluation } from '../evaluation/pipeline';
import { effectiveMatchRules } from '../evaluation/hypothetical';
import { isSettledStatus } from '../evaluation/sides';
import { fixtureTeamsVia } from '../evaluation/stageTables';
import { emptyPlan, expungeOverride, isUnplayed, nameOf, rewriteSides } from './plan';
import type { PlanContext } from './plan';

type TeamReplace = Extract<ProposedChange, { readonly kind: 'team_replace' }>;
type TeamWithdraw = Extract<ProposedChange, { readonly kind: 'team_withdraw' }>;
type SeedsChange = Extract<ProposedChange, { readonly kind: 'team_seeds_change' }>;

function membership(ctx: PlanContext, teamId: TeamId): TournamentTeam | null {
  return ctx.index.teamViews.get(teamId)?.membership ?? null;
}

function replaceTeamSide(side: FixtureSide, out: TeamId, into: TeamId): FixtureSide {
  return side.kind === 'team' && side.teamId === out ? { kind: 'team', teamId: into } : side;
}

function replacedEntries(ctx: PlanContext, out: TeamId, into: TeamId): ChangePlan['poolEntries'] {
  const stages = new Set(
    ctx.snapshot.poolEntries.filter((entry) => entry.side.kind === 'team' && entry.side.teamId === out).map((entry) => entry.stageId),
  );
  return [...stages].map((stageId) => ({
    stageId,
    entries: ctx.snapshot.poolEntries
      .filter((entry) => entry.stageId === stageId)
      .map((entry): PoolEntry => ({ ...entry, side: replaceTeamSide(entry.side, out, into) })),
  }));
}

function replacedSlots(ctx: PlanContext, out: TeamId, into: TeamId): readonly StageSlot[] {
  return ctx.snapshot.slots
    .filter((slot) => slot.source.kind === 'manual' && slot.source.teamId === out)
    .map((slot) => ({ ...slot, source: { kind: 'manual', teamId: into } }));
}

function replacedStages(ctx: PlanContext, out: TeamId, into: TeamId): readonly Stage[] {
  return ctx.snapshot.stages
    .filter((stage) => stage.config.entryRules.some((rule) => rule.kind === 'direct_entry' && rule.teamIds.includes(out)))
    .map((stage) => ({
      ...stage,
      updatedAt: ctx.now,
      config: {
        ...stage.config,
        entryRules: stage.config.entryRules.map((rule) =>
          rule.kind === 'direct_entry' ? { ...rule, teamIds: rule.teamIds.map((teamId) => (teamId === out ? into : teamId)) } : rule,
        ),
      },
    }));
}

export function planTeamReplace(ctx: PlanContext, change: TeamReplace): ChangePlan {
  const out = change.outTeamId;
  const into = change.inTeamId;
  const outRow = membership(ctx, out);
  const inRow = membership(ctx, into);
  const transfer = change.priorResults === 'transfer_to_replacement';
  const upsert: TournamentTeam[] = [];
  if (outRow) upsert.push({ ...outRow, status: 'replaced', replacedByTeamId: into });
  upsert.push(
    inRow
      ? { ...inRow, status: 'active', seed: change.inSeed ?? inRow.seed, inheritsFromTeamId: transfer ? out : inRow.inheritsFromTeamId }
      : {
          id: ctx.ids(),
          tournamentId: ctx.snapshot.tournament.id,
          teamId: into,
          seed: change.inSeed,
          status: 'active',
          replacedByTeamId: null,
          inheritsFromTeamId: transfer ? out : null,
          joinedAt: ctx.now,
        },
  );
  const update = ctx.snapshot.fixtures
    .filter(isUnplayed)
    .map((fixture) => rewriteSides(fixture, (side) => replaceTeamSide(side, out, into), ctx.now))
    .filter((fixture): fixture is Fixture => fixture !== null);
  const overrides =
    change.priorResults === 'expunge' ? [expungeOverride(ctx, out, `${nameOf(ctx, out)} were replaced by ${nameOf(ctx, into)}.`)] : [];
  return {
    ...emptyPlan(),
    tournamentTeams: { upsert },
    stages: { upsert: replacedStages(ctx, out, into), delete: [] },
    slots: { upsert: replacedSlots(ctx, out, into), delete: [] },
    poolEntries: replacedEntries(ctx, out, into),
    fixtures: { insert: [], update, delete: [] },
    overrides: { insert: overrides, revoke: [] },
  };
}

export interface RemainingFixture {
  readonly fixture: Fixture;
  readonly teams: { readonly a: TeamId | null; readonly b: TeamId | null };
}

export function remainingFixtures(ctx: PlanContext, teamId: TeamId): readonly RemainingFixture[] {
  const evaluation = runEvaluation(ctx.snapshot);
  const resolutions = new Map(evaluation.stages.flatMap((stage) => stage.slots).map((resolution) => [resolution.slotId, resolution]));
  return ctx.snapshot.fixtures
    .filter((fixture) => isUnplayed(fixture) && !isSettledStatus(fixture.status))
    .map((fixture) => ({ fixture, teams: fixtureTeamsVia(fixture, (slotId) => resolutions.get(slotId)) }))
    .filter((entry) => entry.teams.a === teamId || entry.teams.b === teamId);
}

function walkoverMatch(ctx: PlanContext, fixture: Fixture, a: TeamId, b: TeamId): NewMatchInput {
  const stage = ctx.index.stageById.get(fixture.stageId);
  return {
    title: `${nameOf(ctx, a)} v ${nameOf(ctx, b)}`,
    teamAId: a,
    teamBId: b,
    venueId: fixture.venueId,
    scheduledDate: fixture.scheduledDate,
    scheduledTime: fixture.scheduledTime,
    formatId: fixture.formatId ?? stage?.config.formatId ?? ctx.snapshot.rules.defaultFormatId,
    rules: effectiveMatchRules(ctx.snapshot, fixture),
    squads: [
      { teamId: a, players: [] },
      { teamId: b, players: [] },
    ],
    toss: null,
    tournamentId: ctx.snapshot.tournament.id,
    fixtureId: fixture.id,
    teamAPlayers: null,
    teamBPlayers: null,
  };
}

export function planTeamWithdraw(ctx: PlanContext, change: TeamWithdraw): ChangePlan {
  const row = membership(ctx, change.teamId);
  const remaining = remainingFixtures(ctx, change.teamId);
  const reason = `${nameOf(ctx, change.teamId)} withdrew.`;
  const matchesToCreate: ChangePlan['matchesToCreate'][number][] = [];
  const update: Fixture[] = [];
  for (const entry of remaining) {
    if (change.remainingFixtures === 'cancel') {
      update.push({ ...entry.fixture, status: 'cancelled', updatedAt: ctx.now });
      continue;
    }
    const { a, b } = entry.teams;
    if (a === null || b === null) continue;
    const winner = a === change.teamId ? b : a;
    const events: readonly MatchEventInput[] = [{ kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: winner, reason } }];
    matchesToCreate.push({ matchId: ctx.ids(), fixtureId: entry.fixture.id, match: walkoverMatch(ctx, entry.fixture, a, b), events });
  }
  return {
    ...emptyPlan(),
    tournamentTeams: { upsert: row ? [{ ...row, status: 'withdrawn' }] : [] },
    fixtures: { insert: [], update, delete: [] },
    overrides: { insert: change.expungeResults ? [expungeOverride(ctx, change.teamId, reason)] : [], revoke: [] },
    matchesToCreate,
  };
}

export function planSeedsChange(ctx: PlanContext, change: SeedsChange): ChangePlan {
  const upsert = change.seeds
    .map((entry) => {
      const row = membership(ctx, entry.teamId);
      return row ? { ...row, seed: entry.seed } : null;
    })
    .filter((row): row is TournamentTeam => row !== null);
  return { ...emptyPlan(), tournamentTeams: { upsert } };
}

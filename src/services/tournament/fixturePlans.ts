import {
  draftsFromRoundRobin,
  evaluateTournament,
  knockoutBracket,
  knockoutGenerationGuard,
  roundRobin,
  seedEntrants,
  stageEntrants,
  validateFixtureDrafts,
  type DraftDefaults,
} from '@/domain/tournament';
import type { ChangePlan, FixtureDraft, FixtureSide, PoolId, Seed, Stage, StageSlot, TournamentSnapshot } from '@/domain/types';
import type { FixturePlan, GenerateFixturesOptions, TournamentService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure, ServiceFailure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { applyProposedChange } from './changes';
import { readSnapshot, snapshotOfStage, evaluateSnapshot } from './snapshots';
import { knockoutEntrants } from './seeding';

type FixtureOperations = Pick<TournamentService, 'generateFixtures' | 'confirmFixtures' | 'addFixture'>;

const EMPTY_PLAN: FixturePlan = { fixtures: [], slots: [], entrySlotSeeds: [], seed: null };

function attemptDomain<T>(message: string, compute: () => T): T {
  try {
    return compute();
  } catch (error) {
    if (error instanceof ServiceFailure) {
      throw error;
    }
    throw failure('VALIDATION', message, { detail: error instanceof Error ? error.message : String(error) });
  }
}

function nextMatchNumber(snapshot: TournamentSnapshot, replaced: (fixture: TournamentSnapshot['fixtures'][number]) => boolean): number {
  const kept = snapshot.fixtures.filter((fixture) => !replaced(fixture));
  return kept.reduce((max, fixture) => Math.max(max, fixture.matchNumber), 0) + 1;
}

function defaults(snapshot: TournamentSnapshot, stage: Stage, poolId: PoolId | null, startMatchNumber: number): DraftDefaults {
  return { tournamentId: snapshot.tournament.id, stageId: stage.id, poolId, formatId: null, matchRules: null, venueId: null, startMatchNumber };
}

function roundRobinPlan(ctx: ServiceContext, snapshot: TournamentSnapshot, stage: Stage, poolId: PoolId | null): FixturePlan {
  const pools = snapshot.pools
    .filter((pool) => pool.stageId === stage.id && (poolId === null || pool.id === poolId))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const replaced = (fixture: TournamentSnapshot['fixtures'][number]) =>
    fixture.stageId === stage.id && fixture.matchId === null && (poolId === null || fixture.poolId === poolId);
  let next = nextMatchNumber(snapshot, replaced);
  const groups: readonly { readonly poolId: PoolId | null; readonly members: readonly FixtureSide[]; readonly legs: number }[] =
    pools.length === 0
      ? [{ poolId: null, members: stageEntrants(snapshot, stage.id), legs: stage.config.fixtureGeneration.legs }]
      : pools.map((pool) => ({
          poolId: pool.id,
          members: snapshot.poolEntries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side),
          legs: pool.legs ?? stage.config.fixtureGeneration.legs,
        }));
  const fixtures: FixtureDraft[] = [];
  for (const group of groups) {
    if (group.members.length < 2) {
      continue;
    }
    const rounds = attemptDomain('These fixtures could not be generated.', () => roundRobin(group.members, group.legs));
    const drafts = draftsFromRoundRobin(rounds, defaults(snapshot, stage, group.poolId, next), ctx.ids);
    next += drafts.length;
    fixtures.push(...drafts);
  }
  if (fixtures.length === 0) {
    throw failure('VALIDATION', 'Put at least two teams in a pool first.');
  }
  return { fixtures, slots: [], entrySlotSeeds: [], seed: null };
}

interface BracketRows {
  readonly slots: readonly StageSlot[];
  readonly fixtures: readonly FixtureDraft[];
}

function keepProgressionIds(snapshot: TournamentSnapshot, stage: Stage, slots: readonly StageSlot[], fixtures: readonly FixtureDraft[]): BracketRows {
  const existing = new Map(
    snapshot.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'progression').map((slot) => [slot.index, slot.id]),
  );
  const renamed = new Map<string, string>();
  const kept = slots.map((slot) => {
    const id = existing.get(slot.index);
    if (id === undefined) {
      return slot;
    }
    renamed.set(slot.id, id);
    return { ...slot, id };
  });
  const side = (value: FixtureSide): FixtureSide => (value.kind === 'slot' && renamed.has(value.slotId) ? { kind: 'slot', slotId: renamed.get(value.slotId) ?? value.slotId } : value);
  return { slots: kept, fixtures: fixtures.map((fixture) => ({ ...fixture, sideA: side(fixture.sideA), sideB: side(fixture.sideB) })) };
}

function knockoutPlan(ctx: ServiceContext, snapshot: TournamentSnapshot, stage: Stage, requestedSeed: Seed | undefined): FixturePlan {
  const evaluation = evaluateTournament(snapshot);
  const config = stage.config;
  const entrySlots = snapshot.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry');
  const resolutions = evaluation.stages.flatMap((entry) => entry.slots).filter((resolution) => entrySlots.some((slot) => slot.id === resolution.slotId));
  const guard = knockoutGenerationGuard(config.seeding, resolutions);
  if (!guard.ok) {
    throw failure('VALIDATION', guard.reason);
  }
  const entrants = knockoutEntrants(snapshot, evaluation, stage, stageEntrants(snapshot, stage.id));
  if (entrants.length < 2) {
    throw failure('VALIDATION', 'A knockout needs at least two teams.');
  }
  if (config.seeding === 'ranking' && entrants.some((entrant) => entrant.rank === null)) {
    throw failure('VALIDATION', 'Some teams have no seed. Seeding by ranking needs one for every team.');
  }
  const seed = config.seeding === 'random' ? (requestedSeed ?? ctx.seeds()) : null;
  const order = attemptDomain('The knockout draw could not be made.', () => seedEntrants(entrants, config.seeding, seed));
  const knockout = config.knockout ?? { thirdPlacePlayoff: false, rounds: null };
  const firstSlotIndex = entrySlots.reduce((max, slot) => Math.max(max, slot.index + 1), 0);
  const replaced = (fixture: TournamentSnapshot['fixtures'][number]) => fixture.stageId === stage.id && fixture.matchId === null;
  const bracket = attemptDomain('The knockout bracket could not be built.', () =>
    knockoutBracket(
      order,
      {
        thirdPlacePlayoff: knockout.thirdPlacePlayoff,
        rounds: knockout.rounds,
        firstSlotIndex,
        defaults: defaults(snapshot, stage, null, nextMatchNumber(snapshot, replaced)),
      },
      ctx.ids,
    ),
  );
  const kept = keepProgressionIds(snapshot, stage, bracket.slots, bracket.fixtures);
  return { fixtures: kept.fixtures, slots: kept.slots, entrySlotSeeds: bracket.entrySlotSeeds, seed };
}

export function planFixtures(ctx: ServiceContext, snapshot: TournamentSnapshot, stage: Stage, opts: GenerateFixturesOptions = {}): FixturePlan {
  switch (stage.config.fixtureGeneration.method) {
    case 'round_robin':
      return roundRobinPlan(ctx, snapshot, stage, opts.poolId ?? null);
    case 'knockout':
      return knockoutPlan(ctx, snapshot, stage, opts.seed);
    case 'manual':
      return EMPTY_PLAN;
    default: {
      const unreachable: never = stage.config.fixtureGeneration.method;
      return unreachable;
    }
  }
}

function inferPool(snapshot: TournamentSnapshot, stage: Stage, plan: FixturePlan): PoolId | null {
  const stagePools = snapshot.pools.filter((pool) => pool.stageId === stage.id);
  const used = new Set(plan.fixtures.map((fixture) => fixture.poolId));
  if (stagePools.length > 1 && used.size === 1) {
    const [only] = [...used];
    return only ?? null;
  }
  return null;
}

function draftSides(snapshot: TournamentSnapshot, extraSlots: readonly StageSlot[]): readonly FixtureSide[] {
  return [
    ...snapshot.teams.filter((view) => view.membership.status === 'active').map((view): FixtureSide => ({ kind: 'team', teamId: view.team.id })),
    ...[...snapshot.slots, ...extraSlots].map((slot): FixtureSide => ({ kind: 'slot', slotId: slot.id })),
  ];
}

export function assertDrafts(snapshot: TournamentSnapshot, stage: Stage, drafts: readonly FixtureDraft[], extraSlots: readonly StageSlot[]): void {
  if (drafts.some((draft) => draft.stageId !== stage.id || draft.tournamentId !== snapshot.tournament.id)) {
    throw failure('VALIDATION', 'Every fixture must belong to this stage.');
  }
  const pools = snapshot.pools.filter((pool) => pool.stageId === stage.id);
  const poolMembers: Record<PoolId, readonly FixtureSide[]> = {};
  pools.forEach((pool) => {
    poolMembers[pool.id] = snapshot.poolEntries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side);
  });
  const issues = validateFixtureDrafts(drafts, {
    poolMembers,
    tournamentSides: draftSides(snapshot, extraSlots),
    legsByPool: new Map(pools.map((pool) => [pool.id, pool.legs ?? stage.config.fixtureGeneration.legs])),
    defaultLegs: stage.config.fixtureGeneration.legs,
    startDate: snapshot.tournament.startDate,
    endDate: snapshot.tournament.endDate,
  });
  const error = issues.find((issue) => issue.severity === 'error');
  if (error !== undefined) {
    throw failure('VALIDATION', error.message, { domainCode: error.code });
  }
}

function withEntrySeeds(snapshot: TournamentSnapshot, plan: ChangePlan, seeds: FixturePlan['entrySlotSeeds']): ChangePlan {
  if (seeds.length === 0) {
    return plan;
  }
  const bySlot = new Map(seeds.map((entry) => [entry.slotId, entry.seed]));
  const upserted = new Map(plan.slots.upsert.map((slot) => [slot.id, slot]));
  snapshot.slots.forEach((slot) => {
    const seed = bySlot.get(slot.id);
    if (seed !== undefined) {
      upserted.set(slot.id, { ...(upserted.get(slot.id) ?? slot), seed });
    }
  });
  return { ...plan, slots: { ...plan.slots, upsert: [...upserted.values()] } };
}

function normalizedDraft(snapshot: TournamentSnapshot, draft: FixtureDraft, newId: () => string): FixtureDraft {
  const ids = new Set(snapshot.fixtures.map((fixture) => fixture.id));
  const numbers = new Set(snapshot.fixtures.map((fixture) => fixture.matchNumber));
  const highest = snapshot.fixtures.reduce((max, fixture) => Math.max(max, fixture.matchNumber), 0);
  return {
    ...draft,
    id: ids.has(draft.id) ? newId() : draft.id,
    matchNumber: numbers.has(draft.matchNumber) || draft.matchNumber < 1 ? highest + 1 : draft.matchNumber,
    status: 'scheduled',
  };
}

export function createFixtureOperations(ctx: ServiceContext): FixtureOperations {
  return {
    generateFixtures(stageId, opts) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, stage } = await snapshotOfStage(ctx, repos, stageId);
          return planFixtures(ctx, snapshot, stage, opts);
        }),
      );
    },

    confirmFixtures(stageId, plan) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, stage } = await snapshotOfStage(ctx, repos, stageId);
          const { policy } = evaluateSnapshot(snapshot);
          if (policy.generateFixtures === 'forbidden') {
            throw failure('FORBIDDEN_STATE', "Fixtures can't be generated at this stage.");
          }
          const played = snapshot.fixtures.some((fixture) => fixture.stageId === stageId && fixture.matchId !== null);
          if (played && stage.config.fixtureGeneration.method === 'knockout') {
            throw failure('FORBIDDEN_STATE', 'Knockout matches have been played. Edit fixtures one at a time instead.');
          }
          if (played && policy.generateFixtures !== 'allowed') {
            throw failure('CONFIRMATION_REQUIRED', "Matches in this stage have been played. Review the impact first.");
          }
          assertDrafts(snapshot, stage, plan.fixtures, plan.slots);
          return applyProposedChange(
            ctx,
            repos,
            snapshot.tournament.id,
            { kind: 'fixtures_replace', stageId, poolId: inferPool(snapshot, stage, plan), fixtures: plan.fixtures, slots: plan.slots, seed: plan.seed },
            {
              reason: null,
              version: snapshot.version,
              previewed: null,
              reasonOptional: !played,
              adjustPlan: (rows) => withEntrySeeds(snapshot, rows, plan.entrySlotSeeds),
            },
          );
        }),
      );
    },

    addFixture(draft) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const snapshot = await readSnapshot(ctx, repos, draft.tournamentId);
          const { policy } = evaluateSnapshot(snapshot);
          if (policy.generateFixtures === 'forbidden') {
            throw failure('FORBIDDEN_STATE', "Matches can't be added at this stage.");
          }
          const stage = snapshot.stages.find((entry) => entry.id === draft.stageId);
          if (stage === undefined) {
            throw failure('NOT_FOUND', 'This stage no longer exists.');
          }
          const fixture = normalizedDraft(snapshot, draft, ctx.ids);
          assertDrafts(snapshot, stage, [fixture], []);
          return applyProposedChange(ctx, repos, snapshot.tournament.id, { kind: 'fixture_add', fixture }, {
            reason: null,
            version: snapshot.version,
            previewed: null,
            reasonOptional: true,
          });
        }),
      );
    },
  };
}

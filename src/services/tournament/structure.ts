import type { FixtureSide, Pool, PoolEntry, Stage, StageSlot, TournamentRules, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { deepEqual } from '../core/values';
import { readEvaluated, readSnapshot } from './snapshots';
import { guardContext } from './status';

type StructureOperations = Pick<TournamentService, 'saveStructure'>;

export interface StructureInput {
  readonly rules: TournamentRules;
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly poolEntries: readonly PoolEntry[];
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

function validateStructure(snapshot: TournamentSnapshot, input: StructureInput): void {
  const tournamentId = snapshot.tournament.id;
  if (input.stages.some((stage) => stage.tournamentId !== tournamentId) || !unique(input.stages.map((stage) => stage.id))) {
    throw failure('VALIDATION', 'Every stage must belong to this tournament and appear once.');
  }
  if (!unique(input.stages.map((stage) => stage.orderIndex))) {
    throw failure('VALIDATION', 'Two stages have the same position. Reorder the stages.');
  }
  const champions = input.stages.filter((stage) => stage.config.decidesChampion).length;
  if (input.stages.length > 0 && champions !== 1) {
    throw failure('VALIDATION', 'Choose exactly one stage that decides the champion.');
  }
  const stageIds = new Set(input.stages.map((stage) => stage.id));
  const pools = new Map(input.pools.map((pool) => [pool.id, pool]));
  if (input.pools.some((pool) => !stageIds.has(pool.stageId)) || !unique(input.pools.map((pool) => pool.id))) {
    throw failure('VALIDATION', 'Every pool must belong to one of the stages.');
  }
  const slots = new Map(input.slots.map((slot) => [slot.id, slot]));
  if (input.slots.some((slot) => !stageIds.has(slot.stageId)) || !unique(input.slots.map((slot) => slot.id))) {
    throw failure('VALIDATION', 'Every qualification place must belong to one of the stages.');
  }
  const members = new Set(snapshot.teams.filter((view) => view.membership.status === 'active').map((view) => view.team.id));
  const seen = new Set<string>();
  for (const entry of input.poolEntries) {
    const pool = pools.get(entry.poolId);
    if (pool === undefined || pool.stageId !== entry.stageId) {
      throw failure('VALIDATION', 'A pool member was placed in a pool of another stage.');
    }
    if (entry.side.kind === 'team' && !members.has(entry.side.teamId)) {
      throw failure('VALIDATION', 'Only teams in this tournament can be placed in a pool.');
    }
    if (entry.side.kind === 'slot' && slots.get(entry.side.slotId)?.stageId !== entry.stageId) {
      throw failure('VALIDATION', 'A qualification place can only be used in a pool of its own stage.');
    }
    const key = `${entry.stageId}|${sideKey(entry.side)}`;
    if (seen.has(key)) {
      throw failure('VALIDATION', 'A team can only be in one pool of each stage.');
    }
    seen.add(key);
  }
}

interface StageParts {
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly entries: readonly PoolEntry[];
}

function partsOf(stageId: string, source: { readonly pools: readonly Pool[]; readonly slots: readonly StageSlot[]; readonly poolEntries: readonly PoolEntry[] }): StageParts {
  return {
    pools: source.pools.filter((pool) => pool.stageId === stageId),
    slots: source.slots.filter((slot) => slot.stageId === stageId),
    entries: source.poolEntries.filter((entry) => entry.stageId === stageId),
  };
}

function entriesShape(entries: readonly PoolEntry[]): readonly string[] {
  return entries.map((entry) => `${entry.poolId}|${sideKey(entry.side)}`);
}

async function removeDropped(repos: Repositories, snapshot: TournamentSnapshot, input: StructureInput, regenerated: ReadonlySet<string>): Promise<void> {
  const keepStages = new Set(input.stages.map((stage) => stage.id));
  const keepPools = new Set(input.pools.map((pool) => pool.id));
  const keepSlots = new Set(input.slots.map((slot) => slot.id));
  for (const fixture of snapshot.fixtures) {
    if (!keepStages.has(fixture.stageId) || regenerated.has(fixture.stageId)) {
      await repos.tournaments.deleteFixture(fixture.id);
    }
  }
  for (const slot of snapshot.slots) {
    if (!keepSlots.has(slot.id)) {
      await repos.tournaments.deleteSlot(slot.id);
    }
  }
  for (const pool of snapshot.pools) {
    if (!keepPools.has(pool.id)) {
      await repos.tournaments.deletePool(pool.id);
    }
  }
  for (const stage of snapshot.stages) {
    if (!keepStages.has(stage.id)) {
      await repos.tournaments.deleteStage(stage.id);
    }
  }
}

async function auditStructure(ctx: ServiceContext, repos: Repositories, snapshot: TournamentSnapshot, input: StructureInput, now: string): Promise<void> {
  const tournamentId = snapshot.tournament.id;
  const before = new Map(snapshot.stages.map((stage) => [stage.id, stage]));
  for (const stage of input.stages) {
    const previous = before.get(stage.id);
    if (previous === undefined || !deepEqual({ ...previous, updatedAt: '' }, { ...stage, updatedAt: '' })) {
      await writeAudit(
        ctx,
        repos,
        {
          tournamentId,
          action: previous === undefined ? 'stage_created' : 'stage_changed',
          entityType: 'stage',
          entityId: stage.id,
          summary: previous === undefined ? `Stage "${stage.name}" was added.` : `Stage "${stage.name}" was changed.`,
          previousValue: previous ?? null,
          newValue: stage,
        },
        now,
      );
    }
    const oldEntries = partsOf(stage.id, snapshot).entries;
    const newEntries = partsOf(stage.id, input).entries;
    if (!deepEqual(entriesShape(oldEntries), entriesShape(newEntries)) && newEntries.length > 0) {
      await writeAudit(
        ctx,
        repos,
        {
          tournamentId,
          action: oldEntries.length === 0 ? 'pools_generated' : 'pools_replaced',
          entityType: 'stage',
          entityId: stage.id,
          summary: `Pools of "${stage.name}" were ${oldEntries.length === 0 ? 'set' : 'replaced'}.`,
          previousValue: oldEntries,
          newValue: newEntries,
        },
        now,
      );
    }
  }
  for (const stage of snapshot.stages) {
    if (!input.stages.some((entry) => entry.id === stage.id)) {
      await writeAudit(
        ctx,
        repos,
        { tournamentId, action: 'stage_deleted', entityType: 'stage', entityId: stage.id, summary: `Stage "${stage.name}" was removed.`, previousValue: stage },
        now,
      );
    }
  }
}

export function createStructureOperations(ctx: ServiceContext): StructureOperations {
  return {
    saveStructure(tournamentId, structure) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, evaluation, policy } = await readEvaluated(ctx, repos, tournamentId);
          if (policy.stages === 'forbidden') {
            throw failure('FORBIDDEN_STATE', "The structure can't be changed at this stage.");
          }
          if (guardContext(snapshot, evaluation).matchesStarted > 0) {
            throw failure('FORBIDDEN_STATE', 'Matches have started. Review the impact of this change first.');
          }
          validateStructure(snapshot, structure);
          const now = ctx.clock.now();
          const regenerated = new Set(
            structure.stages
              .filter((stage) => {
                const previous = snapshot.stages.find((entry) => entry.id === stage.id);
                const before = partsOf(stage.id, snapshot);
                const after = partsOf(stage.id, structure);
                return (
                  previous !== undefined &&
                  (!deepEqual(previous.config.fixtureGeneration, stage.config.fixtureGeneration) ||
                    !deepEqual(before.pools.map((pool) => [pool.id, pool.legs]), after.pools.map((pool) => [pool.id, pool.legs])) ||
                    !deepEqual(before.slots.map((slot) => [slot.id, slot.source]), after.slots.map((slot) => [slot.id, slot.source])) ||
                    !deepEqual(entriesShape(before.entries), entriesShape(after.entries)))
                );
              })
              .map((stage) => stage.id),
          );
          await repos.tournaments.updateRules({ ...structure.rules, tournamentId, updatedAt: now });
          await removeDropped(repos, snapshot, structure, regenerated);
          await repos.tournaments.upsertStages(structure.stages.map((stage) => ({ ...stage, updatedAt: now })));
          await repos.tournaments.upsertPools(structure.pools);
          await repos.tournaments.upsertSlots(structure.slots);
          for (const stage of structure.stages) {
            await repos.tournaments.replacePoolEntries(stage.id, partsOf(stage.id, structure).entries);
          }
          await auditStructure(ctx, repos, snapshot, structure, now);
          await repos.tournaments.bumpRevision(tournamentId);
          return readSnapshot(ctx, repos, tournamentId);
        }),
      );
    },
  };
}

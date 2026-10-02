import type { Fixture, MatchSummary, SlotSource, StageSlot, TournamentSnapshot } from '@/domain/types';
import { knockoutBracket } from '../../fixtures';
import { seedEntrants } from '../../knockout';
import { builtinTemplates, instantiateTemplate } from '../../templates';
import { POOL_A, POOL_A_TEAMS, POOL_B, POOL_B_TEAMS, TEAM_NAMES } from './pools';
import { AT, fixture, makeSnapshot, team, withResult } from './tournament';

function counter(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}${next}`;
  };
}

function poolPosition(source: SlotSource, poolIds: readonly string[]): { readonly poolIndex: number | null; readonly poolPosition: number | null } {
  if (source.kind !== 'pool_position') return { poolIndex: null, poolPosition: null };
  return { poolIndex: poolIds.indexOf(source.poolId), poolPosition: source.position };
}

export function template92(): TournamentSnapshot {
  const template = builtinTemplates().find((candidate) => candidate.id === 'builtin:8-team-t20');
  if (!template) throw new Error('8-team-t20 template missing');
  const ids = counter('x');
  const structure = instantiateTemplate(template, { tournamentId: 't1', now: AT, ids });
  const [groups, knockout] = [...structure.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const pools = structure.pools.filter((candidate) => candidate.stageId === groups.id).sort((a, b) => a.orderIndex - b.orderIndex);
  const poolIds = pools.map((candidate) => candidate.id);
  const poolEntries = [POOL_A_TEAMS, POOL_B_TEAMS].flatMap((teams, index) =>
    teams.map((teamId) => ({ id: `pe-${teamId}`, poolId: poolIds[index], stageId: groups.id, side: team(teamId), seed: null })),
  );
  const groupFixtures: Fixture[] = [POOL_A, POOL_B].flatMap((summaries, index) =>
    summaries.map((summary, position) =>
      withResult(fixture(`g-${summary.matchId}`, groups.id, poolIds[index], index * 6 + position + 1, team(summary.teamAId), team(summary.teamBId)), summary),
    ),
  );
  const entrySlots = structure.slots.filter((candidate) => candidate.stageId === knockout.id && candidate.role === 'entry');
  const order = seedEntrants(
    entrySlots.map((candidate) => ({ side: { kind: 'slot', slotId: candidate.id }, rank: null, ...poolPosition(candidate.source, poolIds) })),
    'fixed',
    null,
  );
  const bracket = knockoutBracket(
    order,
    {
      thirdPlacePlayoff: false,
      rounds: null,
      firstSlotIndex: entrySlots.length,
      defaults: { tournamentId: 't1', stageId: knockout.id, poolId: null, formatId: null, matchRules: null, venueId: null, startMatchNumber: 13 },
    },
    counter('k'),
  );
  const seeds = new Map(bracket.entrySlotSeeds.map((entry) => [entry.slotId, entry.seed]));
  const slots: StageSlot[] = [
    ...structure.slots.map((candidate) => ({ ...candidate, seed: seeds.get(candidate.id) ?? candidate.seed })),
    ...bracket.slots,
  ];
  const knockoutFixtures = bracket.fixtures.map((draft): Fixture => ({ ...draft, matchId: null, matchSides: null, createdAt: AT, updatedAt: AT }));
  return makeSnapshot({
    teams: [...POOL_A_TEAMS, ...POOL_B_TEAMS].map((id) => ({ id, name: TEAM_NAMES[id] })),
    stages: structure.stages,
    pools: structure.pools,
    poolEntries,
    slots,
    fixtures: [...groupFixtures, ...knockoutFixtures],
    summaries: [...POOL_A, ...POOL_B],
  });
}

export function playFixture(snapshot: TournamentSnapshot, fixtureId: string, summary: MatchSummary): TournamentSnapshot {
  return {
    ...snapshot,
    fixtures: snapshot.fixtures.map((candidate) => (candidate.id === fixtureId ? withResult(candidate, summary) : candidate)),
    summaries: { ...snapshot.summaries, [summary.matchId]: summary },
  };
}

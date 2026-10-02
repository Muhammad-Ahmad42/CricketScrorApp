import type {
  Fixture,
  MatchSummary,
  PointsSystem,
  QualificationRule,
  Stage,
  StageSlot,
  TeamId,
  TieBreakerKind,
  TournamentOverride,
  TournamentSnapshot,
} from '@/domain/types';
import { POOL_A, POOL_A_TEAMS, POOL_B, POOL_B_TEAMS, TEAM_NAMES } from './pools';
import { entry, fixture, makeSnapshot, pool, slot, slotSide, stage, team, withResult } from './tournament';
import type { SnapshotSpec } from './tournament';

export const TOP_TWO: readonly QualificationRule[] = [{ kind: 'top_per_pool', sourceStageId: 'groups', count: 2, fromPosition: 1 }];

export const CUP_TEAMS = [...POOL_A_TEAMS, ...POOL_B_TEAMS].map((id) => ({ id, name: TEAM_NAMES[id] }));

export function groupFixtures(summaries: readonly MatchSummary[], poolId: string, startNumber: number, playedCount: number): Fixture[] {
  return summaries.map((summary, index) => {
    const base = fixture(`g-${summary.matchId}`, 'groups', poolId, startNumber + index, team(summary.teamAId), team(summary.teamBId));
    return index < playedCount ? withResult(base, summary) : base;
  });
}

export const KO_SLOTS: readonly StageSlot[] = [
  slot('sA1', 'ko', 0, 'A1', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 1 }, { seed: 1 }),
  slot('sB1', 'ko', 1, 'B1', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 1 }, { seed: 2 }),
  slot('sA2', 'ko', 2, 'A2', { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: 2 }, { seed: 3 }),
  slot('sB2', 'ko', 3, 'B2', { kind: 'pool_position', stageId: 'groups', poolId: 'pB', position: 2 }, { seed: 4 }),
  slot('sW1', 'ko', 4, 'Winner SF1', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 0 }, { role: 'progression' }),
  slot('sW2', 'ko', 5, 'Winner SF2', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 1 }, { role: 'progression' }),
];

export function koFixtures(): Fixture[] {
  return [
    fixture('sf1', 'ko', null, 13, slotSide('sA1'), slotSide('sB2'), {
      label: 'SF1',
      bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' },
    }),
    fixture('sf2', 'ko', null, 14, slotSide('sB1'), slotSide('sA2'), {
      label: 'SF2',
      bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' },
    }),
    fixture('final', 'ko', null, 15, slotSide('sW1'), slotSide('sW2'), {
      label: 'Final',
      isFinal: true,
      bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' },
    }),
  ];
}

export interface CupSpec {
  readonly poolA?: readonly MatchSummary[];
  readonly poolB?: readonly MatchSummary[];
  readonly playedA?: number;
  readonly playedB?: number;
  readonly ko?: Readonly<Record<string, MatchSummary>>;
  readonly overrides?: readonly TournamentOverride[];
  readonly koConfig?: Partial<Stage['config']>;
  readonly extraStages?: readonly Stage[];
  readonly extraSlots?: readonly StageSlot[];
  readonly extraFixtures?: readonly Fixture[];
  readonly extraSummaries?: readonly MatchSummary[];
  readonly groupConfig?: Partial<Stage['config']>;
  readonly status?: SnapshotSpec['status'];
  readonly koName?: string;
}

export function cupSnapshot(spec: CupSpec = {}): TournamentSnapshot {
  const poolA = spec.poolA ?? POOL_A;
  const poolB = spec.poolB ?? POOL_B;
  const groupFixturesAll = [
    ...groupFixtures(poolA, 'pA', 1, spec.playedA ?? poolA.length),
    ...groupFixtures(poolB, 'pB', 7, spec.playedB ?? poolB.length),
  ];
  const ko = koFixtures().map((candidate) => {
    const result = spec.ko?.[candidate.id];
    return result ? withResult(candidate, result) : candidate;
  });
  const summaries = [
    ...poolA.slice(0, spec.playedA ?? poolA.length),
    ...poolB.slice(0, spec.playedB ?? poolB.length),
    ...Object.values(spec.ko ?? {}),
    ...(spec.extraSummaries ?? []),
  ];
  return makeSnapshot({
    teams: CUP_TEAMS,
    stages: [
      stage('groups', 'Group stage', 'group', 0, spec.groupConfig),
      stage('ko', spec.koName ?? 'Knockouts', 'knockout', 1, { entryRules: TOP_TWO, decidesChampion: true, ...spec.koConfig }),
      ...(spec.extraStages ?? []),
    ],
    pools: [pool('pA', 'groups', 'Pool A', 0), pool('pB', 'groups', 'Pool B', 1)],
    poolEntries: [
      ...POOL_A_TEAMS.map((id) => entry('groups', 'pA', team(id))),
      ...POOL_B_TEAMS.map((id) => entry('groups', 'pB', team(id))),
    ],
    slots: [...KO_SLOTS, ...(spec.extraSlots ?? [])],
    fixtures: [...groupFixturesAll, ...ko, ...(spec.extraFixtures ?? [])],
    summaries,
    overrides: spec.overrides,
    status: spec.status,
  });
}

export interface PoolScenarioSpec {
  readonly teams: readonly TeamId[];
  readonly results?: readonly MatchSummary[];
  readonly pending?: readonly (readonly [TeamId, TeamId])[];
  readonly qualify?: number;
  readonly points?: PointsSystem;
  readonly tieBreakers?: readonly TieBreakerKind[];
  readonly overrides?: readonly TournamentOverride[];
  readonly seeds?: Readonly<Record<TeamId, number>>;
}

export function poolScenario(spec: PoolScenarioSpec): TournamentSnapshot {
  const qualify = spec.qualify ?? 2;
  const results = spec.results ?? [];
  const played = results.map((summary, index) =>
    withResult(fixture(`g-${summary.matchId}`, 'groups', 'pA', index + 1, team(summary.teamAId), team(summary.teamBId)), summary),
  );
  const pending = (spec.pending ?? []).map(([a, b], index) =>
    fixture(`open-${a}-${b}-${index}`, 'groups', 'pA', results.length + index + 1, team(a), team(b)),
  );
  const slots = Array.from({ length: qualify }, (_, index) =>
    slot(`q${index + 1}`, 'ko', index, `A${index + 1}`, { kind: 'pool_position', stageId: 'groups', poolId: 'pA', position: index + 1 }),
  );
  return makeSnapshot({
    teams: spec.teams.map((id) => ({ id, name: id, seed: spec.seeds?.[id] ?? null })),
    stages: [
      stage('groups', 'Group stage', 'group', 0, { pointsSystem: spec.points ?? null, tieBreakers: spec.tieBreakers ?? null }),
      stage('ko', 'Semifinal', 'knockout', 1, {
        entryRules: [{ kind: 'top_per_pool', sourceStageId: 'groups', count: qualify, fromPosition: 1 }],
        decidesChampion: true,
      }),
    ],
    pools: [pool('pA', 'groups', 'Pool A', 0)],
    poolEntries: spec.teams.map((id) => entry('groups', 'pA', team(id))),
    slots,
    fixtures: [...played, ...pending],
    summaries: results,
    overrides: spec.overrides,
  });
}

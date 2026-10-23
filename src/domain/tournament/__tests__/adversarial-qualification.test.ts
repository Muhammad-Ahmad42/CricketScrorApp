/** @jest-environment node */
import type {
  Fixture,
  FixtureDraft,
  FixtureSide,
  HypotheticalResult,
  ImpactSummary,
  InningsSummary,
  KnockoutConfig,
  MatchSummary,
  PointsSystem,
  Pool,
  PoolEntry,
  ProposedChange,
  QualificationRule,
  SlotSource,
  Stage,
  StageConfig,
  StageEvaluation,
  StageSlot,
  StageType,
  StandingRow,
  StandingsTable,
  TeamQualification,
  TieBreakerKind,
  TournamentEvaluation,
  TournamentOverride,
  TournamentRules,
  TournamentSnapshot,
  TournamentStatus,
  TournamentTeamView,
  UnevenPoolNormalization,
} from '@/domain/types';
import { BASE_MATCH_RULES } from '@/domain/scoring/presets';
import {
  DEFAULT_KNOCKOUT_CONFIG,
  DEFAULT_NRR_CONFIG,
  DEFAULT_POINTS_SYSTEM,
  DEFAULT_STAGE_CONFIGS,
  DEFAULT_TIE_BREAKERS,
  applyChange,
  applyPlan,
  computeImpact,
  computeQualification,
  evaluateTournament,
  planChange,
  resolveChampion,
  resolveFixtureTeams,
  resolveStageSlots,
  simulate,
  stageEntrants,
} from '@/domain/tournament';
import type { ImpactContext, QualificationOptions } from '@/domain/tournament';

const TID = 'spring-cup';
const AT = '2026-04-01T09:00:00.000Z';
const NOW = '2026-06-01T12:00:00.000Z';

const NAMES: Readonly<Record<string, string>> = {
  TIG: 'Tigers',
  LIO: 'Lions',
  EAG: 'Eagles',
  HAW: 'Hawks',
  BUL: 'Bulls',
  ROY: 'Royals',
  KIN: 'Kings',
  TIT: 'Titans',
  BEA: 'Bears',
  BIS: 'Bison',
  PAN: 'Panthers',
  WOL: 'Wolves',
};

const nameOf = (id: string): string => NAMES[id] ?? id;
const T = (teamId: string): FixtureSide => ({ kind: 'team', teamId });
const S = (slotId: string): FixtureSide => ({ kind: 'slot', slotId });

type Membership = 'active' | 'withdrawn' | 'replaced';

function teamView(id: string, opts: { readonly seed?: number | null; readonly status?: Membership } = {}): TournamentTeamView {
  return {
    membership: {
      id: `tt-${id}`,
      tournamentId: TID,
      teamId: id,
      seed: opts.seed ?? null,
      status: opts.status ?? 'active',
      replacedByTeamId: null,
      inheritsFromTeamId: null,
      joinedAt: AT,
    },
    team: { id, name: nameOf(id), shortName: id.slice(0, 5), logoUri: null, captainId: null, createdAt: AT, updatedAt: AT, archivedAt: null },
  };
}

function mkStage(id: string, name: string, type: StageType, orderIndex: number, config: Partial<StageConfig> = {}): Stage {
  return {
    id,
    tournamentId: TID,
    name,
    type,
    orderIndex,
    status: orderIndex === 0 ? 'active' : 'pending',
    config: { ...DEFAULT_STAGE_CONFIGS[type], ...config },
    createdAt: AT,
    updatedAt: AT,
  };
}

function mkPool(id: string, stageId: string, name: string, orderIndex: number): Pool {
  return { id, stageId, name, orderIndex, legs: null };
}

function mkEntry(stageId: string, poolId: string, side: FixtureSide): PoolEntry {
  const key = side.kind === 'team' ? side.teamId : side.slotId;
  return { id: `pe-${stageId}-${key}`, poolId, stageId, side, seed: null };
}

function mkSlot(
  id: string,
  stageId: string,
  index: number,
  label: string,
  source: SlotSource,
  role: 'entry' | 'progression' = 'entry',
  seed: number | null = null,
): StageSlot {
  return { id, stageId, index, role, label, source, seed };
}

function mkFixture(
  id: string,
  stageId: string,
  poolId: string | null,
  matchNumber: number,
  sideA: FixtureSide,
  sideB: FixtureSide,
  patch: Partial<Fixture> = {},
): Fixture {
  return {
    id,
    tournamentId: TID,
    stageId,
    poolId,
    matchNumber,
    label: null,
    round: null,
    leg: null,
    bracket: null,
    isFinal: false,
    sideA,
    sideB,
    scheduledDate: null,
    scheduledTime: null,
    venueId: null,
    status: 'scheduled',
    matchId: null,
    matchSides: null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: AT,
    updatedAt: AT,
    ...patch,
  };
}

function toDraft(f: Fixture): FixtureDraft {
  return {
    id: f.id,
    tournamentId: f.tournamentId,
    stageId: f.stageId,
    poolId: f.poolId,
    matchNumber: f.matchNumber,
    label: f.label,
    round: f.round,
    leg: f.leg,
    bracket: f.bracket,
    isFinal: f.isFinal,
    sideA: f.sideA,
    sideB: f.sideB,
    scheduledDate: f.scheduledDate,
    scheduledTime: f.scheduledTime,
    venueId: f.venueId,
    status: f.status,
    formatId: f.formatId,
    matchRules: f.matchRules,
    notes: f.notes,
  };
}

type Res =
  | { readonly win: string; readonly by?: number; readonly winnerRuns?: number; readonly loserRuns?: number }
  | { readonly tie: true; readonly decider?: string }
  | { readonly nr: true }
  | { readonly abandoned: true }
  | { readonly walkover: string }
  | { readonly awarded: string | null };

const win = (team: string, by = 20): Res => ({ win: team, by });

function completedAt(order: number): string {
  return new Date(Date.UTC(2026, 3, 1) + order * 3_600_000).toISOString();
}

function inningsOf(index: number, bat: string, bowl: string, runs: number, balls: number, target: number | null): InningsSummary {
  return {
    inningsIndex: index,
    battingTeamId: bat,
    bowlingTeamId: bowl,
    runs,
    wickets: 4,
    legalBalls: balls,
    allottedBalls: 120,
    ballsPerOver: 6,
    allOut: false,
    completion: target !== null && runs >= target ? 'target_reached' : 'overs_complete',
    target,
    targetRevised: false,
    extras: 0,
    fours: 0,
    sixes: 0,
    batting: [],
    bowling: [],
    bestPartnership: null,
  };
}

function summaryOf(matchId: string, a: string, b: string, res: Res, order: number): MatchSummary {
  const common = {
    summaryVersion: 2 as const,
    matchId,
    teamAId: a,
    teamBId: b,
    ballsPerOver: 6,
    superOvers: [],
    squads: [],
    completedAt: completedAt(order),
  };
  if ('win' in res) {
    const loser = res.win === a ? b : a;
    const loserRuns = res.loserRuns ?? 140;
    const winnerRuns = res.winnerRuns ?? loserRuns + (res.by ?? 20);
    const aRuns = res.win === a ? winnerRuns : loserRuns;
    const bRuns = res.win === a ? loserRuns : winnerRuns;
    return {
      ...common,
      status: 'completed',
      result: {
        type: 'win',
        winnerTeamId: res.win,
        loserTeamId: loser,
        margin: res.win === a ? { kind: 'runs', runs: aRuns - bRuns } : { kind: 'wickets', wickets: 6, ballsRemaining: 0 },
        method: 'normal',
      },
      winnerTeamId: res.win,
      innings: [inningsOf(0, a, b, aRuns, 120, null), inningsOf(1, b, a, bRuns, 120, aRuns + 1)],
    };
  }
  if ('tie' in res) {
    return {
      ...common,
      status: 'completed',
      result: { type: 'tie', decider: res.decider ? { method: 'super_over', winnerTeamId: res.decider, superOverRounds: 1 } : null },
      winnerTeamId: res.decider ?? null,
      innings: [inningsOf(0, a, b, 150, 120, null), inningsOf(1, b, a, 150, 120, 151)],
    };
  }
  if ('nr' in res) {
    return { ...common, status: 'completed', result: { type: 'no_result', reason: 'Rain' }, winnerTeamId: null, innings: [] };
  }
  if ('abandoned' in res) {
    return { ...common, status: 'abandoned', result: { type: 'abandoned', reason: 'Rain' }, winnerTeamId: null, innings: [] };
  }
  if ('walkover' in res) {
    const loser = res.walkover === a ? b : a;
    return {
      ...common,
      status: 'completed',
      result: { type: 'walkover', winnerTeamId: res.walkover, loserTeamId: loser, reason: 'Opponent did not arrive' },
      winnerTeamId: res.walkover,
      innings: [],
    };
  }
  const awardedLoser = res.awarded === null ? null : res.awarded === a ? b : a;
  return {
    ...common,
    status: 'completed',
    result: { type: 'awarded', winnerTeamId: res.awarded, loserTeamId: awardedLoser, reason: 'Awarded by the organizer', margin: null },
    winnerTeamId: res.awarded,
    innings: [],
  };
}

function sideTeam(side: FixtureSide): string {
  if (side.kind !== 'team') throw new Error('a slot side needs explicit teams');
  return side.teamId;
}

interface Played {
  readonly fixtures: readonly Fixture[];
  readonly summaries: readonly MatchSummary[];
}

function play(
  fixtures: readonly Fixture[],
  results: Readonly<Record<string, Res>>,
  teamsFor: Readonly<Record<string, readonly [string, string]>> = {},
): Played {
  const summaries: MatchSummary[] = [];
  const out = fixtures.map((f) => {
    const res = results[f.id];
    if (!res) return f;
    const [a, b] = teamsFor[f.id] ?? [sideTeam(f.sideA), sideTeam(f.sideB)];
    const summary = summaryOf(`m-${f.id}`, a, b, res, f.matchNumber);
    summaries.push(summary);
    const status: Fixture['status'] = summary.status === 'abandoned' ? 'abandoned' : 'completed';
    return { ...f, matchId: summary.matchId, matchSides: { teamAId: a, teamBId: b }, status };
  });
  return { fixtures: out, summaries };
}

interface SnapSpec {
  readonly teams: readonly TournamentTeamView[];
  readonly stages: readonly Stage[];
  readonly pools?: readonly Pool[];
  readonly poolEntries?: readonly PoolEntry[];
  readonly slots?: readonly StageSlot[];
  readonly fixtures?: readonly Fixture[];
  readonly summaries?: readonly MatchSummary[];
  readonly overrides?: readonly TournamentOverride[];
  readonly rules?: Partial<TournamentRules>;
  readonly status?: TournamentStatus;
}

function snap(spec: SnapSpec): TournamentSnapshot {
  const summaries: Record<string, MatchSummary> = {};
  for (const summary of spec.summaries ?? []) summaries[summary.matchId] = summary;
  const rules: TournamentRules = {
    tournamentId: TID,
    pointsSystem: DEFAULT_POINTS_SYSTEM,
    nrr: DEFAULT_NRR_CONFIG,
    tieBreakers: DEFAULT_TIE_BREAKERS,
    defaultFormatId: 'T20',
    defaultMatchRules: BASE_MATCH_RULES,
    updatedAt: AT,
    ...spec.rules,
  };
  return {
    version: '7',
    tournament: {
      id: TID,
      name: 'Spring Cup',
      season: '2026',
      description: null,
      logoUri: null,
      organizer: null,
      contact: null,
      location: null,
      notes: null,
      startDate: null,
      endDate: null,
      venueIds: [],
      structureKind: 'groups_knockout',
      status: spec.status ?? 'active',
      createdAt: AT,
      updatedAt: AT,
    },
    rules,
    teams: spec.teams,
    stages: spec.stages,
    pools: spec.pools ?? [],
    poolEntries: spec.poolEntries ?? [],
    slots: spec.slots ?? [],
    fixtures: spec.fixtures ?? [],
    summaries,
    staleSummaryMatchIds: [],
    overrides: spec.overrides ?? [],
  };
}

function deepFreeze<V>(value: V): V {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function overrideBase(id: string, reason: string, revokedAt: string | null) {
  return { id, tournamentId: TID, reason, createdAt: AT, revokedAt, revokeReason: revokedAt ? 'Entered by mistake' : null };
}

function qualOverride(
  id: string,
  stageId: string,
  teamId: string,
  action: 'qualify' | 'eliminate' | 'reassign',
  slotId: string | null,
  reason: string,
  revokedAt: string | null = null,
): TournamentOverride {
  return { ...overrideBase(id, reason, revokedAt), kind: 'qualification', stageId, teamId, action, slotId, poolId: null };
}

function slotAssign(id: string, slotId: string, teamId: string, revokedAt: string | null = null): TournamentOverride {
  return { ...overrideBase(id, 'Wildcard chosen by the committee', revokedAt), kind: 'slot_assignment', slotId, teamId };
}

function pointsAdj(id: string, stageId: string, poolId: string | null, teamId: string, points: number): TournamentOverride {
  return { ...overrideBase(id, 'Slow over-rate', null), kind: 'points_adjustment', stageId, poolId, teamId, points };
}

function championOv(id: string, teamIds: readonly string[], revokedAt: string | null = null): TournamentOverride {
  return { ...overrideBase(id, 'Final washed out, trophy shared', revokedAt), kind: 'champion', teamIds };
}

function tieRes(id: string, stageId: string, poolId: string | null, orderedTeamIds: readonly string[]): TournamentOverride {
  return {
    ...overrideBase(id, 'Fair play record', null),
    kind: 'tie_resolution',
    stageId,
    poolId,
    orderedTeamIds,
    method: 'organizer_decision',
    seed: null,
  };
}

function allPairs(n: number): (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [];
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) pairs.push([i, j]);
  return pairs;
}

const posSrc = (poolId: string, position: number, stageId = 'grp'): SlotSource => ({ kind: 'pool_position', stageId, poolId, position });

const POOL_A = ['TIG', 'LIO', 'EAG', 'HAW'] as const;
const POOL_B = ['BUL', 'ROY', 'KIN', 'TIT'] as const;
const RR_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

function roundRobinFixtures(stageId: string, poolId: string, prefix: string, teams: readonly string[], start: number): Fixture[] {
  return RR_PAIRS.map(([i, j], k) => mkFixture(`${prefix}${k + 1}`, stageId, poolId, start + k, T(teams[i]), T(teams[j]), { round: k + 1 }));
}

const RESULTS_A: Readonly<Record<string, Res>> = {
  fA1: win('TIG', 20),
  fA2: win('EAG', 10),
  fA3: win('TIG', 30),
  fA4: win('LIO', 40),
  fA5: win('TIG', 50),
  fA6: win('LIO', 15),
};

const RESULTS_B: Readonly<Record<string, Res>> = {
  fB1: win('BUL', 25),
  fB2: win('KIN', 5),
  fB3: win('BUL', 35),
  fB4: win('ROY', 45),
  fB5: win('BUL', 60),
  fB6: win('ROY', 12),
};

const ALL_GROUPS: Readonly<Record<string, Res>> = { ...RESULTS_A, ...RESULTS_B };

const TOP_TWO: QualificationRule = { kind: 'top_per_pool', sourceStageId: 'grp', count: 2, fromPosition: 1 };
const TOP_ONE: QualificationRule = { kind: 'top_per_pool', sourceStageId: 'grp', count: 1, fromPosition: 1 };
const CHAIN_TEXT = 'Points → NRR → Head-to-Head → Most wins → Organizer decision';

function koSlots(): StageSlot[] {
  return [
    mkSlot('sA1', 'ko', 0, 'A1', posSrc('pA', 1), 'entry', 1),
    mkSlot('sB1', 'ko', 1, 'B1', posSrc('pB', 1), 'entry', 2),
    mkSlot('sA2', 'ko', 2, 'A2', posSrc('pA', 2), 'entry', 3),
    mkSlot('sB2', 'ko', 3, 'B2', posSrc('pB', 2), 'entry', 4),
    mkSlot('sW1', 'ko', 4, 'Winner SF1', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 0 }, 'progression'),
    mkSlot('sW2', 'ko', 5, 'Winner SF2', { kind: 'bracket_winner', stageId: 'ko', round: 1, position: 1 }, 'progression'),
  ];
}

function koFixtures(ids: readonly [string, string, string] = ['SF1', 'SF2', 'FIN']): Fixture[] {
  return [
    mkFixture(ids[0], 'ko', null, 13, S('sA1'), S('sB2'), {
      label: 'SF1',
      round: 1,
      bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' },
    }),
    mkFixture(ids[1], 'ko', null, 14, S('sB1'), S('sA2'), {
      label: 'SF2',
      round: 1,
      bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' },
    }),
    mkFixture(ids[2], 'ko', null, 15, S('sW1'), S('sW2'), {
      label: 'Final',
      round: 2,
      isFinal: true,
      bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' },
    }),
  ];
}

interface CupOpts {
  readonly results?: Readonly<Record<string, Res>>;
  readonly teamsFor?: Readonly<Record<string, readonly [string, string]>>;
  readonly knockout?: Partial<KnockoutConfig>;
  readonly overrides?: readonly TournamentOverride[];
  readonly extraTeams?: readonly TournamentTeamView[];
  readonly teamOpts?: Readonly<Record<string, { readonly seed?: number | null; readonly status?: Membership }>>;
  readonly koEntryRules?: readonly QualificationRule[];
  readonly koSlots?: readonly StageSlot[];
  readonly koFixtures?: readonly Fixture[];
  readonly extraStages?: readonly Stage[];
  readonly extraSlots?: readonly StageSlot[];
  readonly extraFixtures?: readonly Fixture[];
  readonly groupConfig?: Partial<StageConfig>;
  readonly status?: TournamentStatus;
}

function cup(opts: CupOpts = {}): TournamentSnapshot {
  const grp = mkStage('grp', 'Group stage', 'group', 0, opts.groupConfig);
  const ko = mkStage('ko', 'Knockouts', 'knockout', 1, {
    entryRules: opts.koEntryRules ?? [TOP_TWO],
    decidesChampion: true,
    knockout: { ...DEFAULT_KNOCKOUT_CONFIG, ...opts.knockout },
  });
  const base = [
    ...roundRobinFixtures('grp', 'pA', 'fA', POOL_A, 1),
    ...roundRobinFixtures('grp', 'pB', 'fB', POOL_B, 7),
    ...(opts.koFixtures ?? koFixtures()),
    ...(opts.extraFixtures ?? []),
  ];
  const { fixtures, summaries } = play(base, opts.results ?? {}, opts.teamsFor);
  return snap({
    teams: [...[...POOL_A, ...POOL_B].map((id) => teamView(id, opts.teamOpts?.[id])), ...(opts.extraTeams ?? [])],
    stages: [grp, ko, ...(opts.extraStages ?? [])],
    pools: [mkPool('pA', 'grp', 'Pool A', 0), mkPool('pB', 'grp', 'Pool B', 1)],
    poolEntries: [...POOL_A.map((id) => mkEntry('grp', 'pA', T(id))), ...POOL_B.map((id) => mkEntry('grp', 'pB', T(id)))],
    slots: [...(opts.koSlots ?? koSlots()), ...(opts.extraSlots ?? [])],
    fixtures,
    summaries,
    overrides: opts.overrides,
    status: opts.status,
  });
}

interface PoolSpec {
  readonly id: string;
  readonly name: string;
  readonly teams: readonly string[];
}

function pairId(a: string, b: string): string {
  return `${a}v${b}`;
}

function poolsTournament(spec: {
  readonly pools: readonly PoolSpec[];
  readonly results: Readonly<Record<string, Res>>;
  readonly entryRules: readonly QualificationRule[];
  readonly slots: readonly StageSlot[];
  readonly cancelled?: readonly string[];
  readonly teamOpts?: Readonly<Record<string, { readonly seed?: number | null; readonly status?: Membership }>>;
  readonly overrides?: readonly TournamentOverride[];
  readonly groupType?: StageType;
  readonly groupConfig?: Partial<StageConfig>;
  readonly targetConfig?: Partial<StageConfig>;
}): TournamentSnapshot {
  const fixtures: Fixture[] = [];
  let number = 1;
  for (const pool of spec.pools) {
    for (const [i, j] of allPairs(pool.teams.length)) {
      const id = pairId(pool.teams[i], pool.teams[j]);
      const cancelled = spec.cancelled?.includes(id) ?? false;
      fixtures.push(mkFixture(id, 'grp', pool.id, number, T(pool.teams[i]), T(pool.teams[j]), cancelled ? { status: 'cancelled' } : {}));
      number += 1;
    }
  }
  const played = play(fixtures, spec.results);
  const teams = spec.pools.flatMap((p) => p.teams);
  return snap({
    teams: teams.map((id) => teamView(id, spec.teamOpts?.[id])),
    stages: [
      mkStage('grp', 'Group stage', spec.groupType ?? 'group', 0, spec.groupConfig),
      mkStage('ko', 'Knockouts', 'knockout', 1, { entryRules: spec.entryRules, ...spec.targetConfig }),
    ],
    pools: spec.pools.map((p, i) => mkPool(p.id, 'grp', p.name, i)),
    poolEntries: spec.pools.flatMap((p) => p.teams.map((id) => mkEntry('grp', p.id, T(id)))),
    slots: spec.slots,
    fixtures: played.fixtures,
    summaries: played.summaries,
    overrides: spec.overrides,
  });
}

function stageOf(ev: TournamentEvaluation, stageId: string): StageEvaluation {
  const found = ev.stages.find((candidate) => candidate.stageId === stageId);
  if (!found) throw new Error(`stage ${stageId} was not evaluated`);
  return found;
}

const slotOf = (ev: TournamentEvaluation, slotId: string) => ev.stages.flatMap((s) => s.slots).find((s) => s.slotId === slotId);
const slotTeam = (ev: TournamentEvaluation, slotId: string): string | null => slotOf(ev, slotId)?.teamId ?? null;

function tableOf(ev: TournamentEvaluation, stageId: string, poolId: string): StandingsTable {
  const found = stageOf(ev, stageId).tables.find((t) => t.poolId === poolId);
  if (!found) throw new Error(`no table for ${stageId}/${poolId}`);
  return found;
}

const rowOf = (ev: TournamentEvaluation, stageId: string, poolId: string, teamId: string): StandingRow | undefined =>
  tableOf(ev, stageId, poolId).rows.find((r) => r.teamId === teamId);

const qualOf = (ev: TournamentEvaluation, stageId: string, teamId: string): TeamQualification | undefined =>
  stageOf(ev, stageId).qualification.find((q) => q.teamId === teamId);

const targetOf = (q: TeamQualification | undefined, stageId: string) => q?.targets.find((t) => t.stageId === stageId);

const fixtureIn = (s: TournamentSnapshot, id: string): Fixture => {
  const found = s.fixtures.find((f) => f.id === id);
  if (!found) throw new Error(`no fixture ${id}`);
  return found;
};

const entryTeams = (ev: TournamentEvaluation, stageId: string, slots: readonly StageSlot[]) =>
  slots
    .filter((s) => s.stageId === stageId && s.role === 'entry')
    .map((s) => slotTeam(ev, s.id))
    .filter((t): t is string => t !== null);

const sortedIds = (ids: readonly string[]) => [...ids].sort();

function ctx(): ImpactContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: NOW,
  };
}

describe('top N per pool', () => {
  it('complete pools fill A1 B1 A2 B2 with final teams and every §98 explanation tells the truth', () => {
    const snapshot = deepFreeze(cup({ results: ALL_GROUPS }));
    const ev = evaluateTournament(snapshot);
    const expected: Record<string, string> = { sA1: 'TIG', sB1: 'BUL', sA2: 'LIO', sB2: 'ROY' };
    for (const [slotId, teamId] of Object.entries(expected)) {
      expect(slotOf(ev, slotId)).toMatchObject({ teamId, status: 'final', viaOverride: false });
      expect(slotOf(ev, slotId)?.explanation).toContain(nameOf(teamId));
      const q = qualOf(ev, 'grp', teamId);
      expect(q).toMatchObject({ state: 'qualified', certainty: 'mathematical', targetStageId: 'ko', slotIds: [slotId], override: null });
      expect(q?.targets).toEqual([expect.objectContaining({ stageId: 'ko', state: 'qualified', certainty: 'mathematical', slotIds: [slotId] })]);
      expect(q?.explanation).toContain(`${nameOf(teamId)} have mathematically qualified for the Knockouts`);
      expect(q?.explanation).toContain('Top 2 from each pool');
      expect(q?.explanation).toContain(CHAIN_TEXT);
    }
    for (const teamId of ['EAG', 'HAW', 'KIN', 'TIT']) {
      const q = qualOf(ev, 'grp', teamId);
      expect(q).toMatchObject({ state: 'eliminated', certainty: 'mathematical', slotIds: [], override: null });
      expect(q?.explanation).toContain(`${nameOf(teamId)} can no longer qualify for the Knockouts`);
      expect(q?.explanation).not.toMatch(/have (mathematically )?qualified|in contention/);
    }
    for (const table of stageOf(ev, 'grp').tables) {
      for (const row of table.rows) {
        expect(row.qualification).toEqual(qualOf(ev, 'grp', row.teamId ?? ''));
      }
    }
    expect(resolveFixtureTeams(ev, fixtureIn(snapshot, 'SF1'))).toEqual({ a: 'TIG', b: 'ROY', frozen: false });
    expect(resolveFixtureTeams(ev, fixtureIn(snapshot, 'SF2'))).toEqual({ a: 'BUL', b: 'LIO', frozen: false });
  });

  it('before any match every slot is pending, every team is in contention and nothing needs a decision', () => {
    const ev = evaluateTournament(deepFreeze(cup()));
    for (const slotId of ['sA1', 'sB1', 'sA2', 'sB2', 'sW1', 'sW2']) {
      expect(slotOf(ev, slotId)).toMatchObject({ status: 'pending', teamId: null });
    }
    const qualification = stageOf(ev, 'grp').qualification;
    expect(sortedIds(qualification.map((q) => q.teamId))).toEqual(sortedIds([...POOL_A, ...POOL_B]));
    for (const q of qualification) {
      expect(q).toMatchObject({ state: 'in_contention', certainty: 'provisional' });
      expect(q.explanation).toContain(`${nameOf(q.teamId)} are still in contention for the Knockouts`);
    }
    for (const table of stageOf(ev, 'grp').tables) expect(table.unresolvedTies).toEqual([]);
    expect(ev.progress).toEqual({ done: 0, total: 15 });
    expect(ev.champion).toBeNull();
    expect(ev.currentStageId).toBe('grp');
  });

  it('mid-stage (§9.1 shape) keeps provisional texts free of certainty words', () => {
    const results = { fA1: win('TIG', 20), fA2: win('EAG', 10), fA3: win('TIG', 30), fA4: win('LIO', 40), ...RESULTS_B };
    const ev = evaluateTournament(deepFreeze(cup({ results })));
    expect(targetOf(qualOf(ev, 'grp', 'TIG'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(qualOf(ev, 'grp', 'TIG')?.explanation).toContain('Tigers have mathematically qualified for the Knockouts');
    expect(targetOf(qualOf(ev, 'grp', 'HAW'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(qualOf(ev, 'grp', 'HAW')?.explanation).toContain('Hawks can no longer qualify for the Knockouts');
    for (const teamId of ['LIO', 'EAG']) {
      const q = qualOf(ev, 'grp', teamId);
      expect(q?.certainty).toBe('provisional');
      expect(q?.state).not.toBe('eliminated');
      expect(q?.explanation).toMatch(/still in contention|currently hold/);
      expect(q?.explanation).not.toMatch(/mathematically|can no longer/);
    }
    expect(slotOf(ev, 'sA1')).toMatchObject({ teamId: 'TIG', status: 'provisional' });
    expect(slotOf(ev, 'sA2')).toMatchObject({ teamId: 'LIO', status: 'provisional' });
    expect(slotOf(ev, 'sB1')).toMatchObject({ teamId: 'BUL', status: 'final' });
  });

  it('a leader that can no longer be caught makes its pool_position slot final before the pool ends', () => {
    const results = { fA1: win('TIG'), fA3: win('TIG'), fA5: win('TIG'), fA6: win('LIO'), ...RESULTS_B };
    const ev = evaluateTournament(deepFreeze(cup({ results })));
    expect(tableOf(ev, 'grp', 'pA').complete).toBe(false);
    expect(slotOf(ev, 'sA1')).toMatchObject({ teamId: 'TIG', status: 'final' });
    expect(targetOf(qualOf(ev, 'grp', 'TIG'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(slotOf(ev, 'sA2')?.status).toBe('provisional');
  });

  it('top 3 of a 3-team pool: everyone has mathematically qualified before a ball is bowled', () => {
    const snapshot = poolsTournament({
      pools: [{ id: 'pA', name: 'Pool A', teams: ['TIG', 'LIO', 'EAG'] }],
      results: {},
      entryRules: [{ kind: 'top_per_pool', sourceStageId: 'grp', count: 3, fromPosition: 1 }],
      slots: [1, 2, 3].map((p) => mkSlot(`p${p}`, 'ko', p - 1, `A${p}`, posSrc('pA', p))),
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    for (const teamId of ['TIG', 'LIO', 'EAG']) {
      expect(targetOf(qualOf(ev, 'grp', teamId), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
      expect(qualOf(ev, 'grp', teamId)?.explanation).not.toMatch(/guarantee/);
    }
  });

  it('top 3 of a 3-team pool after one match: still everyone qualified (control for the case above)', () => {
    const snapshot = poolsTournament({
      pools: [{ id: 'pA', name: 'Pool A', teams: ['TIG', 'LIO', 'EAG'] }],
      results: { [pairId('TIG', 'LIO')]: win('TIG') },
      entryRules: [{ kind: 'top_per_pool', sourceStageId: 'grp', count: 3, fromPosition: 1 }],
      slots: [1, 2, 3].map((p) => mkSlot(`p${p}`, 'ko', p - 1, `A${p}`, posSrc('pA', p))),
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    for (const teamId of ['TIG', 'LIO', 'EAG']) {
      expect(targetOf(qualOf(ev, 'grp', teamId), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    }
  });
});

type KeyMode = 'points' | 'wins' | 'losses' | 'seed';
type PlayedKind = 'winA' | 'winB' | 'bonusA' | 'bonusB' | 'tie' | 'tieDecA' | 'tieDecB' | 'nr' | 'ab' | 'woA' | 'woB';

const PLAYED_KINDS: readonly PlayedKind[] = ['winA', 'winB', 'bonusA', 'bonusB', 'tie', 'tieDecA', 'tieDecB', 'nr', 'ab', 'woA', 'woB'];

const CHAINS: Readonly<Record<KeyMode, readonly TieBreakerKind[]>> = {
  points: DEFAULT_TIE_BREAKERS,
  wins: ['points', 'wins', 'nrr', 'organizer_decision'],
  losses: ['points', 'fewer_losses', 'nrr'],
  seed: ['points', 'seed', 'nrr'],
};

const POINTS_SYSTEMS: readonly { readonly name: string; readonly points: PointsSystem }[] = [
  { name: 'default', points: DEFAULT_POINTS_SYSTEM },
  {
    name: 'bonus',
    points: { ...DEFAULT_POINTS_SYSTEM, win: 4, tie: 2, noResult: 2, bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 } },
  },
  {
    name: 'walkover-abandoned',
    points: { ...DEFAULT_POINTS_SYSTEM, abandoned: 0, walkoverWin: 3, walkoverLoss: -1, superOverDecidedTie: 'tie' },
  },
  { name: 'participation', points: { ...DEFAULT_POINTS_SYSTEM, win: 3, tie: 2, noResult: 2, loss: 1 } },
  { name: 'tie-over-nr', points: { ...DEFAULT_POINTS_SYSTEM, noResult: 0, superOverDecidedTie: 'tie' } },
];

interface Delta {
  readonly pa: number;
  readonly pb: number;
  readonly wa: number;
  readonly wb: number;
  readonly la: number;
  readonly lb: number;
}

function resOf(kind: PlayedKind, a: string, b: string): Res {
  switch (kind) {
    case 'winA':
      return { win: a, winnerRuns: 150, loserRuns: 140 };
    case 'winB':
      return { win: b, winnerRuns: 150, loserRuns: 140 };
    case 'bonusA':
      return { win: a, winnerRuns: 180, loserRuns: 120 };
    case 'bonusB':
      return { win: b, winnerRuns: 180, loserRuns: 120 };
    case 'tie':
      return { tie: true };
    case 'tieDecA':
      return { tie: true, decider: a };
    case 'tieDecB':
      return { tie: true, decider: b };
    case 'nr':
      return { nr: true };
    case 'ab':
      return { abandoned: true };
    case 'woA':
      return { walkover: a };
    case 'woB':
      return { walkover: b };
  }
}

function deltaOf(kind: PlayedKind, p: PointsSystem): Delta {
  const bonus = p.bonus ? p.bonus.points : 0;
  const winA: Delta = { pa: p.win, pb: p.loss, wa: 1, wb: 0, la: 0, lb: 1 };
  const winB: Delta = { pa: p.loss, pb: p.win, wa: 0, wb: 1, la: 1, lb: 0 };
  const tie: Delta = { pa: p.tie, pb: p.tie, wa: 0, wb: 0, la: 0, lb: 0 };
  switch (kind) {
    case 'winA':
      return winA;
    case 'winB':
      return winB;
    case 'bonusA':
      return { ...winA, pa: p.win + bonus };
    case 'bonusB':
      return { ...winB, pb: p.win + bonus };
    case 'tie':
      return tie;
    case 'tieDecA':
      return p.superOverDecidedTie === 'win_loss' ? winA : tie;
    case 'tieDecB':
      return p.superOverDecidedTie === 'win_loss' ? winB : tie;
    case 'nr':
      return { ...tie, pa: p.noResult, pb: p.noResult };
    case 'ab':
      return { ...tie, pa: p.abandoned ?? p.noResult, pb: p.abandoned ?? p.noResult };
    case 'woA':
      return { pa: p.walkoverWin ?? p.win, pb: p.walkoverLoss ?? p.loss, wa: 1, wb: 0, la: 0, lb: 1 };
    case 'woB':
      return { pa: p.walkoverLoss ?? p.loss, pb: p.walkoverWin ?? p.win, wa: 0, wb: 1, la: 1, lb: 0 };
  }
}

function outcomeSet(p: PointsSystem): Delta[] {
  const seen = new Map<string, Delta>();
  for (const kind of PLAYED_KINDS) {
    const delta = deltaOf(kind, p);
    seen.set(JSON.stringify(delta), delta);
  }
  return [...seen.values()];
}

interface OracleTeam {
  readonly id: string;
  readonly active: boolean;
  readonly seed: number;
  readonly pts: number;
  readonly wins: number;
  readonly losses: number;
}

type Verdict = 'qualified' | 'eliminated' | 'in_contention';

function bruteForce(
  teams: readonly OracleTeam[],
  remaining: readonly (readonly [string, string])[],
  outcomes: readonly Delta[],
  k: number,
  mode: KeyMode,
): Map<string, Verdict> {
  const index = new Map(teams.map((t, i) => [t.id, i]));
  const pts = teams.map((t) => t.pts);
  const wins = teams.map((t) => t.wins);
  const losses = teams.map((t) => t.losses);
  const canQualify = teams.map(() => false);
  const canMiss = teams.map(() => false);
  const cmp = (u: number, t: number): number => {
    if (pts[u] !== pts[t]) return pts[u] - pts[t];
    if (mode === 'wins') return wins[u] - wins[t];
    if (mode === 'losses') return losses[t] - losses[u];
    if (mode === 'seed') return teams[t].seed - teams[u].seed;
    return 0;
  };
  const leaf = () => {
    teams.forEach((team, t) => {
      if (!team.active) return;
      let above = 0;
      let levelOrAbove = 0;
      teams.forEach((other, u) => {
        if (u === t || !other.active) return;
        const c = cmp(u, t);
        if (c > 0) above += 1;
        if (c >= 0) levelOrAbove += 1;
      });
      if (above < k) canQualify[t] = true;
      if (levelOrAbove >= k) canMiss[t] = true;
    });
  };
  const walk = (i: number) => {
    if (i === remaining.length) {
      leaf();
      return;
    }
    const a = index.get(remaining[i][0]) ?? -1;
    const b = index.get(remaining[i][1]) ?? -1;
    for (const o of outcomes) {
      pts[a] += o.pa;
      pts[b] += o.pb;
      wins[a] += o.wa;
      wins[b] += o.wb;
      losses[a] += o.la;
      losses[b] += o.lb;
      walk(i + 1);
      pts[a] -= o.pa;
      pts[b] -= o.pb;
      wins[a] -= o.wa;
      wins[b] -= o.wb;
      losses[a] -= o.la;
      losses[b] -= o.lb;
    }
  };
  walk(0);
  const verdicts = new Map<string, Verdict>();
  teams.forEach((team, i) => {
    if (!team.active) return;
    verdicts.set(team.id, !canMiss[i] ? 'qualified' : !canQualify[i] ? 'eliminated' : 'in_contention');
  });
  return verdicts;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<V>(rng: () => number, items: readonly V[]): V {
  return items[Math.floor(rng() * items.length)];
}

function shuffled<V>(rng: () => number, items: readonly V[]): V[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface RandomCase {
  readonly label: string;
  readonly snapshot: TournamentSnapshot;
  readonly expected: Map<string, Verdict>;
  readonly current: Map<string, { readonly pts: number; readonly won: number; readonly lost: number }>;
}

function randomCase(
  seed: number,
  opts: { readonly n?: number; readonly remaining?: number; readonly points?: PointsSystem; readonly mode?: KeyMode; readonly k?: number } = {},
): RandomCase {
  const rng = lcg(seed);
  const n = opts.n ?? (rng() < 0.5 ? 4 : 5);
  const ids = Array.from({ length: n }, (_, i) => `Q${i + 1}`);
  const pairs = allPairs(n).map(([i, j]) => [ids[i], ids[j]] as const);
  const system = opts.points ? { name: 'given', points: opts.points } : pick(rng, POINTS_SYSTEMS);
  const mode = opts.mode ?? pick(rng, ['points', 'wins', 'losses', 'seed'] as const);
  const k = opts.k ?? (n === 4 ? 2 : pick(rng, [1, 2]));
  const r = opts.remaining ?? 1 + Math.floor(rng() * Math.min(5, pairs.length));
  const order = shuffled(
    rng,
    pairs.map((_, i) => i),
  );
  const remainingIdx = new Set(order.slice(0, r));
  const seeds = shuffled(
    rng,
    ids.map((_, i) => i + 1),
  );
  const tally = new Map(ids.map((id) => [id, { pts: 0, won: 0, lost: 0 }]));
  const results: Record<string, Res> = {};
  const fixtures = pairs.map(([a, b], i) => mkFixture(`r${i + 1}`, 'grp', 'pA', i + 1, T(a), T(b)));
  pairs.forEach(([a, b], i) => {
    if (remainingIdx.has(i)) return;
    const kind = pick(rng, PLAYED_KINDS);
    results[`r${i + 1}`] = resOf(kind, a, b);
    const d = deltaOf(kind, system.points);
    const ta = tally.get(a);
    const tb = tally.get(b);
    if (!ta || !tb) return;
    tally.set(a, { pts: ta.pts + d.pa, won: ta.won + d.wa, lost: ta.lost + d.la });
    tally.set(b, { pts: tb.pts + d.pb, won: tb.won + d.wb, lost: tb.lost + d.lb });
  });
  const played = play(fixtures, results);
  const snapshot = snap({
    teams: ids.map((id, i) => teamView(id, { seed: seeds[i] })),
    stages: [
      mkStage('grp', 'Group stage', 'group', 0, { pointsSystem: system.points, tieBreakers: CHAINS[mode] }),
      mkStage('ko', 'Knockouts', 'knockout', 1, { entryRules: [{ kind: 'top_per_pool', sourceStageId: 'grp', count: k, fromPosition: 1 }] }),
    ],
    pools: [mkPool('pA', 'grp', 'Pool A', 0)],
    poolEntries: ids.map((id) => mkEntry('grp', 'pA', T(id))),
    slots: Array.from({ length: k }, (_, i) => mkSlot(`p${i + 1}`, 'ko', i, `A${i + 1}`, posSrc('pA', i + 1))),
    fixtures: played.fixtures,
    summaries: played.summaries,
  });
  const oracleTeams: OracleTeam[] = ids.map((id, i) => {
    const t = tally.get(id) ?? { pts: 0, won: 0, lost: 0 };
    return { id, active: true, seed: seeds[i], pts: t.pts, wins: t.won, losses: t.lost };
  });
  const expected = bruteForce(
    oracleTeams,
    pairs.filter((_, i) => remainingIdx.has(i)),
    outcomeSet(system.points),
    k,
    mode,
  );
  return { label: `seed ${seed} (${n} teams, ${r} left, top ${k}, ${mode} chain, ${system.name} points)`, snapshot, expected, current: tally };
}

function exactMismatches(c: RandomCase, opts?: QualificationOptions): string[] {
  const ev = evaluateTournament(c.snapshot, opts);
  const problems: string[] = [];
  for (const [teamId, verdict] of c.expected) {
    const target = targetOf(qualOf(ev, 'grp', teamId), 'ko');
    if (!target) {
      problems.push(`${c.label}: ${teamId} has no status for the Knockouts`);
      continue;
    }
    const got = `${target.state}/${target.certainty}`;
    if (verdict === 'qualified' && got !== 'qualified/mathematical') problems.push(`${c.label}: ${teamId} expected qualified/mathematical, got ${got}`);
    if (verdict === 'eliminated' && got !== 'eliminated/mathematical') problems.push(`${c.label}: ${teamId} expected eliminated/mathematical, got ${got}`);
    if (verdict === 'in_contention' && (target.certainty !== 'provisional' || target.state === 'eliminated')) {
      problems.push(`${c.label}: ${teamId} expected in contention (provisional), got ${got}`);
    }
  }
  return problems;
}

function soundnessViolations(c: RandomCase, opts?: QualificationOptions): string[] {
  const ev = evaluateTournament(c.snapshot, opts);
  const problems: string[] = [];
  for (const [teamId, verdict] of c.expected) {
    const target = targetOf(qualOf(ev, 'grp', teamId), 'ko');
    if (!target || target.certainty !== 'mathematical') continue;
    if (target.state === 'qualified' && verdict !== 'qualified') problems.push(`${c.label}: ${teamId} wrongly claimed qualified (truth ${verdict})`);
    if (target.state === 'eliminated' && verdict !== 'eliminated') problems.push(`${c.label}: ${teamId} wrongly claimed eliminated (truth ${verdict})`);
  }
  return problems;
}

function tallyMismatches(c: RandomCase): string[] {
  const ev = evaluateTournament(c.snapshot);
  const problems: string[] = [];
  for (const [teamId, t] of c.current) {
    const row = rowOf(ev, 'grp', 'pA', teamId);
    if (!row || row.points !== t.pts || row.won !== t.won || row.lost !== t.lost) {
      problems.push(`${c.label}: ${teamId} expected ${t.pts} pts ${t.won}W ${t.lost}L, got ${row?.points} pts ${row?.won}W ${row?.lost}L`);
    }
  }
  return problems;
}

describe('mathematical certainty against an independent brute-force oracle', () => {
  const CASES = Array.from({ length: 160 }, (_, i) => randomCase(9001 + i * 7919));

  it('the table points, wins and losses of every random pool follow the points system', () => {
    expect(CASES.flatMap(tallyMismatches).slice(0, 10)).toEqual([]);
  });

  it('exact enumeration agrees with the oracle for random pools, points systems and decisive chains', () => {
    expect(CASES.flatMap((c) => exactMismatches(c)).slice(0, 10)).toEqual([]);
  });

  it('above the enumeration limit the bounds never claim a wrong certainty', () => {
    const big = Array.from({ length: 8 }, (_, i) =>
      randomCase(424242 + i * 131, { n: 6, remaining: 10, points: DEFAULT_POINTS_SYSTEM, mode: 'points', k: i % 2 === 0 ? 2 : 3 }),
    );
    expect(big.flatMap((c) => soundnessViolations(c)).slice(0, 10)).toEqual([]);
  });

  it('raising the limit to 12 makes 10 undecided fixtures (3^10 = 59 049 ≤ 65 536 scenarios) exact', () => {
    const big = Array.from({ length: 6 }, (_, i) =>
      randomCase(777 + i * 97, { n: 6, remaining: 10, points: DEFAULT_POINTS_SYSTEM, mode: 'points', k: i % 2 === 0 ? 2 : 3 }),
    );
    expect(big.flatMap((c) => exactMismatches(c, { enumerationLimit: 12 })).slice(0, 10)).toEqual([]);
  });

  const SINGLE = { id: 'pA', name: 'Pool A', teams: ['TIG', 'LIO', 'EAG', 'HAW'] };
  const TOP_ONE_SLOT = [mkSlot('p1', 'ko', 0, 'A1', posSrc('pA', 1))];

  it('a withdrawn team kept in the table never blocks the active teams below it', () => {
    const snapshot = poolsTournament({
      pools: [SINGLE],
      results: {
        [pairId('TIG', 'LIO')]: win('TIG'),
        [pairId('TIG', 'EAG')]: win('TIG'),
        [pairId('TIG', 'HAW')]: win('TIG'),
        [pairId('LIO', 'EAG')]: win('LIO'),
        [pairId('LIO', 'HAW')]: win('LIO'),
      },
      entryRules: [TOP_ONE],
      slots: TOP_ONE_SLOT,
      teamOpts: { TIG: { status: 'withdrawn' } },
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(rowOf(ev, 'grp', 'pA', 'TIG')).toMatchObject({ membership: 'withdrawn', position: 1, points: 6 });
    expect(slotTeam(ev, 'p1')).toBe('LIO');
    expect(targetOf(qualOf(ev, 'grp', 'LIO'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'EAG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'HAW'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'TIG'), 'ko')?.state).not.toBe('qualified');
  });

  it('a cancelled fixture is not a remaining outcome', () => {
    const snapshot = poolsTournament({
      pools: [SINGLE],
      results: {
        [pairId('TIG', 'LIO')]: win('LIO'),
        [pairId('TIG', 'EAG')]: win('TIG'),
        [pairId('LIO', 'EAG')]: win('LIO'),
        [pairId('EAG', 'HAW')]: win('EAG'),
      },
      cancelled: [pairId('TIG', 'HAW')],
      entryRules: [TOP_ONE],
      slots: TOP_ONE_SLOT,
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(rowOf(ev, 'grp', 'pA', 'TIG')).toMatchObject({ points: 2, matchesRemaining: 0 });
    expect(targetOf(qualOf(ev, 'grp', 'LIO'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'TIG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  it('points adjustments are part of the current points used for certainty', () => {
    const base = {
      pools: [SINGLE],
      results: {
        [pairId('TIG', 'LIO')]: win('LIO'),
        [pairId('LIO', 'EAG')]: win('LIO'),
        [pairId('LIO', 'HAW')]: win('LIO'),
        [pairId('TIG', 'EAG')]: win('TIG'),
      },
      entryRules: [TOP_ONE],
      slots: TOP_ONE_SLOT,
    };
    const clean = evaluateTournament(deepFreeze(poolsTournament(base)));
    expect(targetOf(qualOf(clean, 'grp', 'LIO'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(targetOf(qualOf(clean, 'grp', 'TIG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    const docked = evaluateTournament(deepFreeze(poolsTournament({ ...base, overrides: [pointsAdj('ov-dock', 'grp', 'pA', 'LIO', -2)] })));
    expect(rowOf(docked, 'grp', 'pA', 'LIO')).toMatchObject({ points: 4, pointsAdjustment: -2 });
    expect(targetOf(qualOf(docked, 'grp', 'LIO'), 'ko')?.certainty).toBe('provisional');
    expect(targetOf(qualOf(docked, 'grp', 'TIG'), 'ko')?.certainty).toBe('provisional');
    expect(targetOf(qualOf(docked, 'grp', 'HAW'), 'ko')?.certainty).toBe('provisional');
    expect(targetOf(qualOf(docked, 'grp', 'EAG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  const PARTICIPATION: PointsSystem = { ...DEFAULT_POINTS_SYSTEM, win: 3, tie: 2, noResult: 2, loss: 1 };
  const TOP_TWO_SLOTS = [mkSlot('p1', 'ko', 0, 'A1', posSrc('pA', 1)), mkSlot('p2', 'ko', 1, 'A2', posSrc('pA', 2))];

  it('a team with no fixtures left is eliminated when two rivals already sit above its total (participation points, §5.5 bound suffices)', () => {
    const snapshot = poolsTournament({
      pools: [SINGLE],
      results: {
        [pairId('TIG', 'HAW')]: win('TIG'),
        [pairId('LIO', 'HAW')]: win('LIO'),
        [pairId('EAG', 'HAW')]: { nr: true },
      },
      entryRules: [TOP_TWO],
      slots: TOP_TWO_SLOTS,
      groupConfig: { pointsSystem: PARTICIPATION },
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(rowOf(ev, 'grp', 'pA', 'HAW')).toMatchObject({ points: 4, matchesRemaining: 0 });
    expect(rowOf(ev, 'grp', 'pA', 'TIG')).toMatchObject({ points: 3, matchesRemaining: 2 });
    expect(rowOf(ev, 'grp', 'pA', 'LIO')).toMatchObject({ points: 3, matchesRemaining: 2 });
    const hawks = qualOf(ev, 'grp', 'HAW');
    expect(targetOf(hawks, 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(hawks?.explanation).toContain('Hawks can no longer qualify for the Knockouts');
    expect(targetOf(qualOf(ev, 'grp', 'EAG'), 'ko')).toMatchObject({ state: 'in_contention', certainty: 'provisional' });
  });

  it('a 5-team pool where the finished team is beaten only jointly: Lions and Hawks cannot both stay below Kings', () => {
    const FIVE = { id: 'pA', name: 'Pool A', teams: ['KIN', 'TIG', 'LIO', 'HAW', 'EAG'] };
    const snapshot = poolsTournament({
      pools: [FIVE],
      results: {
        [pairId('KIN', 'TIG')]: win('TIG'),
        [pairId('KIN', 'LIO')]: win('LIO'),
        [pairId('KIN', 'HAW')]: { nr: true },
        [pairId('KIN', 'EAG')]: win('KIN'),
        [pairId('TIG', 'EAG')]: win('TIG'),
        [pairId('LIO', 'EAG')]: { tie: true },
        [pairId('HAW', 'EAG')]: win('HAW'),
      },
      entryRules: [TOP_TWO],
      slots: TOP_TWO_SLOTS,
      groupConfig: { pointsSystem: PARTICIPATION },
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(rowOf(ev, 'grp', 'pA', 'KIN')).toMatchObject({ points: 7, matchesRemaining: 0 });
    expect(rowOf(ev, 'grp', 'pA', 'TIG')).toMatchObject({ points: 6, matchesRemaining: 2 });
    expect(rowOf(ev, 'grp', 'pA', 'LIO')).toMatchObject({ points: 5, matchesRemaining: 2 });
    expect(rowOf(ev, 'grp', 'pA', 'HAW')).toMatchObject({ points: 5, matchesRemaining: 2 });
    expect(rowOf(ev, 'grp', 'pA', 'EAG')).toMatchObject({ points: 5, matchesRemaining: 0 });
    expect(targetOf(qualOf(ev, 'grp', 'KIN'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'EAG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  it('teams outside the top two today but above it in every completion are qualified, and the current slot holders are out', () => {
    const snapshot = poolsTournament({
      pools: [SINGLE],
      results: {
        [pairId('TIG', 'LIO')]: win('TIG', 100),
        [pairId('TIG', 'EAG')]: win('EAG', 1),
        [pairId('TIG', 'HAW')]: win('HAW', 2),
        [pairId('LIO', 'EAG')]: { nr: true },
        [pairId('LIO', 'HAW')]: { nr: true },
      },
      entryRules: [TOP_TWO],
      slots: TOP_TWO_SLOTS,
      groupConfig: { pointsSystem: PARTICIPATION },
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(tableOf(ev, 'grp', 'pA').rows.map((r) => [r.teamId, r.points])).toEqual([
      ['TIG', 5],
      ['HAW', 5],
      ['EAG', 5],
      ['LIO', 5],
    ]);
    expect(slotTeam(ev, 'p1')).toBe('TIG');
    const actual = Object.fromEntries(
      ['TIG', 'LIO', 'EAG', 'HAW'].map((teamId) => {
        const target = targetOf(qualOf(ev, 'grp', teamId), 'ko');
        return [teamId, `${target?.state}/${target?.certainty}`];
      }),
    );
    expect(actual).toEqual({
      TIG: 'eliminated/mathematical',
      LIO: 'eliminated/mathematical',
      EAG: 'qualified/mathematical',
      HAW: 'qualified/mathematical',
    });
  });

  it('control with default points: finished teams below two out-of-reach rivals are eliminated', () => {
    const snapshot = poolsTournament({
      pools: [SINGLE],
      results: {
        [pairId('EAG', 'HAW')]: win('HAW'),
        [pairId('TIG', 'HAW')]: win('TIG'),
        [pairId('LIO', 'HAW')]: win('LIO'),
        [pairId('TIG', 'EAG')]: { nr: true },
        [pairId('LIO', 'EAG')]: { nr: true },
      },
      entryRules: [TOP_TWO],
      slots: TOP_TWO_SLOTS,
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    for (const teamId of ['HAW', 'EAG']) {
      expect(targetOf(qualOf(ev, 'grp', teamId), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    }
    for (const teamId of ['TIG', 'LIO']) {
      expect(targetOf(qualOf(ev, 'grp', teamId), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    }
  });

  const NINE_OUTCOMES: PointsSystem = {
    ...DEFAULT_POINTS_SYSTEM,
    win: 4,
    loss: 0,
    tie: 2,
    noResult: 1,
    abandoned: 3,
    walkoverWin: 5,
    walkoverLoss: -1,
    superOverDecidedTie: 'tie',
    bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 },
  };

  it('a 9-outcome points system has 9 distinct observable tuples in the oracle', () => {
    expect(outcomeSet(NINE_OUTCOMES)).toHaveLength(9);
  });

  it('9-outcome points: 6 undecided fixtures (531 441 > 65 536 scenarios) fall back to bounds and never claim a wrong certainty', () => {
    const cases = Array.from({ length: 4 }, (_, i) => randomCase(4242 + i * 103, { n: 5, remaining: 6, points: NINE_OUTCOMES, mode: 'points', k: 2 }));
    expect(cases.flatMap(tallyMismatches)).toEqual([]);
    expect(cases.flatMap((c) => soundnessViolations(c))).toEqual([]);
  });

  it('9-outcome points: 5 undecided fixtures (59 049 scenarios, under the cap) are enumerated exactly', () => {
    const cases = Array.from({ length: 6 }, (_, i) => randomCase(31337 + i * 101, { n: 5, remaining: 5, points: NINE_OUTCOMES, mode: 'points', k: 2 }));
    expect(cases.flatMap((c) => soundnessViolations(c))).toEqual([]);
    expect(cases.flatMap((c) => exactMismatches(c))).toEqual([]);
  });
});

const UNEVEN_POOLS: readonly PoolSpec[] = [
  { id: 'pA', name: 'Pool A', teams: ['TIG', 'LIO', 'EAG', 'HAW'] },
  { id: 'pB', name: 'Pool B', teams: ['KIN', 'ROY', 'TIT'] },
  { id: 'pC', name: 'Pool C', teams: ['BUL', 'BEA', 'BIS'] },
];

const UNEVEN_RESULTS: Readonly<Record<string, Res>> = {
  [pairId('TIG', 'LIO')]: win('LIO', 30),
  [pairId('TIG', 'EAG')]: win('TIG', 10),
  [pairId('TIG', 'HAW')]: { win: 'TIG', winnerRuns: 200, loserRuns: 100 },
  [pairId('LIO', 'EAG')]: win('LIO', 20),
  [pairId('LIO', 'HAW')]: win('LIO', 20),
  [pairId('EAG', 'HAW')]: win('EAG', 20),
  [pairId('KIN', 'ROY')]: win('KIN', 10),
  [pairId('KIN', 'TIT')]: win('KIN', 20),
  [pairId('ROY', 'TIT')]: win('ROY', 20),
  [pairId('BUL', 'BEA')]: win('BUL', 15),
  [pairId('BUL', 'BIS')]: win('BUL', 20),
  [pairId('BEA', 'BIS')]: win('BEA', 5),
};

const winnerSlots = (): StageSlot[] => [
  mkSlot('sA1', 'ko', 0, 'A1', posSrc('pA', 1)),
  mkSlot('sB1', 'ko', 1, 'B1', posSrc('pB', 1)),
  mkSlot('sC1', 'ko', 2, 'C1', posSrc('pC', 1)),
];

const bestOf = (id: string, index: number, rank: number, normalization: UnevenPoolNormalization, label: string): StageSlot =>
  mkSlot(id, 'ko', index, label, { kind: 'best_of_position', stageId: 'grp', position: 2, rank, normalization });

describe('pool winners plus best runners-up across uneven pools', () => {
  it.each([
    ['raw', 'TIG'],
    ['per_match_average', 'TIG'],
    ['drop_extra_results', 'ROY'],
  ] as const)('%s normalisation picks %s as the best runner-up', (normalization, expected) => {
    const snapshot = poolsTournament({
      pools: UNEVEN_POOLS,
      results: UNEVEN_RESULTS,
      entryRules: [TOP_ONE, { kind: 'best_of_position', sourceStageId: 'grp', position: 2, count: 1, normalization }],
      slots: [...winnerSlots(), bestOf('sBR', 3, 1, normalization, 'Best runner-up')],
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect([slotTeam(ev, 'sA1'), slotTeam(ev, 'sB1'), slotTeam(ev, 'sC1')]).toEqual(['LIO', 'KIN', 'BUL']);
    expect(slotOf(ev, 'sBR')).toMatchObject({ teamId: expected, status: 'final' });
    expect(slotOf(ev, 'sBR')?.explanation).toContain(nameOf(expected));
    const comparison = stageOf(ev, 'grp').comparisonTables.find((c) => c.key === `position:2:${normalization}`);
    expect(comparison).toMatchObject({ position: 2, normalization });
    expect(sortedIds((comparison?.table.rows ?? []).map((r) => r.teamId ?? ''))).toEqual(['BEA', 'ROY', 'TIG']);
    expect(comparison?.table.rows[0].teamId).toBe(expected);
    if (normalization === 'drop_extra_results') {
      expect(comparison?.table.rows.find((r) => r.teamId === 'TIG')).toMatchObject({ played: 2, points: 2 });
    }
    for (const teamId of ['TIG', 'ROY', 'BEA']) {
      const status = targetOf(qualOf(ev, 'grp', teamId), 'ko');
      expect(status).toMatchObject({ state: teamId === expected ? 'qualified' : 'eliminated', certainty: 'mathematical' });
    }
  });

  it('best 2 runners-up: "2nd best runner-up" follows the raw comparison table', () => {
    const snapshot = poolsTournament({
      pools: UNEVEN_POOLS,
      results: UNEVEN_RESULTS,
      entryRules: [TOP_ONE, { kind: 'best_of_position', sourceStageId: 'grp', position: 2, count: 2, normalization: 'raw' }],
      slots: [...winnerSlots(), bestOf('sBR1', 3, 1, 'raw', 'Best runner-up'), bestOf('sBR2', 4, 2, 'raw', '2nd best runner-up')],
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(slotOf(ev, 'sBR1')).toMatchObject({ teamId: 'TIG', status: 'final' });
    expect(slotOf(ev, 'sBR2')).toMatchObject({ teamId: 'ROY', status: 'final' });
    expect(targetOf(qualOf(ev, 'grp', 'BEA'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'ROY'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
  });

  it('certainty across pools is exact when only one fixture is undecided', () => {
    const snapshot = poolsTournament({
      pools: [
        { id: 'pA', name: 'Pool A', teams: ['TIG', 'LIO', 'EAG'] },
        { id: 'pB', name: 'Pool B', teams: ['KIN', 'ROY', 'TIT'] },
        { id: 'pC', name: 'Pool C', teams: ['BUL', 'BEA', 'BIS'] },
      ],
      results: {
        [pairId('TIG', 'EAG')]: win('TIG'),
        [pairId('LIO', 'EAG')]: win('LIO'),
        [pairId('KIN', 'ROY')]: win('KIN'),
        [pairId('KIN', 'TIT')]: win('KIN'),
        [pairId('ROY', 'TIT')]: { nr: true },
        [pairId('BUL', 'BEA')]: win('BUL'),
        [pairId('BUL', 'BIS')]: win('BUL'),
        [pairId('BEA', 'BIS')]: { nr: true },
      },
      entryRules: [TOP_ONE, { kind: 'best_of_position', sourceStageId: 'grp', position: 2, count: 1, normalization: 'raw' }],
      slots: [...winnerSlots(), bestOf('sBR', 3, 1, 'raw', 'Best runner-up')],
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    const expected: Record<string, string> = {
      TIG: 'qualified/mathematical',
      LIO: 'qualified/mathematical',
      KIN: 'qualified/mathematical',
      BUL: 'qualified/mathematical',
      EAG: 'eliminated/mathematical',
      ROY: 'eliminated/mathematical',
      TIT: 'eliminated/mathematical',
      BEA: 'eliminated/mathematical',
      BIS: 'eliminated/mathematical',
    };
    const actual = Object.fromEntries(
      Object.keys(expected).map((teamId) => {
        const target = targetOf(qualOf(ev, 'grp', teamId), 'ko');
        return [teamId, `${target?.state}/${target?.certainty}`];
      }),
    );
    expect(actual).toEqual(expected);
    expect(slotOf(ev, 'sBR')?.status).toBe('provisional');
    expect(slotOf(ev, 'sB1')).toMatchObject({ teamId: 'KIN', status: 'final' });
  });
});

describe('top N overall', () => {
  const overallSlots = (): StageSlot[] => [
    mkSlot('sA1', 'ko', 0, 'A1', posSrc('pA', 1)),
    mkSlot('sB1', 'ko', 1, 'B1', posSrc('pB', 1)),
    mkSlot('sO1', 'ko', 2, '1st overall', { kind: 'overall_position', stageId: 'grp', rank: 1, normalization: 'raw' }),
    mkSlot('sO2', 'ko', 3, '2nd overall', { kind: 'overall_position', stageId: 'grp', rank: 2, normalization: 'raw' }),
  ];

  it('overall slots walk past pool winners in the overall table and explain the skip', () => {
    const snapshot = cup({
      results: ALL_GROUPS,
      koEntryRules: [TOP_ONE, { kind: 'top_overall', sourceStageId: 'grp', count: 2, normalization: 'raw' }],
      koSlots: overallSlots(),
      koFixtures: [],
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    const overall = stageOf(ev, 'grp').overall;
    expect(overall?.rows.slice(0, 4).map((r) => r.teamId)).toEqual(['BUL', 'TIG', 'LIO', 'ROY']);
    expect(slotOf(ev, 'sA1')).toMatchObject({ teamId: 'TIG', status: 'final' });
    expect(slotOf(ev, 'sB1')).toMatchObject({ teamId: 'BUL', status: 'final' });
    expect(slotOf(ev, 'sO1')).toMatchObject({ teamId: 'LIO', status: 'final' });
    expect(slotOf(ev, 'sO2')).toMatchObject({ teamId: 'ROY', status: 'final' });
    expect(slotOf(ev, 'sO1')?.explanation).toContain('Lions');
    expect(slotOf(ev, 'sO1')?.explanation).toMatch(/already/);
    expect(stageOf(ev, 'grp').comparisonTables.some((c) => c.key === 'overall:raw')).toBe(true);
    expect(overall?.rows[0].tieBreak).toEqual({
      separatedBy: 'nrr',
      aboveTeamId: 'TIG',
      detail: 'Ahead of Tigers on net run rate (+2.000 vs +1.667)',
      headline: 'Ahead of Tigers on NRR',
    });
    expect(targetOf(qualOf(ev, 'grp', 'ROY'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'EAG'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });
});

const plateStage = (entry: QualificationRule, decidesChampion = false) =>
  mkStage('plate', 'Plate', 'knockout', 2, { entryRules: [entry], decidesChampion, knockout: DEFAULT_KNOCKOUT_CONFIG });

const PLATE_THIRD_FOURTH: QualificationRule = { kind: 'top_per_pool', sourceStageId: 'grp', count: 2, fromPosition: 3 };

function plateSlots(): StageSlot[] {
  return [
    mkSlot('pA3', 'plate', 0, 'A3', posSrc('pA', 3), 'entry', 1),
    mkSlot('pB3', 'plate', 1, 'B3', posSrc('pB', 3), 'entry', 2),
    mkSlot('pA4', 'plate', 2, 'A4', posSrc('pA', 4), 'entry', 3),
    mkSlot('pB4', 'plate', 3, 'B4', posSrc('pB', 4), 'entry', 4),
    mkSlot('pW1', 'plate', 4, 'Winner SF1', { kind: 'bracket_winner', stageId: 'plate', round: 1, position: 0 }, 'progression'),
    mkSlot('pW2', 'plate', 5, 'Winner SF2', { kind: 'bracket_winner', stageId: 'plate', round: 1, position: 1 }, 'progression'),
  ];
}

function plateFixtures(): Fixture[] {
  return [
    mkFixture('PSF1', 'plate', null, 16, S('pA3'), S('pB4'), { label: 'SF1', bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } }),
    mkFixture('PSF2', 'plate', null, 17, S('pB3'), S('pA4'), { label: 'SF2', bracket: { kind: 'main', round: 1, position: 1, roundName: 'Semifinal' } }),
    mkFixture('PFIN', 'plate', null, 18, S('pW1'), S('pW2'), {
      label: 'Final',
      isFinal: true,
      bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' },
    }),
  ];
}

describe('parallel Cup and Plate targets', () => {
  it('3rd and 4th place qualify for the Plate while being out of the Cup, with a status per target', () => {
    const snapshot = deepFreeze(
      cup({ results: ALL_GROUPS, extraStages: [plateStage(PLATE_THIRD_FOURTH)], extraSlots: plateSlots(), extraFixtures: plateFixtures() }),
    );
    const ev = evaluateTournament(snapshot);
    expect(['pA3', 'pB3', 'pA4', 'pB4'].map((id) => slotTeam(ev, id))).toEqual(['EAG', 'KIN', 'HAW', 'TIT']);
    const eagles = qualOf(ev, 'grp', 'EAG');
    expect(eagles?.targets).toHaveLength(2);
    expect(targetOf(eagles, 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical', slotIds: [] });
    expect(targetOf(eagles, 'plate')).toMatchObject({ state: 'qualified', certainty: 'mathematical', slotIds: ['pA3'] });
    expect(eagles).toMatchObject({ state: 'qualified', certainty: 'mathematical', targetStageId: 'plate', slotIds: ['pA3'] });
    expect(eagles?.explanation).toContain('Eagles are out of the Knockouts but have qualified for the Plate');
    const tigers = qualOf(ev, 'grp', 'TIG');
    expect(targetOf(tigers, 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical', slotIds: ['sA1'] });
    expect(targetOf(tigers, 'plate')).toMatchObject({ state: 'eliminated' });
    expect(tigers).toMatchObject({ state: 'qualified', targetStageId: 'ko', slotIds: ['sA1'] });
    const grp = stageOf(ev, 'grp');
    expect(computeQualification(snapshot, 'grp', grp.tables, [])).toEqual(grp.qualification);
    expect(resolveStageSlots(snapshot, 'plate', ev.stages.slice(0, 2))).toEqual(stageOf(ev, 'plate').slots);
    expect(resolveFixtureTeams(ev, fixtureIn(snapshot, 'PSF1'))).toEqual({ a: 'EAG', b: 'TIT', frozen: false });
  });

  it('a Plate ordered last never produces the champion', () => {
    const results = { ...ALL_GROUPS, SF1: win('TIG'), SF2: win('LIO'), PSF1: win('EAG'), PSF2: win('KIN'), PFIN: win('EAG') };
    const teamsFor = {
      SF1: ['TIG', 'ROY'],
      SF2: ['BUL', 'LIO'],
      FIN: ['TIG', 'LIO'],
      PSF1: ['EAG', 'TIT'],
      PSF2: ['KIN', 'HAW'],
      PFIN: ['EAG', 'KIN'],
    } as const;
    const opts = { extraStages: [plateStage(PLATE_THIRD_FOURTH)], extraSlots: plateSlots(), extraFixtures: plateFixtures(), teamsFor };
    const undecided = evaluateTournament(deepFreeze(cup({ ...opts, results })));
    expect(slotTeam(undecided, 'pW1')).toBe('EAG');
    expect(undecided.champion).toBeNull();
    const decided = evaluateTournament(deepFreeze(cup({ ...opts, results: { ...results, FIN: win('LIO') } })));
    expect(decided.champion).toEqual({ teamIds: ['LIO'], basis: 'final', fixtureId: 'FIN' });
  });

  const LEVEL_THIRD: Readonly<Record<string, Res>> = {
    fA1: win('TIG', 5),
    fA2: { nr: true },
    fA3: win('TIG', 20),
    fA4: win('LIO', 10),
    fA5: win('TIG', 20),
    fA6: win('LIO', 10),
    ...RESULTS_B,
  };

  it('a level pair at 3rd/4th is provisional with only the Cup downstream', () => {
    const ev = evaluateTournament(deepFreeze(cup({ results: LEVEL_THIRD })));
    const table = tableOf(ev, 'grp', 'pA');
    expect(table.rows.filter((r) => r.teamId === 'EAG' || r.teamId === 'HAW').map((r) => [r.position, r.sharedPosition])).toEqual([
      [3, true],
      [3, true],
    ]);
    expect(table.unresolvedTies).toEqual([]);
    expect(table.provisionalTies.map((g) => sortedIds(g))).toContainEqual(['EAG', 'HAW']);
  });

  it('the same pair straddles the Plate boundary (only 3rd goes to the Plate) and needs a decision until resolved', () => {
    const plateThird: QualificationRule = { kind: 'top_per_pool', sourceStageId: 'grp', count: 1, fromPosition: 3 };
    const slots = [mkSlot('pA3', 'plate', 0, 'A3', posSrc('pA', 3)), mkSlot('pB3', 'plate', 1, 'B3', posSrc('pB', 3))];
    const open = evaluateTournament(deepFreeze(cup({ results: LEVEL_THIRD, extraStages: [plateStage(plateThird)], extraSlots: slots })));
    expect(tableOf(open, 'grp', 'pA').unresolvedTies.map((g) => sortedIds(g))).toEqual([['EAG', 'HAW']]);
    expect(slotOf(open, 'pA3')?.status).toBe('provisional');
    const resolved = evaluateTournament(
      deepFreeze(
        cup({
          results: LEVEL_THIRD,
          extraStages: [plateStage(plateThird)],
          extraSlots: slots,
          overrides: [tieRes('ov-tie', 'grp', 'pA', ['HAW', 'EAG'])],
        }),
      ),
    );
    expect(tableOf(resolved, 'grp', 'pA').unresolvedTies).toEqual([]);
    expect(slotOf(resolved, 'pA3')).toMatchObject({ teamId: 'HAW', status: 'final' });
  });

  it('the §98 "decision required" sentence names both level teams and the slot', () => {
    const plateThird: QualificationRule = { kind: 'top_per_pool', sourceStageId: 'grp', count: 1, fromPosition: 3 };
    const slots = [mkSlot('pA3', 'plate', 0, 'A3', posSrc('pA', 3)), mkSlot('pB3', 'plate', 1, 'B3', posSrc('pB', 3))];
    const ev = evaluateTournament(deepFreeze(cup({ results: LEVEL_THIRD, extraStages: [plateStage(plateThird)], extraSlots: slots })));
    const texts = [qualOf(ev, 'grp', 'EAG')?.explanation, qualOf(ev, 'grp', 'HAW')?.explanation, slotOf(ev, 'pA3')?.explanation].join(' | ');
    expect(texts).toMatch(/(Eagles and Hawks|Hawks and Eagles) are level for A3: organizer decision required/);
    expect(qualOf(ev, 'grp', 'EAG')?.explanation).not.toMatch(/have (mathematically )?qualified for the Plate/);
  });
});

describe('direct entries and manual slots', () => {
  it('direct entries are final manual slots and are not group-stage entrants', () => {
    const koWithDirect = [
      mkSlot('sA1', 'ko', 0, 'A1', posSrc('pA', 1), 'entry', 1),
      mkSlot('sB1', 'ko', 1, 'B1', posSrc('pB', 1), 'entry', 2),
      mkSlot('sD1', 'ko', 2, 'Panthers', { kind: 'manual', teamId: 'PAN' }, 'entry', 3),
      mkSlot('sD2', 'ko', 3, 'Wolves', { kind: 'manual', teamId: 'WOL' }, 'entry', 4),
      ...koSlots().filter((s) => s.role === 'progression'),
    ];
    const fixtures = koFixtures().map((f) =>
      f.id === 'SF1' ? { ...f, sideB: S('sD2') } : f.id === 'SF2' ? { ...f, sideB: S('sD1') } : f,
    );
    const snapshot = deepFreeze(
      cup({
        results: ALL_GROUPS,
        koEntryRules: [TOP_ONE, { kind: 'direct_entry', teamIds: ['PAN', 'WOL'] }],
        koSlots: koWithDirect,
        koFixtures: fixtures,
        extraTeams: [teamView('PAN'), teamView('WOL')],
      }),
    );
    const ev = evaluateTournament(snapshot);
    expect(slotOf(ev, 'sD1')).toMatchObject({ teamId: 'PAN', status: 'final' });
    expect(slotOf(ev, 'sD2')).toMatchObject({ teamId: 'WOL', status: 'final' });
    const groupEntrants = stageEntrants(snapshot, 'grp');
    expect(sortedIds(groupEntrants.map((s) => (s.kind === 'team' ? s.teamId : `slot:${s.slotId}`)))).toEqual(sortedIds([...POOL_A, ...POOL_B]));
    expect(stageEntrants(snapshot, 'ko')).toEqual([S('sA1'), S('sB1'), S('sD1'), S('sD2')]);
    const qualified = stageOf(ev, 'grp').qualification.map((q) => q.teamId);
    expect(qualified).not.toContain('PAN');
    expect(qualified).not.toContain('WOL');
    expect(resolveFixtureTeams(ev, fixtureIn(snapshot, 'SF2'))).toEqual({ a: 'BUL', b: 'PAN', frozen: false });
    expect(targetOf(qualOf(ev, 'grp', 'LIO'), 'ko')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
  });

  const wildcardCup = (overrides: readonly TournamentOverride[]) =>
    cup({
      results: ALL_GROUPS,
      koEntryRules: [TOP_ONE, { kind: 'manual', count: 1, label: 'Wildcard' }],
      koSlots: [
        mkSlot('sA1', 'ko', 0, 'A1', posSrc('pA', 1)),
        mkSlot('sB1', 'ko', 1, 'B1', posSrc('pB', 1)),
        mkSlot('sWC', 'ko', 2, 'Wildcard', { kind: 'manual', teamId: null }),
      ],
      koFixtures: [],
      overrides,
    });

  it('an unfilled manual slot is pending, a slot assignment fills it, and revoking it empties it again', () => {
    const empty = evaluateTournament(deepFreeze(wildcardCup([])));
    expect(slotOf(empty, 'sWC')).toMatchObject({ teamId: null, status: 'pending', viaOverride: false });
    const filled = evaluateTournament(deepFreeze(wildcardCup([slotAssign('ov-wc', 'sWC', 'EAG')])));
    expect(slotOf(filled, 'sWC')).toMatchObject({ teamId: 'EAG', status: 'final', viaOverride: true });
    const eagles = qualOf(filled, 'grp', 'EAG');
    expect(targetOf(eagles, 'ko')).toMatchObject({ state: 'qualified', certainty: 'manual', slotIds: ['sWC'] });
    expect(eagles?.override?.id).toBe('ov-wc');
    expect(eagles?.explanation).toContain('Manual Override');
    const revoked = evaluateTournament(deepFreeze(wildcardCup([slotAssign('ov-wc', 'sWC', 'EAG', NOW)])));
    expect(slotOf(revoked, 'sWC')).toMatchObject({ teamId: null, status: 'pending', viaOverride: false });
  });

  it('pinning a pool winner into the wildcard slot moves the next team up into A1', () => {
    const ev = evaluateTournament(deepFreeze(wildcardCup([slotAssign('ov-wc', 'sWC', 'TIG')])));
    expect(slotTeam(ev, 'sWC')).toBe('TIG');
    expect(slotTeam(ev, 'sA1')).toBe('LIO');
    expect(entryTeams(ev, 'ko', wildcardCup([]).slots).filter((t) => t === 'TIG')).toHaveLength(1);
  });

  it('two active slot assignments for one slot: the most recently created wins whatever the array order', () => {
    const older: TournamentOverride = { ...slotAssign('ov-old', 'sWC', 'EAG'), createdAt: '2026-04-10T10:00:00.000Z' };
    const newer: TournamentOverride = { ...slotAssign('ov-new', 'sWC', 'HAW'), createdAt: '2026-04-12T10:00:00.000Z' };
    for (const overrides of [
      [older, newer],
      [newer, older],
    ]) {
      const ev = evaluateTournament(deepFreeze(wildcardCup(overrides)));
      expect(slotOf(ev, 'sWC')).toMatchObject({ teamId: 'HAW', viaOverride: true, status: 'final' });
      expect(qualOf(ev, 'grp', 'HAW')?.override?.id).toBe('ov-new');
      expect(entryTeams(ev, 'ko', wildcardCup([]).slots)).not.toContain('EAG');
    }
  });

  it('a slot assignment outranks a qualify override naming the same slot (§6 precedence 3 over 4)', () => {
    const ev = evaluateTournament(
      deepFreeze(wildcardCup([qualOverride('ov-q', 'ko', 'EAG', 'qualify', 'sWC', 'Fair play award'), slotAssign('ov-s', 'sWC', 'HAW')])),
    );
    expect(slotOf(ev, 'sWC')).toMatchObject({ teamId: 'HAW', viaOverride: true, status: 'final' });
    expect(qualOf(ev, 'grp', 'HAW')).toMatchObject({ state: 'qualified', certainty: 'manual' });
  });
});

describe('qualification overrides', () => {
  const REASON = 'Lions fielded an ineligible player';

  it('qualify places the team in the slot, marks it manual and displaces the automatic occupant', () => {
    const snapshot = cup({ results: ALL_GROUPS, overrides: [qualOverride('ov-q', 'ko', 'EAG', 'qualify', 'sA2', REASON)] });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(slotOf(ev, 'sA2')).toMatchObject({ teamId: 'EAG', viaOverride: true, status: 'final' });
    expect(slotTeam(ev, 'sA1')).toBe('TIG');
    expect(entryTeams(ev, 'ko', snapshot.slots)).not.toContain('LIO');
    const eagles = qualOf(ev, 'grp', 'EAG');
    expect(eagles).toMatchObject({ state: 'qualified', certainty: 'manual', slotIds: ['sA2'] });
    expect(eagles?.override?.id).toBe('ov-q');
    expect(eagles?.explanation).toContain('Manual Override');
    expect(eagles?.explanation).toContain(REASON);
    const lions = qualOf(ev, 'grp', 'LIO');
    expect(targetOf(lions, 'ko')?.state).not.toBe('qualified');
    expect(lions?.slotIds).toEqual([]);
    expect(rowOf(ev, 'grp', 'pA', 'LIO')?.position).toBe(2);
  });

  it('qualifying a team that already holds another slot keeps it in exactly one entry slot', () => {
    const snapshot = cup({ results: ALL_GROUPS, overrides: [qualOverride('ov-q', 'ko', 'TIG', 'qualify', 'sB2', REASON)] });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(slotTeam(ev, 'sB2')).toBe('TIG');
    expect(slotTeam(ev, 'sA1')).toBe('LIO');
    expect(slotTeam(ev, 'sA2')).toBe('EAG');
    const teams = entryTeams(ev, 'ko', snapshot.slots);
    expect(new Set(teams).size).toBe(teams.length);
    expect(teams).not.toContain('ROY');
  });

  it('eliminate removes the team from every automatic slot and the next team moves up', () => {
    const snapshot = cup({ results: ALL_GROUPS, overrides: [qualOverride('ov-e', 'ko', 'TIG', 'eliminate', null, 'Code of conduct breach')] });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(slotTeam(ev, 'sA1')).toBe('LIO');
    expect(slotTeam(ev, 'sA2')).toBe('EAG');
    const tigers = qualOf(ev, 'grp', 'TIG');
    expect(tigers).toMatchObject({ state: 'eliminated', certainty: 'manual', slotIds: [] });
    expect(tigers?.explanation).toContain('Manual Override');
    expect(tigers?.explanation).toContain('Code of conduct breach');
    expect(rowOf(ev, 'grp', 'pA', 'TIG')?.position).toBe(1);
  });

  it('reassign moves the team into the named slot', () => {
    const snapshot = cup({ results: ALL_GROUPS, overrides: [qualOverride('ov-r', 'ko', 'HAW', 'reassign', 'sB2', 'Committee decision')] });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(slotOf(ev, 'sB2')).toMatchObject({ teamId: 'HAW', viaOverride: true });
    const hawks = qualOf(ev, 'grp', 'HAW');
    expect(hawks).toMatchObject({ state: 'qualified', certainty: 'manual' });
    expect(hawks?.slotIds).toContain('sB2');
    expect(entryTeams(ev, 'ko', snapshot.slots)).not.toContain('ROY');
  });

  it('revoked overrides have no effect', () => {
    const snapshot = cup({
      results: ALL_GROUPS,
      overrides: [
        qualOverride('ov-q', 'ko', 'EAG', 'qualify', 'sA2', REASON, NOW),
        qualOverride('ov-e', 'ko', 'TIG', 'eliminate', null, 'Code of conduct breach', NOW),
      ],
    });
    const ev = evaluateTournament(deepFreeze(snapshot));
    expect(['sA1', 'sB1', 'sA2', 'sB2'].map((id) => slotOf(ev, id)?.teamId)).toEqual(['TIG', 'BUL', 'LIO', 'ROY']);
    expect(qualOf(ev, 'grp', 'TIG')).toMatchObject({ certainty: 'mathematical', override: null });
    expect(qualOf(ev, 'grp', 'EAG')).toMatchObject({ state: 'eliminated', certainty: 'mathematical', override: null });
  });
});

const KO_TEAMS = { SF1: ['TIG', 'ROY'], SF2: ['BUL', 'LIO'], FIN: ['TIG', 'LIO'] } as const;
const correctedFA1 = () => summaryOf('m-fA1', 'TIG', 'LIO', win('LIO', 20), 1);

describe('frozen knockout sides after a group correction', () => {
  it('a correction after the semifinals keeps SF1, SF2, the winners and the champion, and reports slot conflicts', () => {
    const snapshot = deepFreeze(
      cup({ results: { ...ALL_GROUPS, SF1: win('TIG'), SF2: win('LIO'), FIN: win('TIG') }, teamsFor: KO_TEAMS }),
    );
    const change: ProposedChange = { kind: 'match_result_change', matchId: 'm-fA1', summary: correctedFA1() };
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: 'sA1', beforeTeamId: 'TIG', afterTeamId: 'LIO', playedFixtureIds: ['SF1'] }),
        expect.objectContaining({ slotId: 'sA2', beforeTeamId: 'LIO', afterTeamId: 'TIG', playedFixtureIds: ['SF2'] }),
      ]),
    );
    expect(impact.slots.map((s) => s.slotId)).not.toContain('sW1');
    expect(impact.slots.map((s) => s.slotId)).not.toContain('sW2');
    expect(impact.requiresReason).toBe(true);
    expect(impact.requiresConfirmation).toBe(true);
    expect(impact.blocked).toBeNull();
    const after = applyChange(snapshot, change, ctx());
    const ev = evaluateTournament(after);
    expect(rowOf(ev, 'grp', 'pA', 'LIO')?.position).toBe(1);
    expect(slotTeam(ev, 'sA1')).toBe('LIO');
    expect(resolveFixtureTeams(ev, fixtureIn(after, 'SF1'))).toEqual({ a: 'TIG', b: 'ROY', frozen: true });
    expect(resolveFixtureTeams(ev, fixtureIn(after, 'SF2'))).toEqual({ a: 'BUL', b: 'LIO', frozen: true });
    expect(slotTeam(ev, 'sW1')).toBe('TIG');
    expect(slotTeam(ev, 'sW2')).toBe('LIO');
    expect(ev.champion).toEqual({ teamIds: ['TIG'], basis: 'final', fixtureId: 'FIN' });
  });

  it('a correction before the semifinals moves the unplayed SF sides with the slots', () => {
    const snapshot = deepFreeze(cup({ results: ALL_GROUPS }));
    const change: ProposedChange = { kind: 'match_result_change', matchId: 'm-fA1', summary: correctedFA1() };
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.slots).toEqual(
      expect.arrayContaining([expect.objectContaining({ slotId: 'sA1', beforeTeamId: 'TIG', afterTeamId: 'LIO', playedFixtureIds: [] })]),
    );
    const after = applyChange(snapshot, change, ctx());
    const ev = evaluateTournament(after);
    expect(resolveFixtureTeams(ev, fixtureIn(after, 'SF1'))).toEqual({ a: 'LIO', b: 'ROY', frozen: false });
    expect(resolveFixtureTeams(ev, fixtureIn(after, 'SF2'))).toEqual({ a: 'BUL', b: 'TIG', frozen: false });
  });
});

describe('champion resolution', () => {
  const withFinal = (finalRes: Res, knockout: Partial<KnockoutConfig> = {}, overrides: readonly TournamentOverride[] = []) =>
    cup({ results: { ...ALL_GROUPS, SF1: win('TIG'), SF2: win('LIO'), FIN: finalRes }, teamsFor: KO_TEAMS, knockout, overrides });

  it('the winner of the final is champion and resolveChampion agrees with the evaluation', () => {
    const snapshot = deepFreeze(withFinal(win('LIO')));
    const ev = evaluateTournament(snapshot);
    expect(ev.champion).toEqual({ teamIds: ['LIO'], basis: 'final', fixtureId: 'FIN' });
    expect(resolveChampion(snapshot, ev.stages)).toEqual(ev.champion);
    expect(slotTeam(ev, 'sW1')).toBe('TIG');
  });

  it('a tied final decided by a super over goes to the decider winner', () => {
    expect(evaluateTournament(deepFreeze(withFinal({ tie: true, decider: 'LIO' }))).champion).toEqual({
      teamIds: ['LIO'],
      basis: 'final',
      fixtureId: 'FIN',
    });
  });

  it('a tie still undecided after the super over has no champion until the organizer decides', () => {
    expect(evaluateTournament(deepFreeze(withFinal({ tie: true }, { tiedMatch: 'super_over' }))).champion).toBeNull();
    const decided = evaluateTournament(deepFreeze(withFinal({ tie: true }, { tiedMatch: 'super_over' }, [championOv('ov-c', ['LIO'])])));
    expect(decided.champion).toEqual({ teamIds: ['LIO'], basis: 'manual', fixtureId: null });
  });

  it('an undecided tie with higher_seed goes to the better entry seed (A1 seed 1 beats A2 seed 3)', () => {
    expect(evaluateTournament(deepFreeze(withFinal({ tie: true }, { tiedMatch: 'higher_seed' }))).champion?.teamIds).toEqual(['TIG']);
  });

  it('a washed-out final with noResult shared gives joint champions', () => {
    const champion = evaluateTournament(deepFreeze(withFinal({ nr: true }, { noResult: 'shared' }))).champion;
    expect(champion?.basis).toBe('shared');
    expect(sortedIds(champion?.teamIds ?? [])).toEqual(['LIO', 'TIG']);
  });

  it('an abandoned final with noResult higher_seed goes to the higher seed', () => {
    expect(evaluateTournament(deepFreeze(withFinal({ abandoned: true }, { noResult: 'higher_seed' }))).champion?.teamIds).toEqual(['TIG']);
  });

  it('a washed-out final with noResult organizer waits for a champion override', () => {
    expect(evaluateTournament(deepFreeze(withFinal({ nr: true }, { noResult: 'organizer' }))).champion).toBeNull();
  });

  it('a champion override naming two teams beats the computed champion; a revoked one is ignored', () => {
    const joint = evaluateTournament(deepFreeze(withFinal(win('TIG'), {}, [championOv('ov-c', ['LIO', 'TIG'])]))).champion;
    expect(['manual', 'shared']).toContain(joint?.basis);
    expect(sortedIds(joint?.teamIds ?? [])).toEqual(['LIO', 'TIG']);
    const revoked = evaluateTournament(deepFreeze(withFinal(win('TIG'), {}, [championOv('ov-c', ['LIO'], NOW)]))).champion;
    expect(revoked).toEqual({ teamIds: ['TIG'], basis: 'final', fixtureId: 'FIN' });
  });

  const leagueSnapshot = (results: Readonly<Record<string, Res>>, overrides: readonly TournamentOverride[] = []) => {
    const teams = ['TIG', 'LIO', 'EAG', 'HAW'];
    const fixtures = allPairs(4).map(([i, j], k) => mkFixture(pairId(teams[i], teams[j]), 'lg', 'pL', k + 1, T(teams[i]), T(teams[j])));
    const played = play(fixtures, results);
    return snap({
      teams: teams.map((id) => teamView(id)),
      stages: [mkStage('lg', 'League', 'league', 0, { decidesChampion: true })],
      pools: [mkPool('pL', 'lg', 'League', 0)],
      poolEntries: teams.map((id) => mkEntry('lg', 'pL', T(id))),
      fixtures: played.fixtures,
      summaries: played.summaries,
      overrides,
    });
  };

  const LEAGUE_RESULTS: Readonly<Record<string, Res>> = {
    [pairId('TIG', 'LIO')]: win('TIG'),
    [pairId('TIG', 'EAG')]: win('TIG'),
    [pairId('TIG', 'HAW')]: win('TIG'),
    [pairId('LIO', 'EAG')]: win('LIO'),
    [pairId('LIO', 'HAW')]: win('LIO'),
    [pairId('EAG', 'HAW')]: win('EAG'),
  };

  it('a league is won by the top of the complete table and has no champion while incomplete', () => {
    const incomplete = { ...LEAGUE_RESULTS };
    delete incomplete[pairId('EAG', 'HAW')];
    expect(evaluateTournament(deepFreeze(leagueSnapshot(incomplete))).champion).toBeNull();
    expect(evaluateTournament(deepFreeze(leagueSnapshot(LEAGUE_RESULTS))).champion).toEqual({
      teamIds: ['TIG'],
      basis: 'league_table',
      fixtureId: null,
    });
  });

  it('two teams level on everything at the top of a complete league: no champion until the tie is resolved', () => {
    const level: Record<string, Res> = {
      [pairId('TIG', 'LIO')]: { nr: true },
      [pairId('TIG', 'EAG')]: win('TIG'),
      [pairId('TIG', 'HAW')]: win('TIG'),
      [pairId('LIO', 'EAG')]: win('LIO'),
      [pairId('LIO', 'HAW')]: win('LIO'),
      [pairId('EAG', 'HAW')]: win('EAG', 10),
    };
    const open = evaluateTournament(deepFreeze(leagueSnapshot(level)));
    expect(tableOf(open, 'lg', 'pL').rows.slice(0, 2).map((r) => [r.position, r.sharedPosition])).toEqual([
      [1, true],
      [1, true],
    ]);
    expect(open.champion).toBeNull();
    const resolved = evaluateTournament(deepFreeze(leagueSnapshot(level, [tieRes('ov-tie', 'lg', 'pL', ['LIO', 'TIG'])])));
    expect(resolved.champion).toEqual({ teamIds: ['LIO'], basis: 'league_table', fixtureId: null });
  });
});

describe('what-if', () => {
  const PARTIAL_A = { fA1: win('TIG', 20), fA2: win('EAG', 10), fA3: win('TIG', 30), fA4: win('LIO', 40) };

  const tablesByKey = (tables: readonly StandingsTable[]) => new Map(tables.map((t) => [`${t.stageId}|${t.poolId}`, t]));

  it('never mutates a deep-frozen snapshot and reports "before" exactly as evaluateTournament does', () => {
    const snapshot = deepFreeze(cup({ results: { ...PARTIAL_A, ...RESULTS_B } }));
    const frozenJson = JSON.stringify(snapshot);
    const baseline = evaluateTournament(snapshot);
    const hypotheticals: HypotheticalResult[] = [
      {
        fixtureId: 'fA5',
        outcome: 'side_b_win',
        score: {
          battingFirst: 'side_a',
          firstInnings: { runs: 120, balls: 120, allOut: false },
          secondInnings: { runs: 121, balls: 90, allOut: false },
        },
      },
      { fixtureId: 'fA6', outcome: 'tie', tieWinner: 'side_b', score: null },
      { fixtureId: 'fB1', outcome: 'side_b_win', score: null },
    ];
    const result = simulate(snapshot, hypotheticals);
    expect(JSON.stringify(snapshot)).toBe(frozenJson);
    expect(evaluateTournament(snapshot)).toEqual(baseline);
    const baselineTables = tablesByKey(baseline.stages.flatMap((s) => s.tables));
    for (const table of result.before.tables) {
      expect(table).toEqual(baselineTables.get(`${table.stageId}|${table.poolId}`));
    }
    const after = tablesByKey(result.after.tables);
    const poolA = after.get('grp|pA');
    expect(poolA?.rows.find((r) => r.teamId === 'HAW')).toMatchObject({ points: 2, won: 1 });
    expect(poolA?.rows.find((r) => r.teamId === 'EAG')).toMatchObject({ points: 4, won: 2 });
    expect(poolA?.rows.find((r) => r.teamId === 'LIO')).toMatchObject({ points: 2, lost: 2 });
    expect(poolA?.rows.find((r) => r.teamId === 'HAW')?.nrr).not.toBe(baselineTables.get('grp|pA')?.rows.find((r) => r.teamId === 'HAW')?.nrr);
    expect(after.get('grp|pB')?.rows.find((r) => r.teamId === 'BUL')).toMatchObject({ points: 6, won: 3 });
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(simulate(snapshot, hypotheticals)).toEqual(result);
  });

  it('hypotheticals that finish the group make every status mathematical', () => {
    const snapshot = deepFreeze(cup({ results: { ...PARTIAL_A, ...RESULTS_B } }));
    const result = simulate(snapshot, [
      { fixtureId: 'fA5', outcome: 'side_a_win', score: null },
      { fixtureId: 'fA6', outcome: 'side_a_win', score: null },
    ]);
    const groupAfter = result.after.qualification.filter((q) => q.stageId === 'grp');
    expect(groupAfter).toHaveLength(8);
    for (const q of groupAfter) expect(q.certainty).toBe('mathematical');
    const lionsAfter = groupAfter.find((q) => q.teamId === 'LIO');
    expect(lionsAfter?.state).toBe('qualified');
    const lionsBefore = result.before.qualification.find((q) => q.teamId === 'LIO');
    expect(lionsBefore?.certainty).toBe('provisional');
    expect(result.qualificationChanges.some((c) => c.teamId === 'EAG' && c.after === 'eliminated')).toBe(true);
  });

  it('a group hypothetical re-resolves the knockout slots that later hypotheticals then use', () => {
    const results = { fA2: win('EAG', 10), fA3: win('TIG', 30), fA4: win('LIO', 40), fA5: win('TIG', 50), fA6: win('LIO', 15), ...RESULTS_B };
    const snapshot = deepFreeze(cup({ results }));
    const before = evaluateTournament(snapshot);
    expect(slotTeam(before, 'sA1')).toBe('TIG');
    const result = simulate(snapshot, [
      { fixtureId: 'fA1', outcome: 'side_b_win', score: null },
      { fixtureId: 'SF1', outcome: 'side_a_win', score: null },
      { fixtureId: 'SF2', outcome: 'side_b_win', score: null },
    ]);
    expect(result.slotChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: 'sA1', beforeTeamId: 'TIG', afterTeamId: 'LIO' }),
        expect.objectContaining({ slotId: 'sA2', beforeTeamId: 'LIO', afterTeamId: 'TIG' }),
        expect.objectContaining({ slotId: 'sW1', beforeTeamId: null, afterTeamId: 'LIO' }),
        expect.objectContaining({ slotId: 'sW2', beforeTeamId: null, afterTeamId: 'TIG' }),
      ]),
    );
    expect(result.narrative.join(' ')).toContain('Lions');
  });

  it('a hypothetical on a fixture that already has a terminal match is ignored and reported', () => {
    const snapshot = deepFreeze(cup({ results: ALL_GROUPS }));
    const result = simulate(snapshot, [{ fixtureId: 'fA1', outcome: 'side_b_win', score: null }]);
    expect(result.after.tables).toEqual(result.before.tables);
    expect(result.after.qualification).toEqual(result.before.qualification);
    expect(result.standingChanges).toEqual([]);
    expect(result.qualificationChanges).toEqual([]);
    expect(result.slotChanges).toEqual([]);
    expect(result.narrative.length).toBeGreaterThan(0);
  });

  it('a final whose sides are still unknown is skipped without throwing', () => {
    const snapshot = deepFreeze(cup({ results: ALL_GROUPS }));
    const result = simulate(snapshot, [{ fixtureId: 'FIN', outcome: 'side_a_win', score: null }]);
    expect(result.slotChanges).toEqual([]);
    expect(result.narrative.length).toBeGreaterThan(0);
  });
});

interface Line {
  readonly position: number;
  readonly points: number;
  readonly nrr: number | null;
}

const nrrEq = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);
const sameLine = (a: Line | null, b: Line | null) =>
  a === null || b === null ? a === b : a.position === b.position && a.points === b.points && nrrEq(a.nrr, b.nrr);
const fmt = (l: Line | null) => (l ? `#${l.position} ${l.points}pts nrr ${l.nrr}` : 'none');

function poolLines(ev: TournamentEvaluation): Map<string, Line> {
  const lines = new Map<string, Line>();
  for (const stage of ev.stages) {
    for (const table of stage.tables) {
      if (table.poolId === null) continue;
      for (const row of table.rows) {
        if (row.teamId) lines.set(`${stage.stageId}|${table.poolId}|${row.teamId}`, { position: row.position, points: row.points, nrr: row.nrr });
      }
    }
  }
  return lines;
}

function qualStates(ev: TournamentEvaluation): Map<string, { readonly primary: string; readonly targets: string }> {
  const out = new Map<string, { readonly primary: string; readonly targets: string }>();
  for (const stage of ev.stages) {
    for (const q of stage.qualification) {
      const targets = [...q.targets].map((t) => `${t.stageId}:${t.state}`).sort().join(',');
      out.set(q.teamId, { primary: q.state, targets });
    }
  }
  return out;
}

function slotTeams(ev: TournamentEvaluation): Map<string, string | null> {
  return new Map(ev.stages.flatMap((s) => s.slots).map((s) => [s.slotId, s.teamId]));
}

function consistencyProblems(impact: ImpactSummary, evB: TournamentEvaluation, evA: TournamentEvaluation): string[] {
  const problems: string[] = [];
  const lb = poolLines(evB);
  const la = poolLines(evA);
  const listed = new Map(impact.standings.filter((c) => c.poolId !== null).map((c) => [`${c.stageId}|${c.poolId}|${c.teamId}`, c]));
  const keys = new Set([...lb.keys(), ...la.keys()]);
  let standingsChanged = false;
  for (const key of keys) {
    const b = lb.get(key) ?? null;
    const a = la.get(key) ?? null;
    if (sameLine(b, a)) continue;
    standingsChanged = true;
    const entry = listed.get(key);
    if (!entry) {
      problems.push(`missing standing change ${key}: ${fmt(b)} -> ${fmt(a)}`);
    } else if (!sameLine(entry.before, b) || !sameLine(entry.after, a)) {
      problems.push(`wrong standing change ${key}: reported ${fmt(entry.before)} -> ${fmt(entry.after)}, evaluations ${fmt(b)} -> ${fmt(a)}`);
    }
  }
  for (const key of listed.keys()) {
    if (sameLine(lb.get(key) ?? null, la.get(key) ?? null)) problems.push(`standing change listed for unchanged ${key}`);
  }
  const qb = qualStates(evB);
  const qa = qualStates(evA);
  const primaryChanged = new Set([...qb.keys()].filter((t) => qa.has(t) && qa.get(t)?.primary !== qb.get(t)?.primary));
  const anyChanged = new Set(
    [...new Set([...qb.keys(), ...qa.keys()])].filter(
      (t) => qa.get(t)?.primary !== qb.get(t)?.primary || qa.get(t)?.targets !== qb.get(t)?.targets,
    ),
  );
  const impactTeams = new Set(impact.qualification.filter((c) => c.before !== c.after).map((c) => c.teamId));
  for (const t of primaryChanged) if (!impactTeams.has(t)) problems.push(`missing qualification change for ${t}: ${qb.get(t)?.primary} -> ${qa.get(t)?.primary}`);
  for (const t of impactTeams) if (!anyChanged.has(t)) problems.push(`qualification change listed for unchanged ${t}`);
  const sb = slotTeams(evB);
  const sa = slotTeams(evA);
  const listedSlots = new Map(impact.slots.map((s) => [s.slotId, s]));
  let slotsChanged = false;
  for (const [slotId, before] of sb) {
    if (!sa.has(slotId)) continue;
    const after = sa.get(slotId) ?? null;
    if (before === after) continue;
    slotsChanged = true;
    const entry = listedSlots.get(slotId);
    if (!entry) problems.push(`missing slot change ${slotId}: ${before} -> ${after}`);
    else if (entry.beforeTeamId !== before || entry.afterTeamId !== after) {
      problems.push(`wrong slot change ${slotId}: reported ${entry.beforeTeamId} -> ${entry.afterTeamId}, evaluations ${before} -> ${after}`);
    }
  }
  for (const [slotId, entry] of listedSlots) {
    if (sb.has(slotId) && sa.has(slotId) && sb.get(slotId) === sa.get(slotId)) problems.push(`slot change listed for unchanged ${slotId}`);
    if (entry.beforeTeamId === entry.afterTeamId) problems.push(`slot change ${slotId} has the same occupant before and after`);
  }
  const nrrChangedBoth = [...keys].some((k) => lb.has(k) && la.has(k) && !nrrEq(lb.get(k)?.nrr ?? null, la.get(k)?.nrr ?? null));
  const nrrChangedAny = [...keys].some((k) => !nrrEq(lb.get(k)?.nrr ?? null, la.get(k)?.nrr ?? null));
  if (nrrChangedBoth && !impact.nrrChanged) problems.push('nrrChanged is false although a NRR value changed');
  if (impact.nrrChanged && !nrrChangedAny) problems.push('nrrChanged is true although no NRR value changed');
  if ((standingsChanged || primaryChanged.size > 0 || nrrChangedBoth) && !impact.requiresConfirmation) {
    problems.push('requiresConfirmation is false although standings, qualification or NRR changed');
  }
  if ((standingsChanged || primaryChanged.size > 0 || nrrChangedBoth || slotsChanged) && !['warning', 'destructive'].includes(impact.severity)) {
    problems.push(`severity ${impact.severity} although standings, qualification, NRR or slots changed`);
  }
  return problems;
}

const MID_RESULTS: Readonly<Record<string, Res>> = {
  fA1: win('TIG', 20),
  fA2: win('EAG', 10),
  fA3: win('TIG', 30),
  fA4: win('LIO', 40),
  fB1: win('BUL', 25),
  fB2: win('KIN', 5),
  fB3: win('BUL', 35),
};

const midCup = (extra: CupOpts = {}) => cup({ results: MID_RESULTS, ...extra });

const moveDrafts = (): FixtureDraft[] =>
  [
    mkFixture('mv1', 'grp', 'pB', 16, T('HAW'), T('BUL')),
    mkFixture('mv2', 'grp', 'pB', 17, T('ROY'), T('HAW')),
    mkFixture('mv3', 'grp', 'pB', 18, T('HAW'), T('KIN')),
    mkFixture('mv4', 'grp', 'pB', 19, T('TIT'), T('HAW')),
  ].map(toDraft);

const koStageIn = (s: TournamentSnapshot): Stage => {
  const found = s.stages.find((x) => x.id === 'ko');
  if (!found) throw new Error('no ko stage');
  return found;
};

type ChangeCase = readonly [string, () => TournamentSnapshot, (s: TournamentSnapshot) => ProposedChange];

const CHANGE_CASES: readonly ChangeCase[] = [
  [
    'pool_move',
    () => midCup(),
    () => ({ kind: 'pool_move', stageId: 'grp', member: T('HAW'), toPoolId: 'pB', removeFixtureIds: ['fA5'], addFixtures: moveDrafts() }),
  ],
  ['pool_swap', () => midCup(), () => ({ kind: 'pool_swap', stageId: 'grp', memberA: T('HAW'), memberB: T('TIT') })],
  [
    'team_replace transfer_to_replacement',
    () => midCup({ extraTeams: [teamView('PAN')] }),
    () => ({ kind: 'team_replace', outTeamId: 'EAG', inTeamId: 'PAN', inSeed: null, priorResults: 'transfer_to_replacement' }),
  ],
  [
    'team_replace keep_for_opponents',
    () => midCup({ extraTeams: [teamView('PAN')] }),
    () => ({ kind: 'team_replace', outTeamId: 'EAG', inTeamId: 'PAN', inSeed: null, priorResults: 'keep_for_opponents' }),
  ],
  [
    'team_replace expunge',
    () => midCup({ extraTeams: [teamView('PAN')] }),
    () => ({ kind: 'team_replace', outTeamId: 'EAG', inTeamId: 'PAN', inSeed: 9, priorResults: 'expunge' }),
  ],
  ['team_withdraw walkover', () => midCup(), () => ({ kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: false })],
  ['team_withdraw cancel and expunge', () => midCup(), () => ({ kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'cancel', expungeResults: true })],
  [
    'pools_replace',
    () => midCup(),
    () => ({
      kind: 'pools_replace',
      stageId: 'grp',
      pools: [
        { poolId: 'pA', members: [T('TIG'), T('ROY'), T('EAG'), T('HAW')] },
        { poolId: 'pB', members: [T('BUL'), T('LIO'), T('KIN'), T('TIT')] },
      ],
      seed: 847291,
    }),
  ],
  [
    'team_seeds_change',
    () => midCup(),
    () => ({
      kind: 'team_seeds_change',
      seeds: [
        { teamId: 'TIG', seed: 1 },
        { teamId: 'BUL', seed: 2 },
        { teamId: 'LIO', seed: 3 },
        { teamId: 'ROY', seed: 4 },
      ],
    }),
  ],
  [
    'stage_upsert of a future stage',
    () => midCup(),
    (s) => ({ kind: 'stage_upsert', stage: { ...koStageIn(s), name: 'Playoffs' }, pools: [], slots: s.slots.filter((x) => x.stageId === 'ko') }),
  ],
  ['stage_delete', () => midCup(), () => ({ kind: 'stage_delete', stageId: 'ko' })],
  ['fixture_add', () => midCup(), () => ({ kind: 'fixture_add', fixture: toDraft(mkFixture('fA7', 'grp', 'pA', 16, T('LIO'), T('TIG'), { leg: 2 })) })],
  ['fixture_update date', () => midCup(), () => ({ kind: 'fixture_update', fixtureId: 'fA5', patch: { scheduledDate: '2026-05-10', scheduledTime: '14:00' } })],
  ['fixture_update cancel', () => midCup(), () => ({ kind: 'fixture_update', fixtureId: 'fA5', patch: { status: 'cancelled' } })],
  ['fixture_delete unplayed', () => midCup(), () => ({ kind: 'fixture_delete', fixtureId: 'fA6' })],
  ['fixture_delete completed', () => midCup(), () => ({ kind: 'fixture_delete', fixtureId: 'fA1' })],
  [
    'fixtures_replace knockout re-draw',
    () => midCup(),
    () => ({
      kind: 'fixtures_replace',
      stageId: 'ko',
      poolId: null,
      fixtures: koFixtures(['SF1x', 'SF2x', 'FINx']).map(toDraft),
      slots: koSlots().filter((x) => x.role === 'progression'),
      seed: 99,
    }),
  ],
  ['match_result_change corrected', () => midCup(), () => ({ kind: 'match_result_change', matchId: 'm-fA1', summary: correctedFA1() })],
  ['match_result_change reopened', () => midCup(), () => ({ kind: 'match_result_change', matchId: 'm-fA1', summary: null })],
  ['rules_change tournament points', () => midCup(), () => ({ kind: 'rules_change', stageId: null, pointsSystem: { ...DEFAULT_POINTS_SYSTEM, win: 3 } })],
  ['rules_change stage chain', () => midCup(), () => ({ kind: 'rules_change', stageId: 'grp', tieBreakers: ['points', 'wins', 'seed'] })],
  ['slot_change', () => midCup(), () => ({ kind: 'slot_change', slotId: 'sA2', source: posSrc('pA', 3) })],
  ['override_apply points_adjustment', () => midCup(), () => ({ kind: 'override_apply', override: pointsAdj('ov-new-adj', 'grp', 'pA', 'LIO', -3) })],
  [
    'override_apply eliminate',
    () => midCup(),
    () => ({ kind: 'override_apply', override: qualOverride('ov-new-elim', 'ko', 'TIG', 'eliminate', null, 'Ineligible player') }),
  ],
  [
    'override_revoke',
    () => midCup({ overrides: [pointsAdj('ov-adj-EAG', 'grp', 'pA', 'EAG', 2)] }),
    () => ({ kind: 'override_revoke', overrideId: 'ov-adj-EAG' }),
  ],
];

describe('planChange / applyPlan / computeImpact are one interpretation', () => {
  it('covers every ProposedChange kind', () => {
    const kinds = new Set(CHANGE_CASES.map(([, make, changeOf]) => changeOf(make()).kind));
    expect([...kinds].sort()).toEqual(
      [
        'pool_move',
        'pool_swap',
        'team_replace',
        'team_withdraw',
        'pools_replace',
        'team_seeds_change',
        'stage_upsert',
        'stage_delete',
        'fixture_add',
        'fixture_update',
        'fixture_delete',
        'fixtures_replace',
        'match_result_change',
        'rules_change',
        'slot_change',
        'override_apply',
        'override_revoke',
      ].sort(),
    );
  });

  it.each(CHANGE_CASES)('%s: preview == apply, nothing mutated, impact == diff of the two evaluations', (_label, make, changeOf) => {
    const snapshot = deepFreeze(make());
    const frozenJson = JSON.stringify(snapshot);
    const change = changeOf(snapshot);
    const plan = planChange(snapshot, change, ctx());
    expect(planChange(snapshot, change, ctx())).toEqual(plan);
    const after = applyPlan(snapshot, plan);
    expect(applyChange(snapshot, change, ctx())).toEqual(after);
    const impact = computeImpact(change, snapshot, ctx());
    expect(computeImpact(change, snapshot, ctx())).toEqual(impact);
    expect(JSON.stringify(snapshot)).toBe(frozenJson);
    expect(consistencyProblems(impact, evaluateTournament(snapshot), evaluateTournament(after))).toEqual([]);
    expect(impact.headline.length).toBeGreaterThan(0);
  });

  it('pool_move deletes exactly the listed unplayed fixture, inserts the drafts and keeps played fixtures in their pool', () => {
    const snapshot = deepFreeze(midCup());
    const change = CHANGE_CASES[0][2](snapshot);
    const plan = planChange(snapshot, change, ctx());
    expect(plan.fixtures.delete).toEqual(['fA5']);
    expect(plan.fixtures.insert.map((f) => [f.id, f.poolId])).toEqual([
      ['mv1', 'pB'],
      ['mv2', 'pB'],
      ['mv3', 'pB'],
      ['mv4', 'pB'],
    ]);
    const after = applyPlan(snapshot, plan);
    expect(after.poolEntries.find((e) => e.side.kind === 'team' && e.side.teamId === 'HAW')?.poolId).toBe('pB');
    expect(fixtureIn(after, 'fA2')).toMatchObject({ poolId: 'pA', matchId: 'm-fA2' });
    expect(fixtureIn(after, 'fA4')).toMatchObject({ poolId: 'pA', matchId: 'm-fA4' });
    const ev = evaluateTournament(after);
    expect(rowOf(ev, 'grp', 'pA', 'EAG')).toMatchObject({ played: 1, points: 0 });
    expect(rowOf(ev, 'grp', 'pA', 'LIO')).toMatchObject({ played: 1, points: 0 });
    expect(rowOf(ev, 'grp', 'pB', 'HAW')).toMatchObject({ played: 0, matchesRemaining: 4 });
    const impact = computeImpact(change, snapshot, ctx());
    expect(impact.fixtures.filter((f) => f.change === 'removed').map((f) => f.fixtureId)).toEqual(['fA5']);
    expect(sortedIds(impact.fixtures.filter((f) => f.change === 'created').map((f) => f.fixtureId))).toEqual(['mv1', 'mv2', 'mv3', 'mv4']);
  });

  it('team_withdraw with walkovers creates a real match_ended walkover and the withdrawn row never qualifies', () => {
    const snapshot = deepFreeze(midCup());
    const change: ProposedChange = { kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'walkover', expungeResults: false };
    const plan = planChange(snapshot, change, ctx());
    expect(plan.matchesToCreate).toHaveLength(1);
    expect(plan.matchesToCreate[0].fixtureId).toBe('fA5');
    expect(plan.matchesToCreate[0].events).toEqual([
      { kind: 'match_ended', outcome: expect.objectContaining({ type: 'walkover', winnerTeamId: 'TIG' }) },
    ]);
    expect(plan.tournamentTeams.upsert).toEqual([expect.objectContaining({ teamId: 'HAW', status: 'withdrawn' })]);
    const ev = evaluateTournament(applyPlan(snapshot, plan));
    expect(rowOf(ev, 'grp', 'pA', 'TIG')).toMatchObject({ won: 3, points: 6, matchesRemaining: 0 });
    expect(rowOf(ev, 'grp', 'pA', 'HAW')).toMatchObject({ membership: 'withdrawn' });
    expect(targetOf(qualOf(ev, 'grp', 'TIG'), 'ko')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(targetOf(qualOf(ev, 'grp', 'HAW'), 'ko')?.state).not.toBe('qualified');
    expect(entryTeams(ev, 'ko', snapshot.slots)).not.toContain('HAW');
  });

  it('stage_upsert with a third pool re-expands the knockout entry slots keeping ids by index and unique indexes', () => {
    const snapshot = deepFreeze(cup());
    const grp = snapshot.stages[0];
    const change: ProposedChange = {
      kind: 'stage_upsert',
      stage: grp,
      pools: [mkPool('pA', 'grp', 'Pool A', 0), mkPool('pB', 'grp', 'Pool B', 1), mkPool('pC', 'grp', 'Pool C', 2)],
      slots: [],
    };
    const after = applyChange(snapshot, change, ctx());
    const koSlotsAfter = after.slots.filter((s) => s.stageId === 'ko');
    const entries = koSlotsAfter.filter((s) => s.role === 'entry').sort((a, b) => a.index - b.index);
    expect(entries).toHaveLength(6);
    expect(entries.slice(0, 4).map((s) => s.id)).toEqual(['sA1', 'sB1', 'sA2', 'sB2']);
    expect(entries.map((s) => (s.source.kind === 'pool_position' ? `${s.source.poolId}:${s.source.position}` : s.source.kind))).toEqual([
      'pA:1',
      'pB:1',
      'pC:1',
      'pA:2',
      'pB:2',
      'pC:2',
    ]);
    const indexes = koSlotsAfter.map((s) => s.index);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (const id of ['sW1', 'sW2']) {
      const kept = koSlotsAfter.find((s) => s.id === id);
      if (kept) expect(kept.role).toBe('progression');
    }
  });

  it('a replacement team that was never in the tournament is not described as "back" in contention', () => {
    const snapshot = deepFreeze(midCup({ extraTeams: [teamView('PAN')] }));
    const change: ProposedChange = { kind: 'team_replace', outTeamId: 'EAG', inTeamId: 'PAN', inSeed: null, priorResults: 'keep_for_opponents' };
    const impact = computeImpact(change, snapshot, ctx());
    const panthers = impact.qualification.find((c) => c.teamId === 'PAN');
    expect(panthers?.before ?? null).toBeNull();
    expect(impact.lines.join(' | ')).not.toMatch(/Panthers are back in contention/);
  });

  it('deleting a completed fixture is blocked and destructive; a date change is info only', () => {
    const snapshot = deepFreeze(midCup());
    const blocked = computeImpact({ kind: 'fixture_delete', fixtureId: 'fA1' }, snapshot, ctx());
    expect(blocked.blocked?.reason.length).toBeGreaterThan(0);
    expect(blocked.severity).toBe('destructive');
    const dated = computeImpact({ kind: 'fixture_update', fixtureId: 'fA5', patch: { scheduledDate: '2026-05-10' } }, snapshot, ctx());
    expect(dated).toMatchObject({ severity: 'info', blocked: null, requiresConfirmation: false, standings: [], qualification: [], slots: [] });
  });

  it('overrides and historical corrections require a reason', () => {
    const snapshot = deepFreeze(midCup());
    const override = computeImpact(
      { kind: 'override_apply', override: qualOverride('ov-new-elim', 'ko', 'TIG', 'eliminate', null, 'Ineligible player') },
      snapshot,
      ctx(),
    );
    expect(override.requiresReason).toBe(true);
    const corrected = computeImpact({ kind: 'match_result_change', matchId: 'm-fA1', summary: correctedFA1() }, snapshot, ctx());
    expect(corrected.requiresReason).toBe(true);
    expect(corrected.requiresConfirmation).toBe(true);
    expect(corrected.standings.some((c) => c.teamId === 'LIO')).toBe(true);
  });
});

function bigTournament(remainingPerPool: number): TournamentSnapshot {
  const letters = 'ABCDEFGHIJKLMNOP';
  const teams: TournamentTeamView[] = [];
  const pools: Pool[] = [];
  const entries: PoolEntry[] = [];
  const fixtures: Fixture[] = [];
  const results: Record<string, Res> = {};
  let number = 1;
  const pairs = allPairs(8);
  for (let p = 0; p < 16; p += 1) {
    const poolId = `bp${p}`;
    pools.push(mkPool(poolId, 'grp', `Pool ${letters[p]}`, p));
    const ids = Array.from({ length: 8 }, (_, i) => `T${String(p * 8 + i + 1).padStart(3, '0')}`);
    ids.forEach((id, i) => {
      teams.push(teamView(id, { seed: p * 8 + i + 1 }));
      entries.push(mkEntry('grp', poolId, T(id)));
    });
    pairs.forEach(([i, j], k) => {
      const id = `g${p}-${k}`;
      fixtures.push(mkFixture(id, 'grp', poolId, number, T(ids[i]), T(ids[j])));
      number += 1;
      if (k < pairs.length - remainingPerPool) {
        const x = (i * 7 + j * 3 + p) % 11;
        results[id] = x === 0 ? { nr: true } : x % 2 === 0 ? win(ids[i], 1 + ((i + j + p) % 40)) : win(ids[j], 1 + ((i * j + p) % 40));
      }
    });
  }
  const slots: StageSlot[] = [];
  for (let pos = 1; pos <= 2; pos += 1) {
    for (let p = 0; p < 16; p += 1) {
      const index = (pos - 1) * 16 + p;
      slots.push(mkSlot(`k${letters[p]}${pos}`, 'ko', index, `${letters[p]}${pos}`, posSrc(`bp${p}`, pos), 'entry', index + 1));
    }
  }
  let slotIndex = 32;
  const rounds = 5;
  for (let r = 1; r < rounds; r += 1) {
    const count = 32 / 2 ** r;
    for (let q = 0; q < count; q += 1) {
      slots.push(mkSlot(`w${r}-${q}`, 'ko', slotIndex, `Winner R${r}-${q + 1}`, { kind: 'bracket_winner', stageId: 'ko', round: r, position: q }, 'progression'));
      slotIndex += 1;
    }
  }
  for (let q = 0; q < 16; q += 1) {
    fixtures.push(
      mkFixture(`ko1-${q}`, 'ko', null, number, S(slots[q].id), S(slots[31 - q].id), {
        round: 1,
        bracket: { kind: 'main', round: 1, position: q, roundName: 'Round of 32' },
      }),
    );
    number += 1;
  }
  for (let r = 2; r <= rounds; r += 1) {
    const count = 32 / 2 ** r;
    for (let q = 0; q < count; q += 1) {
      fixtures.push(
        mkFixture(`ko${r}-${q}`, 'ko', null, number, S(`w${r - 1}-${2 * q}`), S(`w${r - 1}-${2 * q + 1}`), {
          round: r,
          isFinal: r === rounds,
          bracket: { kind: 'main', round: r, position: q, roundName: r === rounds ? 'Final' : `Round ${r}` },
        }),
      );
      number += 1;
    }
  }
  const played = play(fixtures, results);
  return snap({
    teams,
    stages: [
      mkStage('grp', 'Group stage', 'group', 0),
      mkStage('ko', 'Knockouts', 'knockout', 1, {
        entryRules: [{ kind: 'top_per_pool', sourceStageId: 'grp', count: 2, fromPosition: 1 }],
        decidesChampion: true,
      }),
    ],
    pools,
    poolEntries: entries,
    slots,
    fixtures: played.fixtures,
    summaries: played.summaries,
  });
}

function medianMs(run: () => void, times = 5): number {
  run();
  const samples: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('performance: 128 teams, 16 pools, ~480 fixtures', () => {
  it('evaluates a complete group stage within 3x the 100 ms budget and fills all 32 places', () => {
    const snapshot = deepFreeze(bigTournament(0));
    expect(snapshot.fixtures).toHaveLength(479);
    let ev: TournamentEvaluation | null = null;
    const ms = medianMs(() => {
      ev = evaluateTournament(snapshot);
    });
    console.log(`evaluateTournament (128 teams, complete groups): median ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
    const done = ev as TournamentEvaluation | null;
    const entryIds = snapshot.slots.filter((s) => s.role === 'entry').map((s) => s.id);
    const teamsInSlots = entryIds.map((id) => (done ? slotTeam(done, id) : null));
    expect(teamsInSlots.every((t) => t !== null)).toBe(true);
    expect(new Set(teamsInSlots).size).toBe(32);
    expect(entryIds.every((id) => (done ? slotOf(done, id)?.status === 'final' : false))).toBe(true);
  });

  it('evaluates mid-stage with 6 undecided fixtures per pool (exact enumeration) within 3x the budget', () => {
    const snapshot = deepFreeze(bigTournament(6));
    const ms = medianMs(() => {
      evaluateTournament(snapshot);
    });
    console.log(`evaluateTournament (128 teams, 96 undecided group fixtures): median ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
  });

  it('evaluates with every group fixture undecided (bounds only) within 3x the budget', () => {
    const snapshot = deepFreeze(bigTournament(28));
    const ms = medianMs(() => {
      evaluateTournament(snapshot);
    });
    console.log(`evaluateTournament (128 teams, nothing played): median ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
  });
});

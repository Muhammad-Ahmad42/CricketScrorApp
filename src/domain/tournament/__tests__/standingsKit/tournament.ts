import { BASE_MATCH_RULES } from '@/domain/scoring/presets';
import type {
  Fixture,
  FixtureSide,
  MatchSummary,
  Pool,
  PoolEntry,
  SlotSource,
  Stage,
  StageConfig,
  StageSlot,
  StageType,
  TeamId,
  TournamentOverride,
  TournamentRules,
  TournamentSnapshot,
  TournamentStatus,
  TournamentTeamView,
} from '@/domain/types';
import { DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_STAGE_CONFIGS, DEFAULT_TIE_BREAKERS } from '../../defaults';
import type { EffectiveStageRules, StandingsInput, StandingsMember } from '../../standings';

export const T_ID = 't1';
export const AT = '2026-05-01T10:00:00.000Z';

export const team = (teamId: TeamId): FixtureSide => ({ kind: 'team', teamId });
export const slotSide = (slotId: string): FixtureSide => ({ kind: 'slot', slotId });

export interface TeamSpec {
  readonly id: TeamId;
  readonly name?: string;
  readonly seed?: number | null;
  readonly status?: 'active' | 'withdrawn' | 'replaced';
  readonly replacedBy?: TeamId | null;
  readonly inheritsFrom?: TeamId | null;
}

export function teamView(spec: TeamSpec | TeamId): TournamentTeamView {
  const s: TeamSpec = typeof spec === 'string' ? { id: spec } : spec;
  return {
    membership: {
      id: `tt-${s.id}`,
      tournamentId: T_ID,
      teamId: s.id,
      seed: s.seed ?? null,
      status: s.status ?? 'active',
      replacedByTeamId: s.replacedBy ?? null,
      inheritsFromTeamId: s.inheritsFrom ?? null,
      joinedAt: AT,
    },
    team: {
      id: s.id,
      name: s.name ?? s.id,
      shortName: s.id.slice(0, 5),
      logoUri: null,
      captainId: null,
      createdAt: AT,
      updatedAt: AT,
      archivedAt: null,
    },
  };
}

export function stage(id: string, name: string, type: StageType, orderIndex: number, config: Partial<StageConfig> = {}): Stage {
  return {
    id,
    tournamentId: T_ID,
    name,
    type,
    orderIndex,
    status: 'active',
    config: { ...DEFAULT_STAGE_CONFIGS[type], ...config },
    createdAt: AT,
    updatedAt: AT,
  };
}

export function pool(id: string, stageId: string, name: string, orderIndex: number, legs: number | null = null): Pool {
  return { id, stageId, name, orderIndex, legs };
}

export function entry(stageId: string, poolId: string, side: FixtureSide, seed: number | null = null): PoolEntry {
  const key = side.kind === 'team' ? side.teamId : side.slotId;
  return { id: `pe-${stageId}-${key}`, poolId, stageId, side, seed };
}

export function slot(
  id: string,
  stageId: string,
  index: number,
  label: string,
  source: SlotSource,
  opts: { readonly role?: 'entry' | 'progression'; readonly seed?: number | null } = {},
): StageSlot {
  return { id, stageId, index, role: opts.role ?? 'entry', label, source, seed: opts.seed ?? null };
}

export function fixture(
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
    tournamentId: T_ID,
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

export function withResult(target: Fixture, summary: MatchSummary): Fixture {
  return {
    ...target,
    matchId: summary.matchId,
    matchSides: { teamAId: summary.teamAId, teamBId: summary.teamBId },
    status: summary.status === 'abandoned' ? 'abandoned' : 'completed',
  };
}

export function roundRobin(stageId: string, poolId: string, teamIds: readonly TeamId[], startNumber: number, legs = 1): Fixture[] {
  const fixtures: Fixture[] = [];
  let number = startNumber;
  for (let leg = 1; leg <= legs; leg += 1) {
    for (let i = 0; i < teamIds.length; i += 1) {
      for (let j = i + 1; j < teamIds.length; j += 1) {
        const [a, b] = leg % 2 === 1 ? [teamIds[i], teamIds[j]] : [teamIds[j], teamIds[i]];
        fixtures.push(fixture(fixtureKey(a, b, leg), stageId, poolId, number, team(a), team(b), { leg }));
        number += 1;
      }
    }
  }
  return fixtures;
}

export function fixtureKey(a: TeamId, b: TeamId, leg = 1): string {
  const [x, y] = [a, b].sort();
  return leg === 1 ? `${x}v${y}` : `${x}v${y}#${leg}`;
}

export function baseRules(patch: Partial<TournamentRules> = {}): TournamentRules {
  return {
    tournamentId: T_ID,
    pointsSystem: DEFAULT_POINTS_SYSTEM,
    nrr: DEFAULT_NRR_CONFIG,
    tieBreakers: DEFAULT_TIE_BREAKERS,
    defaultFormatId: 'T20',
    defaultMatchRules: BASE_MATCH_RULES,
    updatedAt: AT,
    ...patch,
  };
}

export interface SnapshotSpec {
  readonly teams: readonly (TeamSpec | TeamId)[];
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

export function makeSnapshot(spec: SnapshotSpec): TournamentSnapshot {
  const summaries: Record<string, MatchSummary> = {};
  for (const summary of spec.summaries ?? []) summaries[summary.matchId] = summary;
  return {
    version: '1',
    tournament: {
      id: T_ID,
      name: 'Spring Cup',
      season: null,
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
    rules: baseRules(spec.rules),
    teams: spec.teams.map(teamView),
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

export function applyResults(fixtures: readonly Fixture[], results: Readonly<Record<string, MatchSummary>>): Fixture[] {
  return fixtures.map((candidate) => (results[candidate.id] ? withResult(candidate, results[candidate.id]) : candidate));
}

export function teamMember(teamId: TeamId, patch: Partial<StandingsMember> = {}): StandingsMember {
  return { side: team(teamId), slotLabel: null, teamId, provisional: false, membership: 'active', inheritsFrom: [], ...patch };
}

export const DEFAULT_TABLE_RULES: EffectiveStageRules = {
  points: DEFAULT_POINTS_SYSTEM,
  nrr: DEFAULT_NRR_CONFIG,
  tieBreakers: DEFAULT_TIE_BREAKERS,
  headToHeadRequiresCompleteMiniLeague: false,
};

export function tableInput(spec: {
  readonly members: readonly (StandingsMember | TeamId)[];
  readonly results?: readonly MatchSummary[];
  readonly pending?: readonly (readonly [FixtureSide, FixtureSide])[];
  readonly extraFixtures?: readonly Fixture[];
  readonly rules?: Partial<EffectiveStageRules>;
  readonly overrides?: readonly TournamentOverride[];
  readonly poolId?: string | null;
  readonly normalization?: StandingsInput['normalization'];
  readonly poolOrder?: StandingsInput['poolOrder'];
  readonly names?: Readonly<Record<TeamId, string>>;
  readonly seeds?: Readonly<Record<TeamId, number | null>>;
}): StandingsInput {
  const poolId = spec.poolId === undefined ? 'pA' : spec.poolId;
  const results = spec.results ?? [];
  const played = results.map((summary, index) =>
    withResult(fixture(`f-${summary.matchId}`, 'groups', poolId, index + 1, team(summary.teamAId), team(summary.teamBId)), summary),
  );
  const pending = (spec.pending ?? []).map(([a, b], index) => fixture(`p-${index}`, 'groups', poolId, results.length + index + 1, a, b));
  const summaries: Record<string, MatchSummary> = {};
  results.forEach((summary) => {
    summaries[summary.matchId] = summary;
  });
  const members = spec.members.map((member) => (typeof member === 'string' ? teamMember(member) : member));
  const names = new Map<TeamId, string>();
  const seeds = new Map<TeamId, number | null>();
  members.forEach((member) => {
    if (member.teamId) names.set(member.teamId, spec.names?.[member.teamId] ?? member.teamId);
    if (member.teamId) seeds.set(member.teamId, spec.seeds?.[member.teamId] ?? null);
  });
  return {
    stageId: 'groups',
    poolId,
    members,
    fixtures: [...played, ...pending, ...(spec.extraFixtures ?? [])],
    fixtureTeams: (f) =>
      f.matchSides
        ? { a: f.matchSides.teamAId, b: f.matchSides.teamBId }
        : { a: f.sideA.kind === 'team' ? f.sideA.teamId : null, b: f.sideB.kind === 'team' ? f.sideB.teamId : null },
    summaries,
    rules: { ...DEFAULT_TABLE_RULES, ...spec.rules },
    overrides: spec.overrides ?? [],
    seeds,
    teamNames: names,
    normalization: spec.normalization,
    poolOrder: spec.poolOrder,
  };
}

type Meta = Partial<Pick<TournamentOverride, 'id' | 'reason' | 'createdAt' | 'revokedAt'>>;

function meta(kind: string, key: string, patch: Meta) {
  return {
    id: patch.id ?? `ov-${kind}-${key}`,
    tournamentId: T_ID,
    reason: patch.reason ?? 'Organizer decision',
    createdAt: patch.createdAt ?? AT,
    revokedAt: patch.revokedAt ?? null,
    revokeReason: null,
  };
}

export function adjustment(teamId: TeamId, points: number, patch: Meta & { readonly stageId?: string; readonly poolId?: string | null } = {}): TournamentOverride {
  return {
    ...meta('adj', teamId, patch),
    kind: 'points_adjustment',
    stageId: patch.stageId ?? 'groups',
    poolId: patch.poolId === undefined ? null : patch.poolId,
    teamId,
    points,
  };
}

export function expunge(teamId: TeamId, stageId: string | null = null, patch: Meta = {}): TournamentOverride {
  return { ...meta('exp', teamId, patch), kind: 'expunge_results', stageId, teamId };
}

export function slotAssignment(slotId: string, teamId: TeamId, patch: Meta = {}): TournamentOverride {
  return { ...meta('slot', `${slotId}-${teamId}`, patch), kind: 'slot_assignment', slotId, teamId };
}

export function qualificationOverride(
  stageId: string,
  teamId: TeamId,
  action: 'qualify' | 'eliminate' | 'reassign',
  target: { readonly slotId?: string | null; readonly poolId?: string | null } = {},
  patch: Meta = {},
): TournamentOverride {
  return {
    ...meta('q', `${action}-${teamId}`, patch),
    kind: 'qualification',
    stageId,
    teamId,
    action,
    slotId: target.slotId ?? null,
    poolId: target.poolId ?? null,
  };
}

export function championOverride(teamIds: readonly TeamId[], patch: Meta = {}): TournamentOverride {
  return { ...meta('champ', teamIds.join('-'), patch), kind: 'champion', teamIds };
}

import type {
  Fixture,
  FixtureStatus,
  InningsCompletionReason,
  InningsSummary,
  MatchResult,
  MatchSummary,
  NrrConfig,
  PointsSystem,
  StandingRow,
  StandingsTable,
  TeamId,
  TieBreakerKind,
  TournamentOverride,
  UnevenPoolNormalization,
} from '@/domain/types';
import { DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_TIE_BREAKERS } from '../defaults';
import { aggregateNrr, compareNrr, computeNrr, matchNrrContributions } from '../nrr';
import { computeStandings } from '../standings';
import type { StandingsMember } from '../standings';
import { describeTieBreakerChain, rankTeams } from '../tiebreakers';
import type { HeadToHeadRecord, RankContext, TeamRecord } from '../tiebreakers';

interface Bat {
  readonly team: TeamId;
  readonly runs: number;
  readonly balls: number;
  readonly wickets?: number;
  readonly allOut?: boolean;
  readonly allotted?: number;
  readonly bpo?: number;
  readonly completion?: InningsCompletionReason | null;
  readonly target?: number;
  readonly revised?: boolean;
}

interface MatchOpts {
  readonly bpo?: number;
  readonly allotted?: number;
  readonly result?: MatchResult;
  readonly superOvers?: readonly InningsSummary[];
  readonly completedAt?: string | null;
  readonly cardSwapped?: boolean;
}

type TieResolution = Extract<TournamentOverride, { readonly kind: 'tie_resolution' }>;

const ICC: NrrConfig = DEFAULT_NRR_CONFIG;
const ACTUAL: NrrConfig = { ...DEFAULT_NRR_CONFIG, mode: 'actual_overs' };
const AT = '2026-06-01T10:00:00.000Z';

const NAMES: Readonly<Record<string, string>> = {
  A: 'Aces',
  B: 'Blues',
  C: 'Cats',
  D: 'Dogs',
  E: 'Eels',
  X: 'Xylos',
  Y: 'Yaks',
  Z: 'Zebras',
  W: 'Wasps',
};

function inningsOf(index: number, bat: Bat, bowlingTeamId: TeamId, bpo: number, allotted: number, target: number | null): InningsSummary {
  const allOut = bat.allOut ?? false;
  const quota = bat.allotted ?? allotted;
  const completion: InningsCompletionReason | null =
    bat.completion !== undefined
      ? bat.completion
      : allOut
        ? 'all_out'
        : bat.balls >= quota
          ? 'overs_complete'
          : index === 1
            ? 'target_reached'
            : 'declared';
  return {
    inningsIndex: index,
    battingTeamId: bat.team,
    bowlingTeamId,
    runs: bat.runs,
    wickets: bat.wickets ?? (allOut ? 10 : 4),
    legalBalls: bat.balls,
    allottedBalls: quota,
    ballsPerOver: bat.bpo ?? bpo,
    allOut,
    completion,
    target,
    targetRevised: bat.revised ?? false,
    extras: 0,
    fours: 0,
    sixes: 0,
    batting: [],
    bowling: [],
    bestPartnership: null,
  };
}

function winnerOf(result: MatchResult): TeamId | null {
  switch (result.type) {
    case 'win':
    case 'walkover':
      return result.winnerTeamId;
    case 'awarded':
      return result.winnerTeamId;
    case 'tie':
      return result.decider ? result.decider.winnerTeamId : null;
    case 'no_result':
    case 'abandoned':
      return null;
  }
}

function summaryOf(
  id: string,
  teamA: TeamId,
  teamB: TeamId,
  result: MatchResult,
  innings: readonly InningsSummary[],
  opts: MatchOpts = {},
): MatchSummary {
  return {
    summaryVersion: 2,
    matchId: id,
    teamAId: opts.cardSwapped ? teamB : teamA,
    teamBId: opts.cardSwapped ? teamA : teamB,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winnerOf(result),
    ballsPerOver: opts.bpo ?? 6,
    innings,
    superOvers: opts.superOvers ?? [],
    squads: [],
    completedAt: opts.completedAt === undefined ? null : opts.completedAt,
  };
}

function played(id: string, first: Bat, second: Bat, opts: MatchOpts = {}): MatchSummary {
  const bpo = opts.bpo ?? 6;
  const allotted = opts.allotted ?? 120;
  const target = second.target ?? first.runs + 1;
  const i0 = inningsOf(0, first, second.team, bpo, allotted, null);
  const i1 = inningsOf(1, second, first.team, bpo, allotted, target);
  const method: 'normal' | 'revised_target' | 'par_score' = second.revised
    ? second.completion === 'terminated'
      ? 'par_score'
      : 'revised_target'
    : 'normal';
  const derived: MatchResult =
    second.runs >= target
      ? {
          type: 'win',
          winnerTeamId: second.team,
          loserTeamId: first.team,
          margin: { kind: 'wickets', wickets: 10 - (second.wickets ?? 4), ballsRemaining: i1.allottedBalls - second.balls },
          method,
        }
      : second.runs === target - 1
        ? { type: 'tie', decider: null }
        : {
            type: 'win',
            winnerTeamId: first.team,
            loserTeamId: second.team,
            margin: { kind: 'runs', runs: target - 1 - second.runs },
            method,
          };
  return summaryOf(id, first.team, second.team, opts.result ?? derived, [i0, i1], opts);
}

function duel(id: string, first: TeamId, firstRuns: number, second: TeamId, secondRuns: number, opts: MatchOpts = {}): MatchSummary {
  return played(id, { team: first, runs: firstRuns, balls: 120 }, { team: second, runs: secondRuns, balls: 120 }, opts);
}

function noResultMatch(id: string, a: TeamId, b: TeamId, innings: readonly InningsSummary[] = [], opts: MatchOpts = {}): MatchSummary {
  return summaryOf(id, a, b, { type: 'no_result', reason: 'Rain' }, innings, opts);
}

function abandonedMatch(id: string, a: TeamId, b: TeamId, innings: readonly InningsSummary[] = []): MatchSummary {
  return summaryOf(id, a, b, { type: 'abandoned', reason: 'Rain' }, innings);
}

function walkoverMatch(id: string, teamA: TeamId, teamB: TeamId, winner: TeamId, opts: MatchOpts = {}): MatchSummary {
  const loser = winner === teamA ? teamB : teamA;
  return summaryOf(id, teamA, teamB, { type: 'walkover', winnerTeamId: winner, loserTeamId: loser, reason: 'Forfeit' }, [], opts);
}

function fixtureOf(
  id: string,
  matchNumber: number,
  a: TeamId,
  b: TeamId,
  matchId: string | null,
  status: FixtureStatus,
  poolId: string | null,
  stageId = 'groups',
): Fixture {
  return {
    id,
    tournamentId: 't1',
    stageId,
    poolId,
    matchNumber,
    label: null,
    round: null,
    leg: null,
    bracket: null,
    isFinal: false,
    sideA: { kind: 'team', teamId: a },
    sideB: { kind: 'team', teamId: b },
    scheduledDate: null,
    scheduledTime: null,
    venueId: null,
    status,
    matchId,
    matchSides: matchId ? { teamAId: a, teamBId: b } : null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function member(teamId: TeamId, patch: Partial<StandingsMember> = {}): StandingsMember {
  return {
    side: { kind: 'team', teamId },
    slotLabel: null,
    teamId,
    provisional: false,
    membership: 'active',
    inheritsFrom: [],
    ...patch,
  };
}

interface TableSpec {
  readonly teams: readonly (TeamId | StandingsMember)[];
  readonly results: readonly MatchSummary[];
  readonly pending?: readonly (readonly [TeamId, TeamId])[];
  readonly extraFixtures?: readonly Fixture[];
  readonly extraSummaries?: readonly MatchSummary[];
  readonly points?: Partial<PointsSystem>;
  readonly nrr?: Partial<NrrConfig>;
  readonly chain?: readonly TieBreakerKind[];
  readonly requireComplete?: boolean;
  readonly overrides?: readonly TournamentOverride[];
  readonly poolId?: string | null;
  readonly poolOf?: Readonly<Record<TeamId, string>>;
  readonly normalization?: UnevenPoolNormalization;
  readonly poolOrder?: ReadonlyMap<string, readonly TeamId[]>;
  readonly seeds?: Readonly<Record<TeamId, number | null>>;
}

function table(spec: TableSpec): StandingsTable {
  const poolId = spec.poolId === undefined ? 'pA' : spec.poolId;
  const poolFor = (team: TeamId) => spec.poolOf?.[team] ?? poolId;
  const resultFixtures = spec.results.map((summary, index) =>
    fixtureOf(`f-${summary.matchId}`, index + 1, summary.teamAId, summary.teamBId, summary.matchId, summary.status, poolFor(summary.teamAId)),
  );
  const pendingFixtures = (spec.pending ?? []).map(([a, b], index) =>
    fixtureOf(`p-${index}`, spec.results.length + index + 1, a, b, null, 'scheduled', poolFor(a)),
  );
  const summaries: Record<string, MatchSummary> = {};
  for (const summary of [...spec.results, ...(spec.extraSummaries ?? [])]) summaries[summary.matchId] = summary;
  const members = spec.teams.map((entry) => (typeof entry === 'string' ? member(entry) : entry));
  const names = new Map<TeamId, string>();
  const seeds = new Map<TeamId, number | null>();
  for (const entry of members) {
    if (!entry.teamId) continue;
    names.set(entry.teamId, NAMES[entry.teamId] ?? entry.teamId);
    seeds.set(entry.teamId, spec.seeds?.[entry.teamId] ?? null);
  }
  return computeStandings({
    stageId: 'groups',
    poolId,
    members,
    fixtures: [...resultFixtures, ...pendingFixtures, ...(spec.extraFixtures ?? [])],
    fixtureTeams: (f) =>
      f.matchSides
        ? { a: f.matchSides.teamAId, b: f.matchSides.teamBId }
        : { a: f.sideA.kind === 'team' ? f.sideA.teamId : null, b: f.sideB.kind === 'team' ? f.sideB.teamId : null },
    summaries,
    rules: {
      points: { ...DEFAULT_POINTS_SYSTEM, ...spec.points },
      nrr: { ...DEFAULT_NRR_CONFIG, ...spec.nrr },
      tieBreakers: spec.chain ?? DEFAULT_TIE_BREAKERS,
      headToHeadRequiresCompleteMiniLeague: spec.requireComplete ?? false,
    },
    overrides: spec.overrides ?? [],
    seeds,
    teamNames: names,
    normalization: spec.normalization,
    poolOrder: spec.poolOrder,
  });
}

const rowOf = (t: StandingsTable, teamId: TeamId): StandingRow => {
  const row = t.rows.find((candidate) => candidate.teamId === teamId);
  if (!row) throw new Error(`no row for ${teamId}`);
  return row;
};
const orderOf = (t: StandingsTable) => t.rows.map((row) => row.teamId);
const positionsOf = (t: StandingsTable) => t.rows.map((row) => row.position);

function overrideBase(id: string, reason: string, revoked: boolean) {
  return {
    id,
    tournamentId: 't1',
    reason,
    createdAt: AT,
    revokedAt: revoked ? '2026-06-02T10:00:00.000Z' : null,
    revokeReason: revoked ? 'Mistake' : null,
  };
}

function adjustment(id: string, teamId: TeamId, points: number, opts: { poolId?: string | null; stageId?: string; revoked?: boolean } = {}): TournamentOverride {
  return {
    ...overrideBase(id, 'Slow over-rate', opts.revoked ?? false),
    kind: 'points_adjustment',
    stageId: opts.stageId ?? 'groups',
    poolId: opts.poolId === undefined ? 'pA' : opts.poolId,
    teamId,
    points,
  };
}

function expunge(id: string, teamId: TeamId, stageId: string | null, revoked = false): TournamentOverride {
  return { ...overrideBase(id, 'Withdrawn', revoked), kind: 'expunge_results', stageId, teamId };
}

function resolution(
  id: string,
  orderedTeamIds: readonly TeamId[],
  opts: { method?: 'organizer_decision' | 'draw_lots'; seed?: number | null; reason?: string; stageId?: string; revoked?: boolean } = {},
): TieResolution {
  return {
    ...overrideBase(id, opts.reason ?? 'Fair play record', opts.revoked ?? false),
    kind: 'tie_resolution',
    stageId: opts.stageId ?? 'groups',
    poolId: 'pA',
    orderedTeamIds,
    method: opts.method ?? 'organizer_decision',
    seed: opts.seed ?? null,
  };
}

function nrrOf(summaries: readonly MatchSummary[], teamId: TeamId, config: NrrConfig = ICC): number | null {
  const aggregate = aggregateNrr(summaries, [teamId], config).get(teamId);
  return aggregate ? aggregate.nrr : null;
}

function contributionsOf(summary: MatchSummary, config: NrrConfig = ICC) {
  const pair = matchNrrContributions(summary, config);
  if (!pair) throw new Error('match unexpectedly excluded from NRR');
  return pair;
}

describe('NRR: ICC all-out full quota and actual overs', () => {
  const bothAllOut = played('n1', { team: 'A', runs: 140, balls: 102, allOut: true }, { team: 'B', runs: 120, balls: 98, allOut: true });

  it('applies the full quota to BOTH innings when both sides are bowled out', () => {
    const [a, b] = contributionsOf(bothAllOut);
    expect(a).toMatchObject({ teamId: 'A', runsFor: 140, ballsFor: 120, runsAgainst: 120, ballsAgainst: 120 });
    expect(b).toMatchObject({ teamId: 'B', runsFor: 120, ballsFor: 120, runsAgainst: 140, ballsAgainst: 120 });
    expect(nrrOf([bothAllOut], 'A')).toBeCloseTo(1.0, 9);
    expect(nrrOf([bothAllOut], 'B')).toBeCloseTo(-1.0, 9);
  });

  it('uses actual balls for both all-out innings in actual_overs mode (+0.888)', () => {
    const [a] = contributionsOf(bothAllOut, ACTUAL);
    expect(a).toMatchObject({ ballsFor: 102, ballsAgainst: 98 });
    expect(nrrOf([bothAllOut], 'A', ACTUAL)).toBeCloseTo((140 * 6) / 102 - (120 * 6) / 98, 9);
    expect(nrrOf([bothAllOut], 'A', ACTUAL)).toBeCloseTo(0.888355, 6);
  });

  it('EC-Q-14 40-over match: bowled out in 32.1 counts 40 overs, chase in 30.2 counts 30.333 overs (-1.228 / -0.315)', () => {
    const m = played('n2', { team: 'A', runs: 150, balls: 193, allOut: true }, { team: 'B', runs: 151, balls: 182, wickets: 3 }, { allotted: 240 });
    const [a, b] = contributionsOf(m);
    expect(a).toMatchObject({ ballsFor: 240, ballsAgainst: 182 });
    expect(a.oversFor).toBeCloseTo(40, 9);
    expect(a.oversAgainst).toBeCloseTo(182 / 6, 9);
    expect(b).toMatchObject({ ballsFor: 182, ballsAgainst: 240 });
    expect(nrrOf([m], 'A')).toBeCloseTo(-1.228022, 6);
    expect(nrrOf([m], 'B')).toBeCloseTo(1.228022, 6);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(-0.31481, 5);
  });

  it('a declared (not all out) innings keeps its actual balls in icc mode (+4.500)', () => {
    const m = played(
      'n3',
      { team: 'A', runs: 200, balls: 100, wickets: 5, completion: 'declared' },
      { team: 'B', runs: 150, balls: 110, allOut: true },
    );
    const [a] = contributionsOf(m);
    expect(a).toMatchObject({ ballsFor: 100, ballsAgainst: 120 });
    expect(nrrOf([m], 'A')).toBeCloseTo(4.5, 9);
  });

  it('batters_unavailable counts as all out: the full quota applies (-0.645 icc, +0.655 actual)', () => {
    const m = played(
      'n4',
      { team: 'A', runs: 130, balls: 100, wickets: 7, allOut: true, completion: 'batters_unavailable' },
      { team: 'B', runs: 131, balls: 110, wickets: 4 },
    );
    const [a] = contributionsOf(m);
    expect(a.ballsFor).toBe(120);
    expect(nrrOf([m], 'A')).toBeCloseTo(6.5 - (131 * 6) / 110, 9);
    expect(nrrOf([m], 'A')).toBeCloseTo(-0.645455, 6);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(0.654545, 6);
  });

  it('first innings all out and a chase won early: full quota for the side bowled out, actual balls for the chase (-5.100)', () => {
    const m = played('n5', { team: 'A', runs: 100, balls: 80, allOut: true }, { team: 'B', runs: 101, balls: 60, wickets: 2 });
    const [a, b] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 100, ballsFor: 120, runsAgainst: 101, ballsAgainst: 60 });
    expect(b).toMatchObject({ runsFor: 101, ballsFor: 60, runsAgainst: 100, ballsAgainst: 120 });
    expect(nrrOf([m], 'A')).toBeCloseTo(-5.1, 9);
    expect(nrrOf([m], 'B')).toBeCloseTo(5.1, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(-2.6, 9);
  });

  it('maps contributions to the match card order when the card lists the chasing side first', () => {
    const m = played('n6', { team: 'C', runs: 140, balls: 120, wickets: 8 }, { team: 'D', runs: 141, balls: 100, wickets: 3 }, { cardSwapped: true });
    expect(m.teamAId).toBe('D');
    const [first, second] = contributionsOf(m);
    expect(first).toMatchObject({ teamId: 'D', runsFor: 141, ballsFor: 100, runsAgainst: 140, ballsAgainst: 120 });
    expect(second).toMatchObject({ teamId: 'C', runsFor: 140, ballsFor: 120, runsAgainst: 141, ballsAgainst: 100 });
  });

  it('reduced-overs match (12 overs a side): all out counts 72 balls (+1.333 icc, +0.131 actual)', () => {
    const m = played('n7', { team: 'A', runs: 96, balls: 72, wickets: 4 }, { team: 'B', runs: 80, balls: 61, allOut: true }, { allotted: 72 });
    expect(contributionsOf(m)[1].ballsFor).toBe(72);
    expect(nrrOf([m], 'A')).toBeCloseTo(8 - (80 * 6) / 72, 9);
    expect(nrrOf([m], 'A')).toBeCloseTo(1.333333, 6);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(8 - (80 * 6) / 61, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(0.131148, 6);
  });

  it('ties count normally: chasing side all out at the tie score is 0.000 in icc but -0.682 in actual_overs', () => {
    const m = played('n8', { team: 'A', runs: 150, balls: 120, wickets: 7 }, { team: 'B', runs: 150, balls: 110, allOut: true });
    expect(m.result.type).toBe('tie');
    expect(nrrOf([m], 'A')).toBeCloseTo(0, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(7.5 - (150 * 6) / 110, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(-0.681818, 6);
  });
});

describe('NRR: revised targets and par-score results', () => {
  it('revised chase won early: batting side credited target-1 off the revised allotment, chase keeps actual balls (-1.821 / -2.154)', () => {
    const m = played(
      'r1',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 145, balls: 78, wickets: 4, allotted: 90, target: 141, revised: true },
    );
    const [a, b] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 140, ballsFor: 90, runsAgainst: 145, ballsAgainst: 78 });
    expect(b).toMatchObject({ runsFor: 145, ballsFor: 78, runsAgainst: 140, ballsAgainst: 90 });
    expect(nrrOf([m], 'A')).toBeCloseTo((140 * 6) / 90 - (145 * 6) / 78, 9);
    expect(nrrOf([m], 'A')).toBeCloseTo(-1.820513, 6);
    expect(nrrOf([m], 'A', { ...ICC, revisedTarget: 'actual' })).toBeCloseTo(-2.153846, 6);
  });

  it('revised chase bowled out: every mode x revisedTarget combination (2.750 / 0.776 / 2.500 / 0.526)', () => {
    const m = played(
      'r2',
      { team: 'A', runs: 200, balls: 120, wickets: 5 },
      { team: 'B', runs: 120, balls: 76, allOut: true, allotted: 96, target: 165, revised: true },
    );
    const [a] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 164, ballsFor: 96, runsAgainst: 120, ballsAgainst: 96 });
    expect(nrrOf([m], 'A', ICC)).toBeCloseTo(2.75, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(10.25 - (120 * 6) / 76, 9);
    expect(nrrOf([m], 'A', ACTUAL)).toBeCloseTo(0.776316, 6);
    expect(nrrOf([m], 'A', { ...ICC, revisedTarget: 'actual' })).toBeCloseTo(2.5, 9);
    expect(nrrOf([m], 'A', { ...ACTUAL, revisedTarget: 'actual' })).toBeCloseTo(0.526316, 6);
  });

  it('first innings all out then chase revised: par credit replaces the full quota (-1.917 icc_par, -2.550 actual)', () => {
    const m = played(
      'r3',
      { team: 'A', runs: 150, balls: 150, allOut: true },
      { team: 'B', runs: 111, balls: 120, wickets: 3, allotted: 180, target: 110, revised: true },
      { allotted: 300 },
    );
    const [a] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 109, ballsFor: 180, runsAgainst: 111, ballsAgainst: 120 });
    expect(nrrOf([m], 'A')).toBeCloseTo((109 * 6) / 180 - 5.55, 9);
    expect(nrrOf([m], 'A')).toBeCloseTo(-1.916667, 6);
    expect(nrrOf([m], 'A', { ...ICC, revisedTarget: 'actual' })).toBeCloseTo(3.0 - 5.55, 9);
  });

  it('terminated chase behind par: side batting first credited par off the balls bowled (+1.395 icc_par, +2.721 actual)', () => {
    const m = played(
      'r4',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 90, balls: 86, wickets: 5, allotted: 86, target: 111, revised: true, completion: 'terminated' },
    );
    expect(m.result).toMatchObject({ type: 'win', winnerTeamId: 'A', method: 'par_score' });
    const [a] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 110, ballsFor: 86, runsAgainst: 90, ballsAgainst: 86 });
    expect(nrrOf([m], 'A')).toBeCloseTo((20 * 6) / 86, 9);
    expect(nrrOf([m], 'A')).toBeCloseTo(1.395349, 6);
    expect(nrrOf([m], 'A', { ...ICC, revisedTarget: 'actual' })).toBeCloseTo(2.72093, 5);
  });

  it('chase overs cut WITHOUT a revised target: no par credit, but the all-out quota is the reduced allotment (-1.000)', () => {
    const m = played(
      'r6',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 150, balls: 80, allOut: true, allotted: 90, target: 181, revised: false },
    );
    expect(m.result).toMatchObject({ type: 'win', winnerTeamId: 'A' });
    const [a, b] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 180, ballsFor: 120, runsAgainst: 150, ballsAgainst: 90 });
    expect(b).toMatchObject({ runsFor: 150, ballsFor: 90 });
    expect(nrrOf([m], 'A')).toBeCloseTo(-1.0, 9);
    expect(nrrOf([m], 'B')).toBeCloseTo(1.0, 9);
  });

  it('terminated chase level on par is a tie with 0.000 under icc_par (+1.326 under actual)', () => {
    const m = played(
      'r5',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 110, balls: 86, wickets: 5, allotted: 86, target: 111, revised: true, completion: 'terminated' },
    );
    expect(m.result.type).toBe('tie');
    expect(nrrOf([m], 'A')).toBeCloseTo(0, 9);
    expect(nrrOf([m], 'B')).toBeCloseTo(0, 9);
    expect(nrrOf([m], 'A', { ...ICC, revisedTarget: 'actual' })).toBeCloseTo(9 - (110 * 6) / 86, 9);
  });
});

describe('NRR: inclusion rules for no result, abandoned, walkover, awarded, super overs, expunged teams', () => {
  it('super-over innings are never read, even when the super over decides the tie', () => {
    const superOvers = [
      inningsOf(2, { team: 'A', runs: 20, balls: 6, wickets: 1 }, 'B', 6, 6, null),
      inningsOf(3, { team: 'B', runs: 21, balls: 4, wickets: 0 }, 'A', 6, 6, 21),
    ];
    const m = played('s1', { team: 'A', runs: 150, balls: 120, wickets: 7 }, { team: 'B', runs: 150, balls: 120, wickets: 9 }, {
      superOvers,
      result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'B', superOverRounds: 1 } },
    });
    const [a, b] = contributionsOf(m);
    expect(a).toMatchObject({ runsFor: 150, ballsFor: 120, runsAgainst: 150, ballsAgainst: 120 });
    expect(b).toMatchObject({ runsFor: 150, ballsFor: 120, runsAgainst: 150, ballsAgainst: 120 });
    expect(nrrOf([m], 'B')).toBeCloseTo(0, 9);
  });

  it('no result with includeNoResult still applies the all-out full quota (-1.500 icc, 0.000 actual)', () => {
    const m = noResultMatch('s2', 'A', 'B', [
      inningsOf(0, { team: 'A', runs: 90, balls: 90, allOut: true }, 'B', 6, 120, null),
      inningsOf(1, { team: 'B', runs: 30, balls: 30, wickets: 1, completion: 'match_ended' }, 'A', 6, 120, 91),
    ]);
    expect(matchNrrContributions(m, ICC)).toBeNull();
    expect(matchNrrContributions(m, { ...ICC, includeAbandoned: true })).toBeNull();
    const withNr = { ...ICC, includeNoResult: true };
    const [a] = contributionsOf(m, withNr);
    expect(a).toMatchObject({ runsFor: 90, ballsFor: 120, runsAgainst: 30, ballsAgainst: 30 });
    expect(nrrOf([m], 'A', withNr)).toBeCloseTo(-1.5, 9);
    expect(nrrOf([m], 'A', { ...withNr, mode: 'actual_overs' })).toBeCloseTo(0, 9);
  });

  it('includeNoResult ignores an innings with zero legal balls (runs from wides only do not count)', () => {
    const m = noResultMatch('s3', 'A', 'B', [
      inningsOf(0, { team: 'A', runs: 60, balls: 48, wickets: 1, completion: 'match_ended' }, 'B', 6, 120, null),
      inningsOf(1, { team: 'B', runs: 5, balls: 0, wickets: 0, completion: 'match_ended' }, 'A', 6, 120, 61),
    ]);
    const [a, b] = contributionsOf(m, { ...ICC, includeNoResult: true });
    expect(a).toMatchObject({ runsFor: 60, ballsFor: 48, runsAgainst: 0, ballsAgainst: 0 });
    expect(b).toMatchObject({ runsFor: 0, ballsFor: 0, runsAgainst: 60, ballsAgainst: 48 });
  });

  it('includeAbandoned is independent of includeNoResult; an abandoned match after one innings counts only that innings', () => {
    const m = abandonedMatch('s4', 'A', 'B', [inningsOf(0, { team: 'A', runs: 140, balls: 120, wickets: 6 }, 'B', 6, 120, null)]);
    expect(matchNrrContributions(m, { ...ICC, includeNoResult: true })).toBeNull();
    const cfg = { ...ICC, includeAbandoned: true };
    const [a, b] = contributionsOf(m, cfg);
    expect(a).toMatchObject({ runsFor: 140, ballsFor: 120, runsAgainst: 0, ballsAgainst: 0 });
    expect(b).toMatchObject({ runsFor: 0, ballsFor: 0, runsAgainst: 140, ballsAgainst: 120 });
    const other = duel('s4b', 'A', 160, 'C', 140);
    expect(nrrOf([m, other], 'A', cfg)).toBeCloseTo(300 / 40 - 140 / 20, 9);
    expect(nrrOf([m, other], 'A', ICC)).toBeCloseTo(1.0, 9);
  });

  it('walkover notional figures are credited to the WINNER even when the winner is team B (+7.500 / -7.500)', () => {
    const m = walkoverMatch('s5', 'A', 'B', 'B');
    expect(matchNrrContributions(m, ICC)).toBeNull();
    const cfg: NrrConfig = { ...ICC, walkover: { kind: 'notional', winnerRuns: 100, winnerBalls: 60, loserRuns: 50, loserBalls: 120 } };
    const [a, b] = contributionsOf(m, cfg);
    expect(a).toMatchObject({ teamId: 'A', runsFor: 50, ballsFor: 120, runsAgainst: 100, ballsAgainst: 60 });
    expect(b).toMatchObject({ teamId: 'B', runsFor: 100, ballsFor: 60, runsAgainst: 50, ballsAgainst: 120 });
    expect(nrrOf([m], 'B', cfg)).toBeCloseTo(7.5, 9);
    expect(nrrOf([m], 'A', cfg)).toBeCloseTo(-7.5, 9);
  });

  it('awarded use_played_innings counts only the completed innings and keeps the all-out full quota', () => {
    const m = summaryOf(
      's6',
      'A',
      'B',
      { type: 'awarded', winnerTeamId: 'A', loserTeamId: 'B', reason: 'Conceded', margin: null },
      [
        inningsOf(0, { team: 'A', runs: 130, balls: 100, allOut: true }, 'B', 6, 120, null),
        inningsOf(1, { team: 'B', runs: 30, balls: 30, wickets: 2, completion: 'match_ended' }, 'A', 6, 120, 131),
      ],
    );
    expect(matchNrrContributions(m, ICC)).toBeNull();
    const cfg: NrrConfig = { ...ICC, awarded: 'use_played_innings' };
    const [a, b] = contributionsOf(m, cfg);
    expect(a).toMatchObject({ runsFor: 130, ballsFor: 120, runsAgainst: 0, ballsAgainst: 0 });
    expect(b).toMatchObject({ runsFor: 0, ballsFor: 0, runsAgainst: 130, ballsAgainst: 120 });
    const other = duel('s6b', 'A', 150, 'C', 120);
    expect(nrrOf([m, other], 'A', cfg)).toBeCloseTo(280 / 40 - 6, 9);
    expect(nrrOf([m, other], 'A', ICC)).toBeCloseTo(1.5, 9);
  });

  it('expunged team: its matches are excluded for both sides; restrictToTeams keeps only mutual matches', () => {
    const ab = duel('x1', 'A', 160, 'B', 150);
    const ac = duel('x2', 'A', 150, 'C', 200);
    const all = aggregateNrr([ab, ac], ['A', 'C'], ICC);
    expect(all.get('A')?.nrr).toBeCloseTo((310 - 350) / 40, 9);
    const expunged = aggregateNrr([ab, ac], ['A', 'C'], ICC, { expungedTeamIds: new Set(['C']) });
    expect(expunged.get('A')).toMatchObject({ matchesCounted: 1, runsFor: 160, runsAgainst: 150 });
    expect(expunged.get('A')?.nrr).toBeCloseTo(0.5, 9);
    expect(expunged.get('C')).toMatchObject({ matchesCounted: 0, runsFor: 0, nrr: null });
    expect(matchNrrContributions(ac, ICC, new Set(['C']))).toBeNull();
    const restricted = aggregateNrr([ab, ac], ['A', 'B'], ICC, { restrictToTeams: true });
    expect(restricted.get('A')).toMatchObject({ matchesCounted: 1 });
    expect(restricted.get('A')?.nrr).toBeCloseTo(0.5, 9);
    expect(restricted.get('B')?.nrr).toBeCloseTo(-0.5, 9);
  });
});

describe('NRR: mixed balls per over and aggregation', () => {
  const eightBall = played('b8', { team: 'A', runs: 100, balls: 80, wickets: 8 }, { team: 'B', runs: 90, balls: 50, allOut: true }, { bpo: 8, allotted: 80 });
  const fiveBall = played('b5', { team: 'B', runs: 60, balls: 50, wickets: 5 }, { team: 'A', runs: 61, balls: 35, wickets: 2 }, { bpo: 5, allotted: 50 });
  const sixBall = duel('b6', 'A', 120, 'B', 100);

  it('8-, 5- and 6-ball matches: overs are balls / that match\'s balls per over (icc +1.345)', () => {
    const agg = aggregateNrr([eightBall, fiveBall, sixBall], ['A', 'B'], ICC);
    const a = agg.get('A');
    expect(a?.runsFor).toBe(281);
    expect(a?.runsAgainst).toBe(250);
    expect(a?.oversFor).toBeCloseTo(37, 9);
    expect(a?.oversAgainst).toBeCloseTo(40, 9);
    expect(a?.nrr).toBeCloseTo(281 / 37 - 250 / 40, 9);
    expect(a?.nrr).toBeCloseTo(1.344595, 6);
    expect(agg.get('B')?.nrr).toBeCloseTo(-1.344595, 6);
  });

  it('the same matches in actual_overs mode (+0.698): an 8-ball side bowled out in 50 balls faced 6.25 overs', () => {
    const agg = aggregateNrr([eightBall, fiveBall, sixBall], ['A'], ACTUAL);
    expect(agg.get('A')?.oversAgainst).toBeCloseTo(36.25, 9);
    expect(agg.get('A')?.nrr).toBeCloseTo(281 / 37 - 250 / 36.25, 9);
    expect(agg.get('A')?.nrr).toBeCloseTo(0.698043, 6);
  });

  it('a whole table is symmetric: total runs and overs for equal total runs and overs against', () => {
    const summaries = [
      eightBall,
      fiveBall,
      played('t1', { team: 'C', runs: 150, balls: 110, allOut: true }, { team: 'A', runs: 151, balls: 94, wickets: 3 }),
      played('t2', { team: 'B', runs: 180, balls: 120, wickets: 6 }, { team: 'C', runs: 138, balls: 90, wickets: 4, allotted: 90, target: 141, revised: true }),
      played('t3', { team: 'D', runs: 170, balls: 120, wickets: 7 }, { team: 'A', runs: 131, balls: 86, wickets: 2, allotted: 86, target: 111, revised: true, completion: 'terminated' }),
      played('t4', { team: 'D', runs: 99, balls: 77, allOut: true }, { team: 'B', runs: 70, balls: 100, allOut: true }),
    ];
    const agg = [...aggregateNrr(summaries, ['A', 'B', 'C', 'D'], ICC).values()];
    const sum = (pick: (entry: (typeof agg)[number]) => number) => agg.reduce((total, entry) => total + pick(entry), 0);
    expect(sum((e) => e.runsFor)).toBe(sum((e) => e.runsAgainst));
    expect(sum((e) => e.oversFor)).toBeCloseTo(sum((e) => e.oversAgainst), 9);
  });

  it('computeNrr and compareNrr edge cases', () => {
    expect(computeNrr(180, 20, 160, 20)).toBeCloseTo(1, 12);
    expect(computeNrr(0, 10, 0, 10)).toBe(0);
    expect(computeNrr(60, 8, 0, 0)).toBeNull();
    expect(computeNrr(0, 0, 50, 5)).toBeNull();
    expect(compareNrr(null, null)).toBe(0);
    expect(compareNrr(-3, null)).toBeLessThan(0);
    expect(compareNrr(null, -3)).toBeGreaterThan(0);
    expect(compareNrr(1, 1 + 5e-10)).toBe(0);
    expect(compareNrr(1, 1 + 2e-9)).toBeGreaterThan(0);
    expect(compareNrr(-0.2, -0.1)).toBeGreaterThan(0);
  });
});

describe('Points for every result type', () => {
  it('custom points (4/2/1/0, abandoned 3, walkover 5/-1): each result type lands in the right column', () => {
    const decidedTie = duel('p8', 'T15', 150, 'T16', 150, {
      result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'T16', superOverRounds: 1 } },
    });
    const results = [
      duel('p1', 'T1', 160, 'T2', 150),
      duel('p2', 'T3', 150, 'T4', 150),
      noResultMatch('p3', 'T5', 'T6'),
      abandonedMatch('p4', 'T7', 'T8'),
      walkoverMatch('p5', 'T9', 'T10', 'T9'),
      summaryOf('p6', 'T11', 'T12', { type: 'awarded', winnerTeamId: 'T11', loserTeamId: 'T12', reason: 'Conceded', margin: null }, []),
      summaryOf('p7', 'T13', 'T14', { type: 'awarded', winnerTeamId: null, loserTeamId: null, reason: 'Misconduct', margin: null }, []),
      decidedTie,
    ];
    const teams = Array.from({ length: 16 }, (_, index) => `T${index + 1}`);
    const t = table({
      teams,
      results,
      points: { win: 4, tie: 2, noResult: 1, loss: 0, abandoned: 3, walkoverWin: 5, walkoverLoss: -1, superOverDecidedTie: 'win_loss' },
    });
    expect(rowOf(t, 'T1')).toMatchObject({ points: 4, won: 1, played: 1, form: ['W'] });
    expect(rowOf(t, 'T2')).toMatchObject({ points: 0, lost: 1, form: ['L'] });
    expect(rowOf(t, 'T3')).toMatchObject({ points: 2, tied: 1, form: ['T'] });
    expect(rowOf(t, 'T5')).toMatchObject({ points: 1, noResult: 1, played: 1, form: ['N'] });
    expect(rowOf(t, 'T7')).toMatchObject({ points: 3, noResult: 1, played: 1, form: ['N'] });
    expect(rowOf(t, 'T8')).toMatchObject({ points: 3, noResult: 1 });
    expect(rowOf(t, 'T9')).toMatchObject({ points: 5, won: 1, played: 1, form: ['W'] });
    expect(rowOf(t, 'T10')).toMatchObject({ points: -1, lost: 1, played: 1, form: ['L'] });
    expect(rowOf(t, 'T11')).toMatchObject({ points: 4, won: 1 });
    expect(rowOf(t, 'T12')).toMatchObject({ points: 0, lost: 1 });
    expect(rowOf(t, 'T13')).toMatchObject({ points: 1, noResult: 1, won: 0, form: ['N'] });
    expect(rowOf(t, 'T15')).toMatchObject({ points: 0, lost: 1, tied: 0, form: ['L'] });
    expect(rowOf(t, 'T16')).toMatchObject({ points: 4, won: 1, tied: 0, form: ['W'] });
    expect(t.rows[t.rows.length - 1].teamId).toBe('T10');
    expect(t.rows[0].teamId).toBe('T9');
  });

  it('superOverDecidedTie tie: a decided tie scores tie points and T for both sides', () => {
    const m = duel('p9', 'A', 150, 'B', 150, {
      result: { type: 'tie', decider: { method: 'boundary_count', winnerTeamId: 'A', superOverRounds: 1 } },
    });
    const t = table({ teams: ['A', 'B'], results: [m], points: { superOverDecidedTie: 'tie' } });
    expect(rowOf(t, 'A')).toMatchObject({ points: 1, tied: 1, won: 0, form: ['T'] });
    expect(rowOf(t, 'B')).toMatchObject({ points: 1, tied: 1, lost: 0, form: ['T'] });
  });
});

describe('Bonus point uses the match NRR contributions', () => {
  const bonus = (ratio: number) => ({ bonus: { kind: 'run_rate_ratio' as const, ratio, points: 1 } });

  it('loser bowled out in 15 overs: icc full quota earns the bonus (10.0 >= 1.25 x 7.5), actual_overs does not (10.0 < 12.5)', () => {
    const m = played('bp1', { team: 'A', runs: 200, balls: 120, wickets: 5 }, { team: 'B', runs: 150, balls: 90, allOut: true });
    const icc = table({ teams: ['A', 'B'], results: [m], points: bonus(1.25) });
    expect(rowOf(icc, 'A')).toMatchObject({ points: 3, bonusPoints: 1 });
    const actual = table({ teams: ['A', 'B'], results: [m], points: bonus(1.25), nrr: { mode: 'actual_overs' } });
    expect(rowOf(actual, 'A')).toMatchObject({ points: 2, bonusPoints: 0 });
  });

  it('winner run rate exactly equal to ratio x loser run rate earns the bonus (7.5 >= 1.25 x 6.0)', () => {
    const m = duel('bp2', 'A', 150, 'B', 120);
    expect(rowOf(table({ teams: ['A', 'B'], results: [m], points: bonus(1.25) }), 'A')).toMatchObject({ points: 3, bonusPoints: 1 });
    expect(rowOf(table({ teams: ['A', 'B'], results: [m], points: bonus(1.26) }), 'A')).toMatchObject({ points: 2, bonusPoints: 0 });
  });

  it('a chasing winner (team B) earns the bonus from its actual balls (141 off 13 overs = 10.846 v 7.0)', () => {
    const m = played('bp3', { team: 'A', runs: 140, balls: 120, wickets: 9 }, { team: 'B', runs: 141, balls: 78, wickets: 3 });
    const t = table({ teams: ['A', 'B'], results: [m], points: bonus(1.5) });
    expect(rowOf(t, 'B')).toMatchObject({ points: 3, bonusPoints: 1 });
    expect(rowOf(t, 'A')).toMatchObject({ points: 0, bonusPoints: 0 });
    expect(rowOf(table({ teams: ['A', 'B'], results: [m], points: bonus(1.6) }), 'B')).toMatchObject({ points: 2, bonusPoints: 0 });
  });

  it('revised target: icc_par credit decides the bonus (9.333 v 6.667 = 1.40 earns ratio 1.38; actual 9.0 v 6.667 = 1.35 does not)', () => {
    const m = played(
      'bp4',
      { team: 'A', runs: 180, balls: 120, wickets: 6 },
      { team: 'B', runs: 100, balls: 72, allOut: true, allotted: 90, target: 141, revised: true },
    );
    expect(rowOf(table({ teams: ['A', 'B'], results: [m], points: bonus(1.38) }), 'A')).toMatchObject({ points: 3, bonusPoints: 1 });
    expect(
      rowOf(table({ teams: ['A', 'B'], results: [m], points: bonus(1.38), nrr: { revisedTarget: 'actual' } }), 'A'),
    ).toMatchObject({ points: 2, bonusPoints: 0 });
  });

  it('no bonus for walkovers, awarded wins or super-over decided ties even when the run-rate ratio is met', () => {
    const awarded = summaryOf(
      'bp5',
      'A',
      'B',
      { type: 'awarded', winnerTeamId: 'A', loserTeamId: 'B', reason: 'Conceded', margin: null },
      [
        inningsOf(0, { team: 'A', runs: 200, balls: 120, wickets: 3 }, 'B', 6, 120, null),
        inningsOf(1, { team: 'B', runs: 50, balls: 60, wickets: 2, completion: 'match_ended' }, 'A', 6, 120, 201),
      ],
    );
    expect(rowOf(table({ teams: ['A', 'B'], results: [awarded], points: bonus(1.0), nrr: { awarded: 'use_played_innings' } }), 'A')).toMatchObject({
      points: 2,
      bonusPoints: 0,
    });
    expect(rowOf(table({ teams: ['A', 'B'], results: [walkoverMatch('bp6', 'A', 'B', 'A')], points: bonus(1.0) }), 'A')).toMatchObject({
      points: 2,
      bonusPoints: 0,
    });
    const decided = duel('bp7', 'A', 150, 'B', 150, {
      result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'A', superOverRounds: 1 } },
    });
    expect(rowOf(table({ teams: ['A', 'B'], results: [decided], points: bonus(1.0) }), 'A')).toMatchObject({ points: 2, bonusPoints: 0 });
  });
});

describe('Standings rows: overs, run rate, NRR, played and remaining', () => {
  it('mixed-format rows: overs faced/bowled are decimal overs per match, run rate and NRR from them', () => {
    const results = [
      played('mx1', { team: 'A', runs: 100, balls: 80, wickets: 8 }, { team: 'B', runs: 90, balls: 50, allOut: true }, { bpo: 8, allotted: 80 }),
      played('mx2', { team: 'B', runs: 60, balls: 50, wickets: 5 }, { team: 'A', runs: 61, balls: 35, wickets: 2 }, { bpo: 5, allotted: 50 }),
      duel('mx3', 'A', 120, 'B', 100),
    ];
    const t = table({ teams: ['A', 'B'], results });
    const a = rowOf(t, 'A');
    expect(a).toMatchObject({ played: 3, won: 3, runsScored: 281, runsConceded: 250 });
    expect(a.oversFaced).toBeCloseTo(37, 9);
    expect(a.oversBowled).toBeCloseTo(40, 9);
    expect(a.runRate).toBeCloseTo(281 / 37, 9);
    expect(a.nrr).toBeCloseTo(1.344595, 6);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(-1.344595, 6);
  });

  it('all-out side: ballsFaced and run rate use the full quota (5.00 per over), chase uses actual balls', () => {
    const m = played('ao1', { team: 'A', runs: 100, balls: 90, allOut: true }, { team: 'B', runs: 101, balls: 60, wickets: 2 });
    const t = table({ teams: ['A', 'B'], results: [m] });
    const a = rowOf(t, 'A');
    expect(a).toMatchObject({ ballsFaced: 120, ballsBowled: 60 });
    expect(a.oversFaced).toBeCloseTo(20, 9);
    expect(a.runRate).toBeCloseTo(5, 9);
    expect(a.nrr).toBeCloseTo(-5.1, 9);
    expect(rowOf(t, 'B').runRate).toBeCloseTo(10.1, 9);
  });

  it('super-over runs never reach runsScored in the table', () => {
    const superOvers = [
      inningsOf(2, { team: 'A', runs: 20, balls: 6, wickets: 0 }, 'B', 6, 6, null),
      inningsOf(3, { team: 'B', runs: 5, balls: 6, wickets: 1 }, 'A', 6, 6, 21),
    ];
    const m = duel('so1', 'A', 150, 'B', 150, {
      superOvers,
      result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'A', superOverRounds: 1 } },
    });
    const t = table({ teams: ['A', 'B'], results: [m] });
    expect(rowOf(t, 'A')).toMatchObject({ runsScored: 150, runsConceded: 150, ballsFaced: 120 });
    expect(rowOf(t, 'A').nrr).toBeCloseTo(0, 9);
  });

  it('EC-Q-18 a team with only no results has NRR null and ranks below a negative NRR on equal points', () => {
    const results = [noResultMatch('nr1', 'A', 'B'), played('nr2', { team: 'C', runs: 150, balls: 120, wickets: 6 }, { team: 'D', runs: 150, balls: 100, allOut: true })];
    const actual = table({ teams: ['A', 'B', 'C', 'D'], results, nrr: { mode: 'actual_overs' }, chain: ['points', 'nrr', 'wins'] });
    expect(orderOf(actual)).toEqual(['D', 'C', 'A', 'B']);
    expect(positionsOf(actual)).toEqual([1, 2, 3, 3]);
    expect(rowOf(actual, 'C').nrr).toBeCloseTo(-1.5, 9);
    expect(rowOf(actual, 'A').nrr).toBeNull();
    expect(rowOf(actual, 'A')).toMatchObject({ played: 1, noResult: 1, points: 1, sharedPosition: true });
    const icc = table({ teams: ['A', 'B', 'C', 'D'], results, chain: ['points', 'nrr', 'wins'] });
    expect(orderOf(icc)).toEqual(['C', 'D', 'A', 'B']);
    expect(positionsOf(icc)).toEqual([1, 1, 3, 3]);
  });

  it('a walkover winner (NRR null) ranks below a winner with a NEGATIVE NRR under revisedTarget actual (-0.200)', () => {
    const results = [
      played('wk1', { team: 'A', runs: 180, balls: 120, wickets: 6 }, { team: 'B', runs: 138, balls: 90, wickets: 4, allotted: 90, target: 141, revised: true }),
      walkoverMatch('wk2', 'W', 'L', 'W'),
    ];
    const t = table({ teams: ['W', 'L', 'A', 'B'], results, nrr: { revisedTarget: 'actual' }, chain: ['points', 'nrr'] });
    expect(orderOf(t)).toEqual(['A', 'W', 'B', 'L']);
    expect(rowOf(t, 'A').nrr).toBeCloseTo(-0.2, 9);
    expect(rowOf(t, 'W')).toMatchObject({ played: 1, won: 1, points: 2, nrr: null, runsScored: 0 });
    const par = table({ teams: ['W', 'L', 'A', 'B'], results, chain: ['points', 'nrr'] });
    expect(rowOf(par, 'A').nrr).toBeCloseTo(0.133333, 6);
  });

  it('only the fixture\'s CURRENT match counts: rescheduled (cleared) and live fixtures are not played but remain; cancelled neither', () => {
    const counted = duel('cur1', 'A', 160, 'B', 150);
    const stale = duel('old1', 'C', 200, 'A', 100);
    const extraFixtures = [
      fixtureOf('f-res', 2, 'A', 'C', null, 'rescheduled', 'pA'),
      fixtureOf('f-can', 3, 'B', 'C', null, 'cancelled', 'pA'),
      fixtureOf('f-live', 4, 'B', 'C', 'live1', 'live', 'pA'),
    ];
    const t = table({ teams: ['A', 'B', 'C'], results: [counted], extraFixtures, extraSummaries: [stale] });
    expect(rowOf(t, 'A')).toMatchObject({ played: 1, won: 1, points: 2, runsConceded: 150, matchesRemaining: 1 });
    expect(rowOf(t, 'B')).toMatchObject({ played: 1, matchesRemaining: 1 });
    expect(rowOf(t, 'C')).toMatchObject({ played: 0, points: 0, runsScored: 0, matchesRemaining: 2, nrr: null });
    expect(t.complete).toBe(false);
  });

  it('postponed fixtures remain; a cancelled one does not block completeness', () => {
    const results = [duel('pp1', 'A', 160, 'B', 150), duel('pp2', 'B', 160, 'C', 150)];
    const cancelledOnly = table({ teams: ['A', 'B', 'C'], results, extraFixtures: [fixtureOf('f-c', 3, 'A', 'C', null, 'cancelled', 'pA')] });
    expect(cancelledOnly.complete).toBe(true);
    expect(rowOf(cancelledOnly, 'A').matchesRemaining).toBe(0);
    const postponed = table({ teams: ['A', 'B', 'C'], results, extraFixtures: [fixtureOf('f-p', 3, 'A', 'C', null, 'postponed', 'pA')] });
    expect(postponed.complete).toBe(false);
    expect(rowOf(postponed, 'A').matchesRemaining).toBe(1);
    expect(rowOf(postponed, 'C').matchesRemaining).toBe(1);
  });

  it('an awarded win scores W/L points but its innings stay out of runs and NRR under the default config', () => {
    const awarded = summaryOf(
      'aw1',
      'A',
      'B',
      { type: 'awarded', winnerTeamId: 'A', loserTeamId: 'B', reason: 'Conceded', margin: null },
      [
        inningsOf(0, { team: 'A', runs: 200, balls: 120, wickets: 3 }, 'B', 6, 120, null),
        inningsOf(1, { team: 'B', runs: 50, balls: 60, wickets: 2, completion: 'match_ended' }, 'A', 6, 120, 201),
      ],
    );
    const t = table({ teams: ['A', 'B'], results: [awarded] });
    expect(rowOf(t, 'A')).toMatchObject({ played: 1, won: 1, points: 2, runsScored: 0, ballsFaced: 0, nrr: null, runRate: null });
    expect(rowOf(t, 'B')).toMatchObject({ played: 1, lost: 1, points: 0, runsScored: 0 });
  });

  it('keep_for_opponents: the replaced team keeps its own row with its result; the replacement starts at zero', () => {
    const t = table({
      teams: [member('X', { membership: 'replaced' }), member('Y'), 'A'],
      results: [duel('kp1', 'X', 160, 'A', 150)],
    });
    expect(rowOf(t, 'X')).toMatchObject({ membership: 'replaced', played: 1, won: 1, points: 2 });
    expect(rowOf(t, 'A')).toMatchObject({ played: 1, lost: 1 });
    expect(rowOf(t, 'A').nrr).toBeCloseTo(-0.5, 9);
    expect(rowOf(t, 'Y')).toMatchObject({ played: 0, points: 0, nrr: null });
  });

  it('a points penalty applies before any match is played', () => {
    const t = table({ teams: ['A', 'B'], results: [], pending: [['A', 'B']], overrides: [adjustment('pen', 'B', -2)] });
    expect(rowOf(t, 'B')).toMatchObject({ played: 0, points: -2, pointsAdjustment: -2, matchesRemaining: 1 });
    expect(orderOf(t)).toEqual(['A', 'B']);
  });

  it('form is the last five counted results ordered by completedAt then match number, most recent last', () => {
    const dated = (day: number) => `2026-06-0${day}T18:00:00.000Z`;
    const results = [
      duel('fm1', 'A', 160, 'B', 150, { completedAt: dated(6) }),
      duel('fm2', 'B', 160, 'A', 150, { completedAt: dated(5) }),
      duel('fm3', 'A', 150, 'B', 150, { completedAt: dated(4) }),
      noResultMatch('fm4', 'A', 'B', [], { completedAt: dated(3) }),
      duel('fm5', 'A', 160, 'B', 150, { completedAt: dated(2) }),
      duel('fm6', 'B', 160, 'A', 150, { completedAt: dated(1) }),
    ];
    const t = table({ teams: ['A', 'B'], results });
    expect(rowOf(t, 'A').form).toEqual(['W', 'N', 'T', 'L', 'W']);
    expect(rowOf(t, 'B').form).toEqual(['L', 'N', 'T', 'W', 'L']);
    const sameDay = results.map((summary) => ({ ...summary, completedAt: dated(1) }));
    expect(rowOf(table({ teams: ['A', 'B'], results: sameDay }), 'A').form).toEqual(['L', 'T', 'N', 'W', 'L']);
  });
});

describe('Manual overrides in tables', () => {
  const cycle = [duel('c1', 'A', 160, 'B', 150), duel('c2', 'B', 160, 'C', 150), duel('c3', 'C', 160, 'A', 150)];

  it('a perfect three-way cycle with equal NRR and no override shares first place for all three', () => {
    const t = table({ teams: ['A', 'B', 'C'], results: cycle });
    expect(positionsOf(t)).toEqual([1, 1, 1]);
    expect(orderOf(t)).toEqual(['A', 'B', 'C']);
    expect(t.rows.every((row) => row.sharedPosition)).toBe(true);
    expect(t.unresolvedTies).toEqual([]);
    expect(t.provisionalTies.map((group) => [...group].sort())).toEqual([['A', 'B', 'C']]);
  });

  it('points adjustments: active ones for this stage and pool (or pool null) sum; revoked, other-pool and other-stage ones are ignored', () => {
    const overrides = [
      adjustment('o1', 'A', -2),
      adjustment('o2', 'A', 1, { poolId: null }),
      adjustment('o3', 'A', -5, { revoked: true }),
      adjustment('o4', 'B', -1, { poolId: 'pB' }),
      adjustment('o5', 'B', 1),
      adjustment('o6', 'C', -3, { stageId: 'other' }),
    ];
    const t = table({ teams: ['A', 'B', 'C'], results: cycle, overrides });
    expect(rowOf(t, 'A')).toMatchObject({ points: 1, pointsAdjustment: -1 });
    expect(rowOf(t, 'B')).toMatchObject({ points: 3, pointsAdjustment: 1 });
    expect(rowOf(t, 'C')).toMatchObject({ points: 2, pointsAdjustment: 0 });
    expect(orderOf(t)).toEqual(['B', 'C', 'A']);
  });

  const expungeResults = [duel('e1', 'A', 180, 'C', 120), duel('e2', 'C', 170, 'B', 160), duel('e3', 'A', 150, 'B', 150), duel('e4', 'B', 160, 'D', 150)];

  it('expunge_results removes every result of the team for all rows, including runs and NRR', () => {
    const t = table({ teams: ['A', 'B', 'C', 'D'], results: expungeResults, overrides: [expunge('x', 'C', 'groups')] });
    expect(rowOf(t, 'A')).toMatchObject({ played: 1, won: 0, tied: 1, points: 1, runsScored: 150, runsConceded: 150 });
    expect(rowOf(t, 'A').nrr).toBeCloseTo(0, 9);
    expect(rowOf(t, 'B')).toMatchObject({ played: 2, won: 1, lost: 0, tied: 1, points: 3 });
    expect(rowOf(t, 'B').nrr).toBeCloseTo(0.25, 9);
    expect(rowOf(t, 'C')).toMatchObject({ played: 0, points: 0, nrr: null, runsScored: 0 });
    expect(rowOf(t, 'D').nrr).toBeCloseTo(-0.5, 9);
    expect(orderOf(t)).toEqual(['B', 'A', 'D', 'C']);
    const global = table({ teams: ['A', 'B', 'C', 'D'], results: expungeResults, overrides: [expunge('x', 'C', null)] });
    expect(orderOf(global)).toEqual(['B', 'A', 'D', 'C']);
  });

  it('expunge overrides for another stage or revoked ones change nothing', () => {
    for (const override of [expunge('x', 'C', 'other'), expunge('x', 'C', 'groups', true)]) {
      const t = table({ teams: ['A', 'B', 'C', 'D'], results: expungeResults, overrides: [override] });
      expect(orderOf(t)).toEqual(['A', 'B', 'C', 'D']);
      expect(rowOf(t, 'A').nrr).toBeCloseTo(1.5, 9);
      expect(rowOf(t, 'C')).toMatchObject({ played: 2, points: 2 });
      expect(rowOf(t, 'C').nrr).toBeCloseTo(-1.25, 9);
    }
  });

  it('transfer_to_replacement: the replacement row aggregates the predecessor\'s results (points, runs, NRR) and X has no row', () => {
    const results = [duel('h1', 'A', 160, 'X', 150), duel('h2', 'Y', 170, 'B', 150), duel('h3', 'A', 160, 'B', 150)];
    const t = table({ teams: [member('Y', { inheritsFrom: ['X'] }), 'A', 'B'], results });
    expect(t.rows).toHaveLength(3);
    expect(t.rows.some((row) => row.teamId === 'X')).toBe(false);
    expect(rowOf(t, 'Y')).toMatchObject({ played: 2, won: 1, lost: 1, points: 2, runsScored: 320, runsConceded: 310 });
    expect(rowOf(t, 'Y').nrr).toBeCloseTo(0.25, 9);
    expect(rowOf(t, 'A').nrr).toBeCloseTo(0.5, 9);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(-0.75, 9);
    expect(orderOf(t)).toEqual(['A', 'Y', 'B']);
  });
});

describe('Tie-breaker chains end to end', () => {
  const twoTeamH2h = [
    duel('t1', 'B', 150, 'A', 140),
    duel('t2', 'A', 200, 'C', 100),
    duel('t3', 'A', 200, 'D', 100),
    duel('t4', 'C', 150, 'B', 140),
    duel('t5', 'B', 160, 'D', 150),
    duel('t6', 'D', 150, 'C', 140),
  ];

  it('two-team head-to-head outranks a much better NRR when listed first; equal NRRs (-1.667) fall through to H2H', () => {
    const h2hFirst = table({ teams: ['A', 'B', 'C', 'D'], results: twoTeamH2h, chain: ['points', 'head_to_head', 'nrr'] });
    expect(orderOf(h2hFirst)).toEqual(['B', 'A', 'D', 'C']);
    expect(rowOf(h2hFirst, 'B').tieBreak?.separatedBy).toBe('head_to_head');
    expect(rowOf(h2hFirst, 'A').nrr).toBeCloseTo(3.166667, 6);
    const nrrFirst = table({ teams: ['A', 'B', 'C', 'D'], results: twoTeamH2h, chain: ['points', 'nrr', 'head_to_head'] });
    expect(orderOf(nrrFirst)).toEqual(['A', 'B', 'D', 'C']);
    expect(rowOf(nrrFirst, 'C').nrr).toBeCloseTo(-1.666667, 6);
    expect(rowOf(nrrFirst, 'D').nrr).toBeCloseTo(-1.666667, 6);
    expect(rowOf(nrrFirst, 'D').tieBreak?.separatedBy).toBe('head_to_head');
    expect(positionsOf(nrrFirst)).toEqual([1, 2, 3, 4]);
  });

  it('chain exhausted: level teams share the position and keep input (pool) order, not name order', () => {
    const forward = table({ teams: ['A', 'B', 'C', 'D'], results: twoTeamH2h, chain: ['points', 'nrr'] });
    expect(orderOf(forward)).toEqual(['A', 'B', 'C', 'D']);
    expect(positionsOf(forward)).toEqual([1, 2, 3, 3]);
    expect(rowOf(forward, 'C').sharedPosition).toBe(true);
    const reversed = table({ teams: ['D', 'C', 'B', 'A'], results: twoTeamH2h, chain: ['points', 'nrr'] });
    expect(orderOf(reversed)).toEqual(['A', 'B', 'D', 'C']);
    expect(positionsOf(reversed)).toEqual([1, 2, 3, 3]);
  });

  const cycleWithBottom = [
    duel('u1', 'A', 160, 'B', 150),
    duel('u2', 'B', 160, 'C', 150),
    duel('u3', 'C', 160, 'A', 150),
    duel('u4', 'A', 200, 'D', 100),
    duel('u5', 'B', 180, 'D', 100),
    duel('u6', 'C', 180, 'D', 100),
  ];

  it('subgroup recompute: after NRR separates A, head-to-head is a TWO-team mini-league of {B, C} (B beat C)', () => {
    const t = table({ teams: ['A', 'B', 'C', 'D'], results: cycleWithBottom, chain: ['points', 'nrr', 'head_to_head'] });
    expect(orderOf(t)).toEqual(['A', 'B', 'C', 'D']);
    expect(positionsOf(t)).toEqual([1, 2, 3, 4]);
    expect(rowOf(t, 'A').nrr).toBeCloseTo(1.666667, 6);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(1.333333, 6);
    expect(rowOf(t, 'A').tieBreak).toMatchObject({ separatedBy: 'nrr', detail: 'Ahead of Blues on net run rate (+1.667 vs +1.333)' });
    expect(rowOf(t, 'B').tieBreak?.separatedBy).toBe('head_to_head');
    expect(rowOf(t, 'B').sharedPosition).toBe(false);
  });

  it('no restart: with head-to-head first the three-team cycle stays level, NRR separates A, B and C remain shared', () => {
    const t = table({ teams: ['A', 'B', 'C', 'D'], results: cycleWithBottom, chain: ['points', 'head_to_head', 'nrr'] });
    expect(orderOf(t)).toEqual(['A', 'B', 'C', 'D']);
    expect(positionsOf(t)).toEqual([1, 2, 2, 4]);
    expect(rowOf(t, 'A').tieBreak?.separatedBy).toBe('nrr');
    expect(t.provisionalTies.map((group) => [...group].sort())).toEqual([['B', 'C']]);
  });

  const incomplete = [
    duel('v1', 'A', 150, 'B', 145),
    duel('v2', 'C', 150, 'A', 145),
    duel('v3', 'D', 150, 'A', 140),
    duel('v4', 'B', 200, 'D', 100),
    duel('v5', 'D', 150, 'C', 145),
  ];

  it('incomplete mini-league used when the flag is off: C, A on H2H then NRR, B last of the three', () => {
    const t = table({ teams: ['A', 'B', 'C', 'D'], results: incomplete, pending: [['B', 'C']], chain: ['points', 'head_to_head', 'nrr'] });
    expect(orderOf(t)).toEqual(['D', 'C', 'A', 'B']);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(2.375, 9);
    expect(rowOf(t, 'A').nrr).toBeCloseTo(-0.166667, 6);
    expect(rowOf(t, 'D').nrr).toBeCloseTo(-1.416667, 6);
    expect(rowOf(t, 'B')).toMatchObject({ matchesRemaining: 1, played: 2 });
    expect(t.complete).toBe(false);
  });

  it('headToHeadRequiresCompleteMiniLeague skips H2H for an incomplete mini-league: NRR orders B, C, A', () => {
    const t = table({
      teams: ['A', 'B', 'C', 'D'],
      results: incomplete,
      pending: [['B', 'C']],
      chain: ['points', 'head_to_head', 'nrr'],
      requireComplete: true,
    });
    expect(orderOf(t)).toEqual(['D', 'B', 'C', 'A']);
    expect(rowOf(t, 'B').tieBreak?.separatedBy).toBe('nrr');
    expect(rowOf(t, 'B').tieBreak?.detail).toMatch(
      /^Head-to-head not used: (Blues v Cats|Cats v Blues) was not completed\. Ahead (of Cats )?on net run rate \(\+2\.375 vs 0\.000\)$/,
    );
  });

  it('a super-over decided tie scores W/L inside the head-to-head mini-league under win_loss (B above A despite NRR)', () => {
    const results = [
      duel('g1', 'A', 150, 'B', 150, { result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'B', superOverRounds: 1 } } }),
      duel('g2', 'A', 200, 'C', 100),
      duel('g3', 'A', 200, 'D', 100),
      duel('g4', 'B', 160, 'C', 150),
      duel('g5', 'D', 160, 'B', 150),
    ];
    const t = table({ teams: ['A', 'B', 'C', 'D'], results, chain: ['points', 'head_to_head', 'nrr'] });
    expect([rowOf(t, 'A').points, rowOf(t, 'B').points]).toEqual([4, 4]);
    expect(rowOf(t, 'A').nrr).toBeCloseTo(3.333333, 6);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(0, 9);
    expect(orderOf(t).slice(0, 2)).toEqual(['B', 'A']);
    expect(rowOf(t, 'B').tieBreak?.separatedBy).toBe('head_to_head');
  });

  it('head-to-head credits a predecessor\'s result to the inheriting row (Y inherits X, X beat A)', () => {
    const results = [duel('i1', 'X', 151, 'A', 150), duel('i2', 'A', 250, 'C', 100), duel('i3', 'B', 200, 'Y', 100), duel('i4', 'B', 151, 'A', 150)];
    const teams = [member('Y', { inheritsFrom: ['X'] }), 'A', 'B', 'C'];
    const h2h = table({ teams, results, chain: ['points', 'head_to_head', 'nrr'] });
    expect(rowOf(h2h, 'Y')).toMatchObject({ points: 2, played: 2 });
    expect(rowOf(h2h, 'A')).toMatchObject({ points: 2, played: 3 });
    expect(rowOf(h2h, 'Y').nrr).toBeCloseTo(-2.475, 9);
    expect(rowOf(h2h, 'A').nrr).toBeCloseTo(2.466667, 6);
    expect(orderOf(h2h)).toEqual(['B', 'Y', 'A', 'C']);
    expect(orderOf(table({ teams, results, chain: ['points', 'nrr'] }))).toEqual(['B', 'A', 'Y', 'C']);
  });

  const ecq21 = [
    duel('w1', 'A', 160, 'B', 150),
    duel('w2', 'A', 160, 'C', 150),
    noResultMatch('w3', 'B', 'C'),
    duel('w4', 'D', 160, 'A', 150),
    duel('w5', 'E', 160, 'A', 150),
    duel('w6', 'B', 170, 'D', 150),
    noResultMatch('w7', 'B', 'E'),
    duel('w8', 'C', 200, 'E', 150),
    noResultMatch('w9', 'C', 'D'),
    duel('w10', 'D', 160, 'E', 150),
  ];

  it('EC-Q-21 A beat B and C, B v C no result: H2H lifts A (4 v 1 v 1), B and C then go to NRR', () => {
    const t = table({ teams: ['A', 'B', 'C', 'D', 'E'], results: ecq21, chain: ['points', 'head_to_head', 'nrr'] });
    expect(rowOf(t, 'D').points).toBe(5);
    expect(rowOf(t, 'B')).toMatchObject({ points: 4, played: 4, noResult: 2 });
    expect(rowOf(t, 'C').nrr).toBeCloseTo(1.0, 9);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(0.25, 9);
    expect(rowOf(t, 'E').nrr).toBeCloseTo(-0.833333, 6);
    expect(orderOf(t)).toEqual(['D', 'A', 'C', 'B', 'E']);
    expect(rowOf(t, 'A').tieBreak?.separatedBy).toBe('head_to_head');
    expect(rowOf(t, 'C').tieBreak?.separatedBy).toBe('nrr');
    const nrrFirst = table({ teams: ['A', 'B', 'C', 'D', 'E'], results: ecq21 });
    expect(orderOf(nrrFirst)).toEqual(['D', 'C', 'B', 'A', 'E']);
  });

  const repeated = [
    noResultMatch('y1', 'X', 'Y'),
    duel('y2', 'X', 160, 'Y', 150),
    noResultMatch('y3', 'X', 'Z'),
    duel('y4', 'Z', 160, 'X', 150),
    duel('y5', 'Y', 160, 'Z', 150),
    duel('y6', 'Y', 160, 'W', 150),
    duel('y7', 'Z', 250, 'W', 150),
    noResultMatch('y8', 'X', 'W'),
  ];
  const repeatedTable = (chain: readonly TieBreakerKind[], requireComplete = false) =>
    table({ teams: ['X', 'Y', 'Z', 'W'], results: repeated, chain, requireComplete });

  it('H2H with no-result points: X 4, Y 3, Z 3 in the mini-league; the residual pair goes to NRR (Z above Y)', () => {
    const t = repeatedTable(['points', 'head_to_head', 'nrr']);
    expect([rowOf(t, 'X').points, rowOf(t, 'Y').points, rowOf(t, 'Z').points]).toEqual([5, 5, 5]);
    expect(rowOf(t, 'Z').nrr).toBeCloseTo(1.666667, 6);
    expect(rowOf(t, 'Y').nrr).toBeCloseTo(0.166667, 6);
    expect(rowOf(t, 'X').nrr).toBeCloseTo(0, 9);
    expect(rowOf(t, 'W').nrr).toBeCloseTo(-2.75, 9);
    expect(orderOf(t)).toEqual(['X', 'Z', 'Y', 'W']);
  });

  it('head_to_head listed twice re-applies H2H to the residual pair (Y beat Z): X, Y, Z', () => {
    const t = repeatedTable(['points', 'head_to_head', 'head_to_head', 'nrr']);
    expect(orderOf(t)).toEqual(['X', 'Y', 'Z', 'W']);
    expect(rowOf(t, 'X').tieBreak?.separatedBy).toBe('head_to_head');
    expect(rowOf(t, 'Y').tieBreak?.separatedBy).toBe('head_to_head');
    expect(orderOf(repeatedTable(['points', 'head_to_head', 'head_to_head', 'nrr'], true))).toEqual(['X', 'Y', 'Z', 'W']);
  });

  it('head_to_head_wins ignores no-result points: 1 win each, NRR decides Z, Y, X', () => {
    expect(orderOf(repeatedTable(['points', 'head_to_head_wins', 'nrr']))).toEqual(['Z', 'Y', 'X', 'W']);
    expect(orderOf(repeatedTable(['points', 'nrr']))).toEqual(['Z', 'Y', 'X', 'W']);
  });

  const doubleRoundRobin = [duel('z1', 'A', 180, 'B', 150), duel('z2', 'B', 160, 'A', 150), duel('z3', 'A', 151, 'C', 150), duel('z4', 'B', 250, 'C', 150)];

  it('head_to_head_nrr uses only the mutual matches (A +0.500) even though overall NRR favours B (+1.333 v +0.350)', () => {
    const h2hNrr = table({ teams: ['A', 'B', 'C'], results: doubleRoundRobin, chain: ['points', 'head_to_head', 'head_to_head_nrr', 'nrr'] });
    expect(orderOf(h2hNrr)).toEqual(['A', 'B', 'C']);
    expect(rowOf(h2hNrr, 'A').tieBreak?.separatedBy).toBe('head_to_head_nrr');
    expect(rowOf(h2hNrr, 'A').nrr).toBeCloseTo(0.35, 9);
    expect(rowOf(h2hNrr, 'B').nrr).toBeCloseTo(1.333333, 6);
    expect(rowOf(h2hNrr, 'C').nrr).toBeCloseTo(-2.525, 9);
    expect(orderOf(table({ teams: ['A', 'B', 'C'], results: doubleRoundRobin, chain: ['points', 'head_to_head', 'nrr'] }))).toEqual(['B', 'A', 'C']);
    expect(orderOf(table({ teams: ['A', 'B', 'C'], results: doubleRoundRobin, chain: ['points', 'head_to_head_wins', 'nrr'] }))).toEqual(['B', 'A', 'C']);
  });

  const fullyLevel = [duel('q1', 'A', 150, 'B', 150), duel('q2', 'A', 160, 'C', 150), duel('q3', 'B', 160, 'C', 150)];

  it('fully level pair with no tie resolution shares first place and is only provisional from computeStandings', () => {
    const t = table({ teams: ['A', 'B', 'C'], results: fullyLevel });
    expect(rowOf(t, 'A').nrr).toBeCloseTo(0.25, 9);
    expect(rowOf(t, 'B').nrr).toBeCloseTo(0.25, 9);
    expect(positionsOf(t)).toEqual([1, 1, 3]);
    expect(t.unresolvedTies).toEqual([]);
    expect(t.provisionalTies.map((group) => [...group].sort())).toEqual([['A', 'B']]);
  });

  it('organizer decision override orders the exact level set and explains itself', () => {
    const t = table({ teams: ['A', 'B', 'C'], results: fullyLevel, overrides: [resolution('tr1', ['B', 'A'])] });
    expect(orderOf(t)).toEqual(['B', 'A', 'C']);
    expect(positionsOf(t)).toEqual([1, 2, 3]);
    expect(rowOf(t, 'B').tieBreak).toMatchObject({
      separatedBy: 'organizer_decision',
      detail: "Placed above Aces by organizer decision (Manual Override: 'Fair play record')",
    });
  });

  it('tie resolutions that are revoked, for another stage, or for a different team set are not applied', () => {
    for (const override of [
      resolution('tr2', ['B', 'A'], { revoked: true }),
      resolution('tr3', ['B', 'A'], { stageId: 'other' }),
      resolution('tr4', ['C', 'B', 'A']),
    ]) {
      const t = table({ teams: ['A', 'B', 'C'], results: fullyLevel, overrides: [override] });
      expect(positionsOf(t)).toEqual([1, 1, 3]);
      expect(orderOf(t)).toEqual(['A', 'B', 'C']);
    }
  });

  it('seed criterion from the table seeds: lower seed number first when everything else is level', () => {
    const t = table({ teams: ['A', 'B', 'C'], results: fullyLevel, chain: ['points', 'nrr', 'head_to_head', 'seed'], seeds: { A: 2, B: 1 } });
    expect(orderOf(t)).toEqual(['B', 'A', 'C']);
    expect(rowOf(t, 'B').tieBreak?.separatedBy).toBe('seed');
  });

  it('points adjustments level the table but never enter the head-to-head mini-league (A beat B stays decisive)', () => {
    const results = [duel('ad1', 'A', 151, 'B', 150), duel('ad2', 'B', 250, 'C', 100), duel('ad3', 'A', 151, 'C', 150)];
    const overrides = [adjustment('ad', 'A', -2)];
    const h2h = table({ teams: ['A', 'B', 'C'], results, overrides, chain: ['points', 'head_to_head', 'nrr'] });
    expect(rowOf(h2h, 'A')).toMatchObject({ points: 2, pointsAdjustment: -2 });
    expect(rowOf(h2h, 'A').nrr).toBeCloseTo(0.05, 9);
    expect(rowOf(h2h, 'B').nrr).toBeCloseTo(3.725, 9);
    expect(orderOf(h2h)).toEqual(['A', 'B', 'C']);
    expect(rowOf(h2h, 'A').tieBreak?.separatedBy).toBe('head_to_head');
    expect(orderOf(table({ teams: ['A', 'B', 'C'], results, overrides, chain: ['points', 'nrr'] }))).toEqual(['B', 'A', 'C']);
  });

  it('draw of lots override applies the recorded order and cites the seed', () => {
    const t = table({
      teams: ['A', 'B', 'C'],
      results: fullyLevel,
      chain: ['points', 'nrr', 'draw_lots'],
      overrides: [resolution('tr5', ['B', 'A'], { method: 'draw_lots', seed: 58213 })],
    });
    expect(orderOf(t)).toEqual(['B', 'A', 'C']);
    expect(rowOf(t, 'B').tieBreak).toMatchObject({ separatedBy: 'draw_lots', detail: 'Placed above Aces by draw of lots (seed 58213)' });
  });

  it('runs_scored counts NRR innings only: super-over runs are excluded (B 295 above A 290)', () => {
    const superOvers = [
      inningsOf(2, { team: 'A', runs: 20, balls: 6, wickets: 0 }, 'B', 6, 6, null),
      inningsOf(3, { team: 'B', runs: 5, balls: 6, wickets: 1 }, 'A', 6, 6, 21),
    ];
    const results = [
      duel('k1', 'A', 150, 'B', 150, { superOvers, result: { type: 'tie', decider: { method: 'super_over', winnerTeamId: 'A', superOverRounds: 1 } } }),
      duel('k2', 'A', 140, 'C', 130),
      duel('k3', 'B', 145, 'D', 130),
    ];
    const t = table({ teams: ['A', 'B', 'C', 'D'], results, points: { superOverDecidedTie: 'tie' }, chain: ['points', 'runs_scored'] });
    expect(rowOf(t, 'A')).toMatchObject({ points: 3, runsScored: 290 });
    expect(rowOf(t, 'B')).toMatchObject({ points: 3, runsScored: 295 });
    expect(orderOf(t)).toEqual(['B', 'A', 'C', 'D']);
    expect(positionsOf(t)).toEqual([1, 2, 3, 3]);
  });

  it('wickets_taken counts NRR-counted innings only: a no-result haul counts only with includeNoResult', () => {
    const results = [
      played('j1', { team: 'A', runs: 160, balls: 120, wickets: 3 }, { team: 'C', runs: 150, balls: 120, wickets: 9 }),
      played('j2', { team: 'B', runs: 160, balls: 120, wickets: 3 }, { team: 'D', runs: 150, balls: 120, wickets: 5 }),
      noResultMatch('j3', 'B', 'C', [inningsOf(0, { team: 'C', runs: 50, balls: 60, wickets: 8, completion: 'match_ended' }, 'B', 6, 120, null)]),
      noResultMatch('j4', 'A', 'D', [inningsOf(0, { team: 'D', runs: 20, balls: 12, wickets: 0, completion: 'match_ended' }, 'A', 6, 120, null)]),
    ];
    const excluded = table({ teams: ['A', 'B', 'C', 'D'], results, chain: ['points', 'wickets_taken'] });
    expect(orderOf(excluded).slice(0, 2)).toEqual(['A', 'B']);
    expect(rowOf(excluded, 'A').points).toBe(3);
    const included = table({ teams: ['A', 'B', 'C', 'D'], results, chain: ['points', 'wickets_taken'], nrr: { includeNoResult: true } });
    expect(orderOf(included).slice(0, 2)).toEqual(['B', 'A']);
  });
});

describe('rankTeams directly', () => {
  const rec = (teamId: TeamId, patch: Partial<TeamRecord> = {}): TeamRecord => ({
    teamId,
    points: 0,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    noResult: 0,
    nrr: null,
    runsScored: 0,
    wicketsTaken: 0,
    seed: null,
    name: NAMES[teamId] ?? teamId,
    ...patch,
  });
  const emptyCtx = (resolutions: readonly TieResolution[] = [], mutual: readonly (readonly [TeamId, TeamId])[] = []): RankContext => ({
    headToHead: (teamIds) => {
      const set = new Set(teamIds);
      const records = new Map<TeamId, HeadToHeadRecord>();
      for (const id of teamIds) {
        const wins = mutual.filter(([winner, loser]) => winner === id && set.has(loser)).length;
        const games = mutual.filter(([winner, loser]) => (winner === id && set.has(loser)) || (loser === id && set.has(winner))).length;
        records.set(id, { points: wins * 2, wins, matchesPlayed: games, nrr: null });
      }
      const complete = teamIds.every((a, i) =>
        teamIds.slice(i + 1).every((b) => mutual.some(([w, l]) => (w === a && l === b) || (w === b && l === a))),
      );
      return { records, complete };
    },
    headToHeadRequiresCompleteMiniLeague: false,
    resolutions,
  });

  it('shared positions use competition ranking (1, 2, 2, 4, 4), never dense ranking', () => {
    const ranked = rankTeams([rec('A', { points: 6 }), rec('B', { points: 4 }), rec('C', { points: 4 }), rec('D', { points: 2 }), rec('E', { points: 2 })], ['points'], emptyCtx());
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 2, 4, 4]);
    expect(ranked.map((r) => r.shared)).toEqual([false, true, true, true, true]);
  });

  it('seed: lower seed first, unseeded teams last and still level among themselves in input order', () => {
    const ranked = rankTeams(
      [rec('C', { points: 2 }), rec('A', { points: 2, seed: 3 }), rec('D', { points: 2 }), rec('B', { points: 2, seed: 1 })],
      ['points', 'seed'],
      emptyCtx(),
    );
    expect(ranked.map((r) => r.teamId)).toEqual(['B', 'A', 'C', 'D']);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3, 3]);
    expect(ranked[0].separatedBy).toBe('seed');
  });

  it('wins, fewer_losses, runs_scored and wickets_taken each separate in the documented direction', () => {
    const base = [rec('A', { points: 4, won: 1, lost: 2, runsScored: 300, wicketsTaken: 20 }), rec('B', { points: 4, won: 2, lost: 1, runsScored: 400, wicketsTaken: 10 })];
    expect(rankTeams(base, ['points', 'wins'], emptyCtx()).map((r) => r.teamId)).toEqual(['B', 'A']);
    expect(rankTeams(base, ['points', 'fewer_losses'], emptyCtx()).map((r) => r.teamId)).toEqual(['B', 'A']);
    expect(rankTeams(base, ['points', 'runs_scored'], emptyCtx()).map((r) => r.teamId)).toEqual(['B', 'A']);
    expect(rankTeams(base, ['points', 'wickets_taken'], emptyCtx()).map((r) => r.teamId)).toEqual(['A', 'B']);
  });

  it('NRR within epsilon is level (next criterion decides); null NRR ranks below any negative NRR', () => {
    const ranked = rankTeams([rec('A', { points: 2, nrr: 1.0, won: 1 }), rec('B', { points: 2, nrr: 1.0 + 5e-10, won: 2 })], ['points', 'nrr', 'wins'], emptyCtx());
    expect(ranked.map((r) => r.teamId)).toEqual(['B', 'A']);
    expect(ranked[0].separatedBy).toBe('wins');
    const withNull = rankTeams([rec('A', { points: 2, nrr: null }), rec('B', { points: 2, nrr: -3 })], ['points', 'nrr'], emptyCtx());
    expect(withNull.map((r) => r.teamId)).toEqual(['B', 'A']);
  });

  it('H2H with no mutual match leaves the teams level and the next criterion decides', () => {
    const ranked = rankTeams([rec('A', { points: 2, won: 1 }), rec('B', { points: 2, won: 1, lost: 0 }), rec('C', { points: 2, won: 1, lost: 1 })], ['points', 'head_to_head', 'fewer_losses'], emptyCtx());
    expect(ranked.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
    expect(ranked.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it('still-level teams keep input order, never alphabetical by name', () => {
    const ranked = rankTeams([rec('Z', { points: 2 }), rec('A', { points: 2 })], ['points', 'nrr', 'organizer_decision'], emptyCtx());
    expect(ranked.map((r) => r.teamId)).toEqual(['Z', 'A']);
    expect(ranked.map((r) => r.position)).toEqual([1, 1]);
    expect(ranked[0].detail).toBe('Level with Aces — organizer decision required');
  });

  it('separate level runs each consume their own exact-set resolution; a superset resolution is ignored', () => {
    const records = [rec('A', { points: 4 }), rec('B', { points: 4 }), rec('C', { points: 2 }), rec('D', { points: 2 })];
    const both = rankTeams(records, ['points', 'organizer_decision'], emptyCtx([resolution('r1', ['B', 'A']), resolution('r2', ['D', 'C'])]));
    expect(both.map((r) => r.teamId)).toEqual(['B', 'A', 'D', 'C']);
    expect(both.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    const superset = rankTeams(records, ['points', 'organizer_decision'], emptyCtx([resolution('r3', ['C', 'B', 'A'])]));
    expect(superset.map((r) => r.position)).toEqual([1, 1, 3, 3]);
  });

  it('points separation explains the margin; the last row has an empty explanation', () => {
    const ranked = rankTeams([rec('B', { points: 4 }), rec('A', { points: 6 })], ['points', 'nrr'], emptyCtx());
    expect(ranked.map((r) => r.teamId)).toEqual(['A', 'B']);
    expect(ranked[0].detail).toBe('6 pts, 2 ahead of Blues');
    expect(ranked[1].detail).toBe('');
    const t = table({ teams: ['B', 'A'], results: [duel('pd1', 'A', 160, 'B', 150), duel('pd2', 'A', 170, 'B', 150), duel('pd3', 'A', 180, 'B', 150)] });
    expect(rowOf(t, 'A').tieBreak).toMatchObject({ separatedBy: null, aboveTeamId: 'B', detail: '6 pts, 6 ahead of Blues' });
    expect(rowOf(t, 'B').tieBreak?.detail ?? '').toBe('');
  });

  it('ordering never depends on names', () => {
    const records = [rec('A', { points: 2, nrr: 0.5 }), rec('B', { points: 4, nrr: -1 }), rec('C', { points: 2, nrr: 0.7 })];
    const renamed = records.map((r) => ({ ...r, name: `zz-${100 - r.points}` }));
    expect(rankTeams(records, DEFAULT_TIE_BREAKERS, emptyCtx()).map((r) => r.teamId)).toEqual(['B', 'C', 'A']);
    expect(rankTeams([...renamed].reverse(), DEFAULT_TIE_BREAKERS, emptyCtx()).map((r) => r.teamId)).toEqual(['B', 'C', 'A']);
  });

  it('describeTieBreakerChain renders a custom chain with the contract labels', () => {
    expect(describeTieBreakerChain(['points', 'head_to_head', 'head_to_head_nrr', 'seed', 'draw_lots'])).toBe(
      'Points → Head-to-Head → Head-to-Head NRR → Seeding → Draw of lots',
    );
  });
});

describe('Uneven pools: overall table normalisation', () => {
  const pools = [
    duel('a1', 'A1', 160, 'A2', 150),
    duel('a2', 'A1', 160, 'A3', 150),
    duel('a3', 'A1', 160, 'A4', 140),
    duel('a4', 'A2', 160, 'A3', 150),
    duel('a5', 'A2', 160, 'A4', 150),
    duel('a6', 'A3', 160, 'A4', 150),
    duel('b1', 'B1', 200, 'B2', 160),
    duel('b2', 'B1', 200, 'B3', 150),
    duel('b3', 'B2', 200, 'B3', 150),
  ];
  const teams = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'];
  const poolOf: Record<string, string> = { A1: 'pA', A2: 'pA', A3: 'pA', A4: 'pA', B1: 'pB', B2: 'pB', B3: 'pB' };
  const poolOrder = new Map<string, readonly TeamId[]>([
    ['pA', ['A1', 'A2', 'A3', 'A4']],
    ['pB', ['B1', 'B2', 'B3']],
  ]);
  const overall = (normalization: UnevenPoolNormalization) => table({ teams, results: pools, poolId: null, poolOf, normalization, poolOrder });

  it('raw: A1 6 pts first; level points split by NRR (B1 +2.250 over A2 +0.167, B2 +0.250 over A3 -0.167)', () => {
    const t = overall('raw');
    expect(orderOf(t)).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'A4', 'B3']);
    expect(rowOf(t, 'A1')).toMatchObject({ played: 3, points: 6 });
    expect(rowOf(t, 'A1').nrr).toBeCloseTo(0.666667, 6);
    expect(rowOf(t, 'B1').nrr).toBeCloseTo(2.25, 9);
    expect(rowOf(t, 'B3').nrr).toBeCloseTo(-2.5, 9);
  });

  it('per_match_average: A1 and B1 both 2.00 per match, NRR puts B1 first; B2 1.00 beats A3 0.67', () => {
    expect(orderOf(overall('per_match_average'))).toEqual(['B1', 'A1', 'A2', 'B2', 'A3', 'A4', 'B3']);
  });

  it('drop_extra_results: every 4-team pool side drops its result v its lowest-placed opponent (A4 drops A3)', () => {
    const t = overall('drop_extra_results');
    expect(rowOf(t, 'A1')).toMatchObject({ played: 2, points: 4 });
    expect(rowOf(t, 'A1').nrr).toBeCloseTo(0.5, 9);
    expect(rowOf(t, 'A2')).toMatchObject({ played: 2, points: 2 });
    expect(rowOf(t, 'A2').nrr).toBeCloseTo(0, 9);
    expect(rowOf(t, 'A3')).toMatchObject({ played: 2, points: 0 });
    expect(rowOf(t, 'A3').nrr).toBeCloseTo(-0.5, 9);
    expect(rowOf(t, 'A4')).toMatchObject({ played: 2, points: 0 });
    expect(rowOf(t, 'A4').nrr).toBeCloseTo(-0.75, 9);
    expect(rowOf(t, 'B1')).toMatchObject({ played: 2, points: 4 });
    expect(orderOf(t)).toEqual(['B1', 'A1', 'B2', 'A2', 'A3', 'A4', 'B3']);
  });

  it('per_match_average ranks a team with 0 played last and not level with a 0.00 average', () => {
    const t = table({
      teams: ['X', 'Y', 'Z'],
      results: [duel('pm1', 'Z', 160, 'Y', 150)],
      pending: [['X', 'Y']],
      poolId: null,
      normalization: 'per_match_average',
      chain: ['points', 'wins'],
    });
    expect(orderOf(t)).toEqual(['Z', 'Y', 'X']);
    expect(positionsOf(t)).toEqual([1, 2, 3]);
  });
});

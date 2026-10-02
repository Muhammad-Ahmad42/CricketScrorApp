import type {
  Fixture,
  InningsSummary,
  MatchResult,
  MatchSummary,
  PlayerTournamentStats,
  Stage,
  Team,
  TournamentEvaluation,
  TournamentSnapshot,
  TournamentStats,
  TournamentTeamView,
} from '@/domain/types';
import type { TournamentPdfSource } from '../../tournament/model';
import { RULES } from './handState';
import { qualification, standingRow, standingsTable } from './standings';

const T0 = '2026-09-01T10:00:00.000Z';

export const TEAM = {
  lions: 'team-lions',
  tigers: 'team-tigers',
  eagles: 'team-eagles',
  falcons: 'team-falcons',
} as const;

const NAMES: Readonly<Record<string, readonly [string, string]>> = {
  [TEAM.lions]: ['Lions & <Co>', 'LIO'],
  [TEAM.tigers]: ['Tigers', 'TIG'],
  [TEAM.eagles]: ['Eagles', 'EAG'],
  [TEAM.falcons]: ['Falcons', 'FAL'],
};

function team(id: string): Team {
  const [name, shortName] = NAMES[id];
  return { id, name, shortName, logoUri: null, captainId: null, createdAt: T0, updatedAt: T0, archivedAt: null };
}

function view(id: string, status: 'active' | 'withdrawn' | 'replaced' = 'active'): TournamentTeamView {
  return {
    membership: { id: `tt-${id}`, tournamentId: 'tour', teamId: id, seed: null, status, replacedByTeamId: null, inheritsFromTeamId: null, joinedAt: T0 },
    team: team(id),
  };
}

function stage(id: string, name: string, orderIndex: number, status: Stage['status']): Stage {
  return {
    id,
    tournamentId: 'tour',
    name,
    type: orderIndex === 0 ? 'group' : 'knockout',
    orderIndex,
    status,
    config: {
      fixtureGeneration: { method: orderIndex === 0 ? 'round_robin' : 'knockout', legs: 1 },
      seeding: 'fixed',
      seedingSeed: null,
      seedingNormalization: 'raw',
      pointsSystem: null,
      tieBreakers: null,
      headToHeadRequiresCompleteMiniLeague: false,
      nrr: null,
      entryRules: [],
      knockout: null,
      abandonedMatches: 'no_result',
      decidesChampion: orderIndex === 1,
      formatId: null,
      matchRules: RULES,
    },
    createdAt: T0,
    updatedAt: T0,
  };
}

function fixture(id: string, partial: Partial<Fixture>): Fixture {
  return {
    id,
    tournamentId: 'tour',
    stageId: 'stage-groups',
    poolId: 'pool-a',
    matchNumber: 1,
    label: null,
    round: 1,
    leg: 1,
    bracket: null,
    isFinal: false,
    sideA: { kind: 'team', teamId: TEAM.lions },
    sideB: { kind: 'team', teamId: TEAM.tigers },
    scheduledDate: null,
    scheduledTime: null,
    venueId: null,
    status: 'scheduled',
    matchId: null,
    matchSides: null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
    ...partial,
  };
}

function innings(battingTeamId: string, bowlingTeamId: string, runs: number, wickets: number, legalBalls: number): InningsSummary {
  return {
    inningsIndex: 0,
    battingTeamId,
    bowlingTeamId,
    runs,
    wickets,
    legalBalls,
    allottedBalls: 120,
    ballsPerOver: 6,
    allOut: false,
    completion: 'overs_complete',
    target: null,
    targetRevised: false,
    extras: 0,
    fours: 0,
    sixes: 0,
    batting: [],
    bowling: [],
    bestPartnership: null,
  };
}

function summary(matchId: string, teamAId: string, teamBId: string, result: MatchResult, winnerTeamId: string | null, played: readonly InningsSummary[]): MatchSummary {
  return {
    summaryVersion: 2,
    matchId,
    teamAId,
    teamBId,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId,
    ballsPerOver: 6,
    innings: played,
    superOvers: [],
    squads: [],
    completedAt: '2026-09-05T18:00:00.000Z',
  };
}

export function snapshot(): TournamentSnapshot {
  return {
    version: '7',
    tournament: {
      id: 'tour',
      name: 'Spring <Cup>',
      season: '2026 "Autumn"',
      description: 'Club championship',
      logoUri: null,
      organizer: 'City & District CA',
      contact: null,
      location: 'Lahore',
      notes: null,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      venueIds: ['venue-1', 'venue-unknown'],
      structureKind: 'groups_knockout',
      status: 'active',
      createdAt: T0,
      updatedAt: T0,
    },
    rules: {
      tournamentId: 'tour',
      pointsSystem: { win: 2, tie: 1, noResult: 1, loss: 0, abandoned: null, walkoverWin: null, walkoverLoss: null, superOverDecidedTie: 'win_loss', bonus: null },
      nrr: { mode: 'icc', includeNoResult: false, includeAbandoned: false, walkover: { kind: 'exclude' }, awarded: 'exclude', revisedTarget: 'icc_par' },
      tieBreakers: ['points', 'nrr'],
      defaultFormatId: 'T20',
      defaultMatchRules: RULES,
      updatedAt: T0,
    },
    teams: [view(TEAM.lions), view(TEAM.tigers), view(TEAM.eagles), view(TEAM.falcons, 'withdrawn')],
    stages: [stage('stage-ko', 'Knockout', 1, 'active'), stage('stage-groups', 'Group stage', 0, 'completed')],
    pools: [
      { id: 'pool-a', stageId: 'stage-groups', name: 'Pool A', orderIndex: 0, legs: null },
      { id: 'pool-b', stageId: 'stage-groups', name: 'Pool B', orderIndex: 1, legs: null },
    ],
    poolEntries: [],
    slots: [
      { id: 'slot-a1', stageId: 'stage-ko', index: 0, role: 'entry', label: 'A1', source: { kind: 'pool_position', stageId: 'stage-groups', poolId: 'pool-a', position: 1 }, seed: 1 },
      { id: 'slot-b1', stageId: 'stage-ko', index: 1, role: 'entry', label: 'B1', source: { kind: 'pool_position', stageId: 'stage-groups', poolId: 'pool-b', position: 1 }, seed: 2 },
      { id: 'slot-sf1', stageId: 'stage-ko', index: 2, role: 'progression', label: 'Winner SF1', source: { kind: 'bracket_winner', stageId: 'stage-ko', round: 1, position: 0 }, seed: null },
    ],
    fixtures: [
      fixture('f-final', {
        stageId: 'stage-ko',
        poolId: null,
        matchNumber: 4,
        bracket: { kind: 'main', round: 2, position: 0, roundName: 'Final' },
        isFinal: true,
        sideA: { kind: 'slot', slotId: 'slot-sf1' },
        sideB: { kind: 'team', teamId: TEAM.tigers },
        scheduledDate: '2026-09-28',
        scheduledTime: '14:00',
        venueId: 'venue-1',
      }),
      fixture('f-sf1', {
        stageId: 'stage-ko',
        poolId: null,
        matchNumber: 3,
        label: 'Semi-final 1',
        bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semi-final' },
        sideA: { kind: 'slot', slotId: 'slot-a1' },
        sideB: { kind: 'slot', slotId: 'slot-b1' },
        status: 'completed',
        matchId: 'm3',
        matchSides: { teamAId: TEAM.lions, teamBId: TEAM.eagles },
      }),
      fixture('f1', { status: 'completed', matchId: 'm1', matchSides: { teamAId: TEAM.lions, teamBId: TEAM.tigers }, scheduledDate: '2026-09-02' }),
      fixture('f2', { matchNumber: 2, poolId: 'pool-b', sideA: { kind: 'team', teamId: TEAM.eagles }, sideB: { kind: 'team', teamId: TEAM.falcons }, status: 'abandoned', matchId: 'm2', matchSides: { teamAId: TEAM.eagles, teamBId: TEAM.falcons } }),
      fixture('f5', { matchNumber: 5, sideA: { kind: 'team', teamId: TEAM.tigers }, sideB: { kind: 'team', teamId: TEAM.lions }, status: 'postponed' }),
    ],
    summaries: {
      m1: summary('m1', TEAM.lions, TEAM.tigers, { type: 'win', winnerTeamId: TEAM.lions, loserTeamId: TEAM.tigers, margin: { kind: 'runs', runs: 10 }, method: 'normal' }, TEAM.lions, [
        innings(TEAM.lions, TEAM.tigers, 150, 6, 120),
        innings(TEAM.tigers, TEAM.lions, 140, 9, 120),
      ]),
      m2: summary('m2', TEAM.eagles, TEAM.falcons, { type: 'abandoned', reason: 'Rain' }, null, []),
      m3: summary('m3', TEAM.lions, TEAM.eagles, { type: 'win', winnerTeamId: TEAM.eagles, loserTeamId: TEAM.lions, margin: { kind: 'wickets', wickets: 4, ballsRemaining: 7 }, method: 'normal' }, TEAM.eagles, [
        innings(TEAM.lions, TEAM.eagles, 120, 8, 120),
        innings(TEAM.eagles, TEAM.lions, 121, 6, 113),
      ]),
    },
    staleSummaryMatchIds: [],
    overrides: [],
  };
}

export function evaluation(champion: TournamentEvaluation['champion'] = null): TournamentEvaluation {
  const poolA = standingsTable([
    standingRow({ position: 1, teamId: TEAM.lions, played: 1, won: 1, lost: 0, points: 2, nrr: 0.5, qualification: qualification(TEAM.lions, 'Qualified for the knockout as Pool A winners') }),
    standingRow({ position: 2, teamId: TEAM.tigers, played: 1, won: 0, lost: 1, points: 0, nrr: -0.5 }),
  ]);
  const poolB = standingsTable(
    [
      standingRow({ position: 1, teamId: TEAM.eagles, played: 1, won: 0, lost: 0, noResult: 1, points: 1, nrr: null }),
      standingRow({ position: 2, teamId: TEAM.falcons, played: 1, won: 0, lost: 0, noResult: 1, points: 1, nrr: null, membership: 'withdrawn' }),
    ],
    'pool-b',
  );
  return {
    stages: [
      {
        stageId: 'stage-groups',
        tables: [poolA, poolB],
        overall: standingsTable([...poolA.rows, ...poolB.rows], null),
        comparisonTables: [],
        slots: [],
        qualification: [],
        progress: { done: 3, total: 3 },
        complete: true,
      },
      {
        stageId: 'stage-ko',
        tables: [],
        overall: null,
        comparisonTables: [],
        slots: [
          { slotId: 'slot-a1', teamId: TEAM.lions, status: 'final', viaOverride: false, explanation: 'Pool A winner' },
          { slotId: 'slot-b1', teamId: TEAM.eagles, status: 'final', viaOverride: false, explanation: 'Pool B winner' },
          { slotId: 'slot-sf1', teamId: TEAM.eagles, status: 'provisional', viaOverride: false, explanation: 'Winner SF1' },
        ],
        qualification: [],
        progress: { done: 1, total: 2 },
        complete: false,
      },
    ],
    currentStageId: 'stage-ko',
    champion,
    progress: { done: 3, total: 5 },
  };
}

function playerStats(partial: Partial<PlayerTournamentStats> & Pick<PlayerTournamentStats, 'playerId' | 'teamId'>): PlayerTournamentStats {
  return {
    matches: 2,
    innings: 2,
    runs: 0,
    ballsFaced: 0,
    notOuts: 0,
    battingAverage: null,
    strikeRate: null,
    fours: 0,
    sixes: 0,
    highestScore: null,
    ballsBowled: 0,
    runsConceded: 0,
    wickets: 0,
    economy: null,
    bestBowling: null,
    ...partial,
  };
}

export function stats(): TournamentStats {
  return {
    totalMatches: 5,
    completedMatches: 3,
    totalRuns: 531,
    totalWickets: 29,
    totalFours: 40,
    totalSixes: 12,
    highestTeamScore: { matchId: 'm1', teamId: TEAM.lions, playerId: null, value: 150, detail: '150/6 v Tigers' },
    highestIndividualScore: { matchId: 'm1', teamId: TEAM.lions, playerId: 'p-babar', value: 78, detail: '78* (45)' },
    bestBowling: { matchId: 'm3', teamId: TEAM.eagles, playerId: 'p-amir', value: 4, detail: '' },
    mostSixes: null,
    mostFours: null,
    highestPartnership: null,
    teams: [],
    players: [
      playerStats({ playerId: 'p-babar', teamId: TEAM.lions, runs: 110, ballsFaced: 80, battingAverage: 110, strikeRate: 137.5, fours: 10, sixes: 3, highestScore: { runs: 78, notOut: true, matchId: 'm1' } }),
      playerStats({ playerId: 'p-shan', teamId: TEAM.tigers, runs: 40, ballsFaced: 50, battingAverage: 20, strikeRate: 80, highestScore: { runs: 30, notOut: false, matchId: 'm1' } }),
      playerStats({ playerId: 'p-amir', teamId: TEAM.eagles, runs: 0, innings: 0, ballsBowled: 48, runsConceded: 30, wickets: 6, economy: 3.75, bestBowling: { wickets: 4, runs: 12, matchId: 'm3' } }),
      playerStats({ playerId: 'p-unknown', teamId: TEAM.falcons, innings: 0, wickets: 1, runsConceded: 40, economy: 10, bestBowling: { wickets: 1, runs: 40, matchId: 'm2' } }),
    ],
  };
}

export function tournamentSource(partial: Partial<TournamentPdfSource> = {}): TournamentPdfSource {
  return {
    snapshot: snapshot(),
    evaluation: evaluation(),
    stats: stats(),
    venues: [{ id: 'venue-1', name: 'Gaddafi <Stadium>' }],
    playerNames: { 'p-babar': 'Babar <b>Azam</b>', 'p-shan': 'Shan', 'p-amir': 'Amir' },
    ...partial,
  };
}

import type {
  Match,
  MatchRules,
  MatchSquadEntry,
  Player,
  PlayerRole,
  Team,
  TeamId,
  Tournament,
  TournamentRules,
  Venue,
} from '@/domain/types';

export const T0 = '2026-05-01T10:00:00.000Z';

export function isoAt(seconds: number, base: string = T0): string {
  return new Date(Date.parse(base) + seconds * 1000).toISOString();
}

export const TEST_MATCH_RULES: MatchRules = {
  oversPerInnings: 3,
  ballsPerOver: 6,
  playersPerSide: 11,
  lastManStands: false,
  maxOversPerBowler: 2,
  bowlerQuotaMode: 'uniform',
  allowBowlerConsecutiveOvers: false,
  wide: { penaltyRuns: 1, countsAsBall: false },
  noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: false },
  powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }],
  superOver: { enabled: true, overs: 1, maxWickets: 2, ifTiedAgain: 'repeat', maxRounds: null, restrictRepeatPlayers: true },
  mandatoryRetirement: null,
};

export interface TeamSeed {
  readonly team: Team;
  readonly players: readonly Player[];
}

const ROLES: readonly PlayerRole[] = ['batter', 'batter', 'batter', 'batter', 'all_rounder', 'wicket_keeper'];

export function playerId(teamId: TeamId, number: number): string {
  return `${teamId}-p${number}`;
}

export function buildTeamSeed(id: TeamId, name: string, shortName: string, playerCount = 12, at: string = T0): TeamSeed {
  const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
    id: playerId(id, index + 1),
    teamId: id,
    name: `${name} Player ${index + 1}`,
    jerseyNumber: index + 1,
    role: ROLES[index] ?? 'bowler',
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  }));
  return {
    team: {
      id,
      name,
      shortName,
      logoUri: null,
      captainId: players[0]?.id ?? null,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    },
    players,
  };
}

export function buildVenue(id: string, name: string, at: string = T0): Venue {
  return { id, name, location: 'Lahore', notes: null, createdAt: at, updatedAt: at, archivedAt: null };
}

export function squadEntries(seed: TeamSeed, playing = 11): MatchSquadEntry[] {
  return seed.players.map((player, index) => ({
    playerId: player.id,
    battingOrder: index < playing ? index + 1 : null,
    isCaptain: index === 0,
    isWicketKeeper: index === 5,
    isSubstitute: index >= playing,
  }));
}

export function squadsFor(teamA: TeamSeed, teamB: TeamSeed, playing = 11): { readonly teamId: TeamId; readonly players: MatchSquadEntry[] }[] {
  return [
    { teamId: teamA.team.id, players: squadEntries(teamA, playing) },
    { teamId: teamB.team.id, players: squadEntries(teamB, playing) },
  ];
}

export function buildMatch(input: Pick<Match, 'id' | 'teamAId' | 'teamBId'> & Partial<Match>): Match {
  return {
    title: `${input.teamAId} v ${input.teamBId}`,
    venueId: null,
    scheduledDate: null,
    scheduledTime: null,
    formatId: 'custom',
    rules: TEST_MATCH_RULES,
    toss: { winnerTeamId: input.teamAId, decision: 'bat' },
    status: 'scheduled',
    result: null,
    winnerTeamId: null,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...input,
  };
}

export function buildTournament(input: Pick<Tournament, 'id'> & Partial<Tournament>): Tournament {
  return {
    name: 'Scorebook Cup',
    season: '2026',
    description: null,
    logoUri: null,
    organizer: 'Harris',
    contact: null,
    location: 'Lahore',
    notes: null,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    venueIds: [],
    structureKind: 'groups_knockout',
    status: 'draft',
    createdAt: T0,
    updatedAt: T0,
    ...input,
  };
}

export function buildTournamentRules(tournamentId: string, overrides: Partial<TournamentRules> = {}): TournamentRules {
  return {
    tournamentId,
    pointsSystem: {
      win: 2,
      tie: 1,
      noResult: 1,
      loss: 0,
      abandoned: null,
      walkoverWin: null,
      walkoverLoss: null,
      superOverDecidedTie: 'win_loss',
      bonus: null,
    },
    nrr: {
      mode: 'icc',
      includeNoResult: false,
      includeAbandoned: false,
      walkover: { kind: 'exclude' },
      awarded: 'exclude',
      revisedTarget: 'icc_par',
    },
    tieBreakers: ['points', 'nrr', 'head_to_head', 'wins', 'organizer_decision'],
    defaultFormatId: 'T20',
    defaultMatchRules: TEST_MATCH_RULES,
    updatedAt: T0,
    ...overrides,
  };
}

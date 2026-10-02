import type { MatchStatus, TournamentStatus } from '../../types';
import type { EditPermission, MatchEditPolicy, TournamentEditPolicy, TournamentGuardContext } from '../stateMachine';

type TournamentRow = Omit<TournamentEditPolicy, 'seeds' | 'deleteTournament'>;

export type TournamentSituation = 'setup' | 'fixtures_ready' | 'matches_started' | 'matches_completed' | 'completed' | 'archived';

const TOURNAMENT_ROWS: { readonly [K in TournamentSituation]: TournamentRow } = {
  setup: {
    info: 'allowed',
    addTeams: 'allowed',
    removeTeams: 'allowed',
    stages: 'allowed',
    pools: 'allowed',
    generateFixtures: 'allowed',
    fixtureSchedule: 'allowed',
    fixtureTeams: 'allowed',
    rules: 'allowed',
    overrides: 'allowed',
    matchResults: 'forbidden',
  },
  fixtures_ready: {
    info: 'allowed',
    addTeams: 'warn',
    removeTeams: 'warn',
    stages: 'warn',
    pools: 'warn',
    generateFixtures: 'warn',
    fixtureSchedule: 'allowed',
    fixtureTeams: 'allowed',
    rules: 'allowed',
    overrides: 'allowed',
    matchResults: 'forbidden',
  },
  matches_started: {
    info: 'allowed',
    addTeams: 'warn',
    removeTeams: 'confirm',
    stages: 'warn',
    pools: 'warn',
    generateFixtures: 'warn',
    fixtureSchedule: 'allowed',
    fixtureTeams: 'warn',
    rules: 'warn',
    overrides: 'confirm',
    matchResults: 'warn',
  },
  matches_completed: {
    info: 'allowed',
    addTeams: 'confirm',
    removeTeams: 'confirm',
    stages: 'confirm',
    pools: 'confirm',
    generateFixtures: 'confirm',
    fixtureSchedule: 'allowed',
    fixtureTeams: 'confirm',
    rules: 'confirm',
    overrides: 'confirm',
    matchResults: 'confirm',
  },
  completed: {
    info: 'allowed',
    addTeams: 'forbidden',
    removeTeams: 'forbidden',
    stages: 'forbidden',
    pools: 'forbidden',
    generateFixtures: 'forbidden',
    fixtureSchedule: 'forbidden',
    fixtureTeams: 'forbidden',
    rules: 'confirm',
    overrides: 'confirm',
    matchResults: 'confirm',
  },
  archived: {
    info: 'forbidden',
    addTeams: 'forbidden',
    removeTeams: 'forbidden',
    stages: 'forbidden',
    pools: 'forbidden',
    generateFixtures: 'forbidden',
    fixtureSchedule: 'forbidden',
    fixtureTeams: 'forbidden',
    rules: 'forbidden',
    overrides: 'forbidden',
    matchResults: 'forbidden',
  },
};

export function tournamentSituation(status: TournamentStatus, ctx: TournamentGuardContext): TournamentSituation {
  switch (status) {
    case 'archived':
      return 'archived';
    case 'completed':
      return 'completed';
    case 'draft':
    case 'registration':
    case 'structure_configured':
    case 'pools_configured':
      return 'setup';
    case 'fixtures_generated':
    case 'active':
      if (ctx.matchesCompleted > 0) {
        return 'matches_completed';
      }
      return ctx.matchesStarted > 0 ? 'matches_started' : 'fixtures_ready';
  }
}

export function tournamentRow(situation: TournamentSituation): TournamentRow {
  return TOURNAMENT_ROWS[situation];
}

export function deletePermission(situation: TournamentSituation, ctx: TournamentGuardContext): EditPermission {
  if (situation === 'archived') {
    return 'forbidden';
  }
  return ctx.matchesStarted === 0 && ctx.matchesCompleted === 0 ? 'allowed' : 'confirm';
}

type MatchPhase = 'not_started' | 'in_play' | 'finished' | 'cancelled';

function matchPhase(status: MatchStatus): MatchPhase {
  switch (status) {
    case 'scheduled':
    case 'postponed':
      return 'not_started';
    case 'live':
    case 'paused':
      return 'in_play';
    case 'completed':
    case 'abandoned':
      return 'finished';
    case 'cancelled':
      return 'cancelled';
  }
}

const MATCH_ROWS: { readonly [K in MatchPhase]: Omit<MatchEditPolicy, 'delete'> } = {
  not_started: {
    details: 'allowed',
    teams: 'allowed',
    rules: 'allowed',
    squads: 'allowed',
    toss: 'allowed',
    scoring: 'allowed',
    history: 'forbidden',
  },
  in_play: {
    details: 'allowed',
    teams: 'forbidden',
    rules: 'confirm',
    squads: 'allowed',
    toss: 'confirm',
    scoring: 'allowed',
    history: 'warn',
  },
  finished: {
    details: 'allowed',
    teams: 'forbidden',
    rules: 'confirm',
    squads: 'allowed',
    toss: 'confirm',
    scoring: 'forbidden',
    history: 'confirm',
  },
  cancelled: {
    details: 'allowed',
    teams: 'allowed',
    rules: 'allowed',
    squads: 'allowed',
    toss: 'forbidden',
    scoring: 'forbidden',
    history: 'forbidden',
  },
};

function matchDelete(phase: MatchPhase, inTournament: boolean): EditPermission {
  switch (phase) {
    case 'not_started':
      return inTournament ? 'forbidden' : 'allowed';
    case 'in_play':
    case 'finished':
      return inTournament ? 'forbidden' : 'confirm';
    case 'cancelled':
      return 'allowed';
  }
}

export function matchPolicyFor(status: MatchStatus, inTournament: boolean): MatchEditPolicy {
  const phase = matchPhase(status);
  return { ...MATCH_ROWS[phase], delete: matchDelete(phase, inTournament) };
}

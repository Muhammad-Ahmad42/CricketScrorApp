import type { MatchId, MatchPlayer, MatchRules, MatchSetup, MatchTeam, PlayerRole, TeamId, Toss } from '../../types';
import { BASE_MATCH_RULES } from '../presets';

export const LIONS: TeamId = 'LIO';
export const TIGERS: TeamId = 'TIG';
export const DEFAULT_MATCH_ID: MatchId = 'M1';

const LION_NAMES = ['Babar', 'Fakhar', 'Saim', 'Rizwan-L', 'Iftikhar', 'Sarfraz', 'Amir', 'Wasim', 'Waqar', 'Imran', 'Abdul', 'Usman'];
const TIGER_NAMES = ['Rizwan', 'Shan', 'Saud', 'Agha', 'Azam', 'Faheem', 'Hassan', 'Shaheen', 'Naseem', 'Shadab', 'Haris', 'Ali'];

export interface SquadSpec {
  readonly teamId: TeamId;
  readonly idPrefix: string;
  readonly names: readonly string[];
  readonly keeperIndex: number;
  readonly substitutes: number;
}

function roleFor(index: number, keeperIndex: number, count: number): PlayerRole {
  if (index === keeperIndex) {
    return 'wicket_keeper';
  }
  return index >= count - 5 ? 'bowler' : 'batter';
}

export function buildSquad(matchId: MatchId, spec: SquadSpec): readonly MatchPlayer[] {
  const regulars = spec.names.length - spec.substitutes;
  return spec.names.map((name, index) => {
    const isSubstitute = index >= regulars;
    return {
      matchId,
      playerId: `${spec.idPrefix}${index + 1}`,
      teamId: spec.teamId,
      name,
      jerseyNumber: index + 1,
      role: isSubstitute ? 'unknown' : roleFor(index, spec.keeperIndex, regulars),
      battingOrder: isSubstitute ? null : index + 1,
      isCaptain: index === 0,
      isWicketKeeper: index === spec.keeperIndex,
      isSubstitute,
    };
  });
}

export function generatedSquad(matchId: MatchId, teamId: TeamId, teamName: string, regulars = 11, substitutes = 1): readonly MatchPlayer[] {
  const names = Array.from({ length: regulars + substitutes }, (_, index) => `${teamName} ${index + 1}`);
  return buildSquad(matchId, { teamId, idPrefix: `${teamId}-`, names, keeperIndex: Math.min(5, regulars - 1), substitutes });
}

export interface TeamOverride {
  readonly id?: TeamId;
  readonly name?: string;
  readonly shortName?: string;
}

export interface MatchSetupOverrides {
  readonly matchId?: MatchId;
  readonly rules?: Partial<MatchRules>;
  readonly teamAPlayers?: number | null;
  readonly teamBPlayers?: number | null;
  readonly teamA?: TeamOverride;
  readonly teamB?: TeamOverride;
  readonly players?: readonly MatchPlayer[];
  readonly extraPlayers?: readonly MatchPlayer[];
  readonly squadSize?: number;
  readonly toss?: Toss | null;
}

function teamSquad(matchId: MatchId, team: MatchTeam, standard: 'A' | 'B', squadSize: number | undefined): readonly MatchPlayer[] {
  const isStandard = team.id === (standard === 'A' ? LIONS : TIGERS);
  if (!isStandard) {
    return generatedSquad(matchId, team.id, team.name, squadSize ?? 11, 1);
  }
  const names = standard === 'A' ? LION_NAMES : TIGER_NAMES;
  const prefix = standard === 'A' ? 'L' : 'T';
  const count = Math.min(squadSize ?? 11, 11);
  const regular = buildSquad(matchId, {
    teamId: team.id,
    idPrefix: prefix,
    names: names.slice(0, count),
    keeperIndex: standard === 'A' ? 5 : 0,
    substitutes: 0,
  });
  const substitute: MatchPlayer = {
    matchId,
    playerId: `${prefix}12`,
    teamId: team.id,
    name: names[11],
    jerseyNumber: 12,
    role: 'unknown',
    battingOrder: null,
    isCaptain: false,
    isWicketKeeper: false,
    isSubstitute: true,
  };
  return [...regular, substitute];
}

export function matchSetup(overrides: MatchSetupOverrides = {}): MatchSetup {
  const matchId = overrides.matchId ?? DEFAULT_MATCH_ID;
  const rules: MatchRules = { ...BASE_MATCH_RULES, ...overrides.rules };
  const teamAId = overrides.teamA?.id ?? LIONS;
  const teamBId = overrides.teamB?.id ?? TIGERS;
  const teamA: MatchTeam = {
    id: teamAId,
    name: overrides.teamA?.name ?? (teamAId === LIONS ? 'Lions' : teamAId),
    shortName: overrides.teamA?.shortName ?? teamAId.slice(0, 5).toUpperCase(),
    playersInSide: overrides.teamAPlayers ?? rules.playersPerSide,
  };
  const teamB: MatchTeam = {
    id: teamBId,
    name: overrides.teamB?.name ?? (teamBId === TIGERS ? 'Tigers' : teamBId),
    shortName: overrides.teamB?.shortName ?? teamBId.slice(0, 5).toUpperCase(),
    playersInSide: overrides.teamBPlayers ?? rules.playersPerSide,
  };
  const players =
    overrides.players ??
    [
      ...teamSquad(matchId, teamA, 'A', overrides.squadSize),
      ...teamSquad(matchId, teamB, 'B', overrides.squadSize),
    ];
  const defaultToss: Toss = { winnerTeamId: teamAId, decision: 'bat' };
  return {
    matchId,
    rules,
    teams: [teamA, teamB],
    players: [...players, ...(overrides.extraPlayers ?? [])],
    toss: overrides.toss === undefined ? defaultToss : overrides.toss,
  };
}

export const M3_RULES: Partial<MatchRules> = {
  oversPerInnings: 3,
  maxOversPerBowler: 2,
  powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }],
};

export function m3Setup(overrides: MatchSetupOverrides = {}): MatchSetup {
  return matchSetup({ ...overrides, rules: { ...M3_RULES, ...overrides.rules } });
}

export function m8LmsSetup(overrides: MatchSetupOverrides = {}): MatchSetup {
  return matchSetup({ ...overrides, rules: { playersPerSide: 8, lastManStands: true, ...overrides.rules } });
}

export function m8v7Setup(overrides: MatchSetupOverrides = {}): MatchSetup {
  return matchSetup({ teamBPlayers: 7, ...overrides, rules: { playersPerSide: 8, ...overrides.rules } });
}

export function substitutePlayer(setup: MatchSetup, teamId: TeamId, playerId: string, name: string): MatchPlayer {
  return {
    matchId: setup.matchId,
    playerId,
    teamId,
    name,
    jerseyNumber: null,
    role: 'unknown',
    battingOrder: null,
    isCaptain: false,
    isWicketKeeper: false,
    isSubstitute: true,
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

import type { BallCount, FixtureId, IsoDate, IsoDateTime, LocalTime, MatchId, PlayerId, TeamId, TournamentId, VenueId } from './primitives';
import type { FormatId, MatchRules } from './rules';
import type { PlayerRole } from './team';

export const MATCH_STATUSES = ['scheduled', 'live', 'paused', 'completed', 'postponed', 'cancelled', 'abandoned'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type TerminalMatchStatus = Extract<MatchStatus, 'completed' | 'abandoned'>;

export type TossDecision = 'bat' | 'bowl';

export interface Toss {
  readonly winnerTeamId: TeamId;
  readonly decision: TossDecision;
}

export type WinMargin =
  | { readonly kind: 'runs'; readonly runs: number }
  | { readonly kind: 'wickets'; readonly wickets: number; readonly ballsRemaining: BallCount };

export type TieDecisionMethod = 'super_over' | 'boundary_count' | 'bowl_out' | 'coin_toss' | 'organizer';

export interface TieDecider {
  readonly method: TieDecisionMethod;
  readonly winnerTeamId: TeamId;
  readonly superOverRounds: number;
}

export type MatchResult =
  | {
      readonly type: 'win';
      readonly winnerTeamId: TeamId;
      readonly loserTeamId: TeamId;
      readonly margin: WinMargin;
      readonly method: 'normal' | 'revised_target' | 'par_score' | 'penalty_runs';
    }
  | { readonly type: 'tie'; readonly decider: TieDecider | null }
  | { readonly type: 'no_result'; readonly reason: string | null }
  | { readonly type: 'abandoned'; readonly reason: string | null }
  | { readonly type: 'walkover'; readonly winnerTeamId: TeamId; readonly loserTeamId: TeamId; readonly reason: string | null }
  | {
      readonly type: 'awarded';
      readonly winnerTeamId: TeamId | null;
      readonly loserTeamId: TeamId | null;
      readonly reason: string;
      readonly margin: WinMargin | null;
    };

export type MatchResultType = MatchResult['type'];

export interface Match {
  readonly id: MatchId;
  readonly title: string;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly venueId: VenueId | null;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
  readonly formatId: FormatId;
  readonly rules: MatchRules;
  readonly toss: Toss | null;
  readonly status: MatchStatus;
  readonly result: MatchResult | null;
  readonly winnerTeamId: TeamId | null;
  readonly tournamentId: TournamentId | null;
  readonly fixtureId: FixtureId | null;
  readonly teamAPlayers: number | null;
  readonly teamBPlayers: number | null;
  readonly resumeDismissedAt: IsoDateTime | null;
  readonly startedAt: IsoDateTime | null;
  readonly completedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface MatchPlayer {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly name: string;
  readonly jerseyNumber: number | null;
  readonly role: PlayerRole;
  readonly battingOrder: number | null;
  readonly isCaptain: boolean;
  readonly isWicketKeeper: boolean;
  readonly isSubstitute: boolean;
}

export interface MatchTeam {
  readonly id: TeamId;
  readonly name: string;
  readonly shortName: string;
  readonly playersInSide: number;
}

export interface MatchSetup {
  readonly matchId: MatchId;
  readonly rules: MatchRules;
  readonly teams: readonly [MatchTeam, MatchTeam];
  readonly players: readonly MatchPlayer[];
  readonly toss: Toss | null;
}

export interface NewMatchInput {
  readonly title: string;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly venueId: VenueId | null;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
  readonly formatId: FormatId;
  readonly rules: MatchRules;
  readonly squads: readonly { readonly teamId: TeamId; readonly players: readonly MatchSquadEntry[] }[];
  readonly toss: Toss | null;
  readonly tournamentId: TournamentId | null;
  readonly fixtureId: FixtureId | null;
  readonly teamAPlayers: number | null;
  readonly teamBPlayers: number | null;
}

export interface MatchSquadEntry {
  readonly playerId: PlayerId;
  readonly battingOrder: number | null;
  readonly isCaptain: boolean;
  readonly isWicketKeeper: boolean;
  readonly isSubstitute: boolean;
}

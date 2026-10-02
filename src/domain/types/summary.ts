import type { DismissalType } from './events';
import type { MatchResult, TerminalMatchStatus } from './match';
import type { BallCount, IsoDateTime, MatchId, PlayerId, Runs, TeamId } from './primitives';
import type { InningsCompletionReason } from './state';

export interface MatchSummary {
  readonly summaryVersion: 2;
  readonly matchId: MatchId;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly status: TerminalMatchStatus;
  readonly result: MatchResult;
  readonly winnerTeamId: TeamId | null;
  readonly ballsPerOver: number;
  readonly innings: readonly InningsSummary[];
  readonly superOvers: readonly InningsSummary[];
  readonly squads: readonly { readonly teamId: TeamId; readonly playerIds: readonly PlayerId[] }[];
  readonly completedAt: IsoDateTime | null;
  readonly hypothetical?: { readonly bonus: boolean };
}

export interface InningsSummary {
  readonly inningsIndex: number;
  readonly battingTeamId: TeamId;
  readonly bowlingTeamId: TeamId;
  readonly runs: Runs;
  readonly wickets: number;
  readonly legalBalls: BallCount;
  readonly allottedBalls: BallCount;
  readonly ballsPerOver: number;
  readonly allOut: boolean;
  readonly completion: InningsCompletionReason | null;
  readonly target: Runs | null;
  readonly targetRevised: boolean;
  readonly extras: Runs;
  readonly fours: number;
  readonly sixes: number;
  readonly batting: readonly PlayerBattingLine[];
  readonly bowling: readonly PlayerBowlingLine[];
  readonly bestPartnership: PartnershipLine | null;
}

export interface PlayerBattingLine {
  readonly playerId: PlayerId;
  readonly runs: Runs;
  readonly balls: BallCount;
  readonly fours: number;
  readonly sixes: number;
  readonly out: boolean;
  readonly dismissalType: DismissalType | null;
}

export interface PlayerBowlingLine {
  readonly playerId: PlayerId;
  readonly legalBalls: BallCount;
  readonly maidens: number;
  readonly runsConceded: Runs;
  readonly wickets: number;
  readonly wides: number;
  readonly noBalls: number;
}

export interface PartnershipLine {
  readonly wicketNumber: number;
  readonly batterAId: PlayerId;
  readonly batterBId: PlayerId | null;
  readonly runs: Runs;
  readonly balls: BallCount;
}

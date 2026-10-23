import type { InningsCompletionReason, InningsKind } from './state';
import type { MatchResult, MatchStatus } from './match';
import type { BallCount, IsoDate, IsoDateTime, MatchId, Runs, TeamId, TournamentId } from './primitives';
import type { TeamRef } from './team';
import type { TournamentStatus } from './tournament';

export interface InningsLine {
  readonly inningsIndex: number;
  readonly kind: InningsKind;
  readonly battingTeamId: TeamId;
  readonly runs: Runs;
  readonly wickets: number;
  readonly legalBalls: BallCount;
  readonly ballsPerOver: number;
  readonly status: 'in_progress' | 'complete';
  readonly completionReason: InningsCompletionReason | null;
}

export interface ListChase {
  readonly runsRequired: Runs;
  readonly ballsRemaining: BallCount;
}

export interface MatchListItem {
  readonly id: MatchId;
  readonly title: string;
  readonly status: MatchStatus;
  readonly result: MatchResult | null;
  readonly teamA: TeamRef;
  readonly teamB: TeamRef;
  readonly oversPerInnings: number;
  readonly innings: readonly InningsLine[];
  readonly scheduledDate: IsoDate | null;
  readonly tournamentId: TournamentId | null;
  readonly tournamentName: string | null;
  readonly resumeDismissedAt: IsoDateTime | null;
  readonly updatedAt: IsoDateTime;
  readonly startedAt?: IsoDateTime | null;
  readonly completedAt?: IsoDateTime | null;
  readonly chase?: ListChase;
}

export interface MatchListQuery {
  readonly statuses?: readonly MatchStatus[];
  readonly tournamentId?: TournamentId | null;
  readonly teamId?: TeamId;
  readonly search?: string;
  readonly sort?: 'recent' | 'oldest' | 'scheduled';
  readonly limit?: number;
  readonly offset?: number;
}

export interface TournamentListItem {
  readonly id: TournamentId;
  readonly name: string;
  readonly season: string | null;
  readonly status: TournamentStatus;
  readonly teamCount: number;
  readonly fixturesDone: number;
  readonly fixturesTotal: number;
  readonly championName: string | null;
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
  readonly updatedAt: IsoDateTime;
}

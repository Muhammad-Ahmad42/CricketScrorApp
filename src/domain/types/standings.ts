import type { TieBreakerKind, TournamentOverride, UnevenPoolNormalization } from './competition';
import type { BallCount, FixtureId, MatchId, PlayerId, PoolId, Runs, SlotId, StageId, TeamId } from './primitives';
import type { FixtureSide } from './tournament';

export type FormResult = 'W' | 'L' | 'T' | 'N';

export interface TieBreakNote {
  readonly separatedBy: TieBreakerKind | null;
  readonly aboveTeamId: TeamId | null;
  readonly detail: string;
}

export type QualificationState = 'qualified' | 'in_contention' | 'eliminated';

export interface QualificationTarget {
  readonly stageId: StageId;
  readonly state: QualificationState;
  readonly certainty: 'mathematical' | 'provisional' | 'manual';
  readonly slotIds: readonly SlotId[];
}

export interface TeamQualification {
  readonly teamId: TeamId;
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly state: QualificationState;
  readonly certainty: 'mathematical' | 'provisional' | 'manual';
  readonly targetStageId: StageId | null;
  readonly slotIds: readonly SlotId[];
  readonly targets: readonly QualificationTarget[];
  readonly explanation: string;
  readonly override: TournamentOverride | null;
}

export interface StandingRow {
  readonly position: number;
  readonly sharedPosition: boolean;
  readonly side: FixtureSide;
  readonly slotLabel: string | null;
  readonly teamId: TeamId | null;
  readonly provisional: boolean;
  readonly membership: 'active' | 'withdrawn' | 'replaced';
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
  readonly noResult: number;
  readonly points: number;
  readonly pointsAdjustment: number;
  readonly bonusPoints: number;
  readonly runsScored: Runs;
  readonly ballsFaced: BallCount;
  readonly runsConceded: Runs;
  readonly ballsBowled: BallCount;
  readonly oversFaced: number;
  readonly oversBowled: number;
  readonly runRate: number | null;
  readonly nrr: number | null;
  readonly matchesRemaining: number;
  readonly form: readonly FormResult[];
  readonly qualification: TeamQualification | null;
  readonly tieBreak: TieBreakNote | null;
}

export interface StandingsTable {
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly rows: readonly StandingRow[];
  readonly tieBreakers: readonly TieBreakerKind[];
  readonly complete: boolean;
  readonly unresolvedTies: readonly (readonly TeamId[])[];
  readonly provisionalTies: readonly (readonly TeamId[])[];
}

export interface SlotResolution {
  readonly slotId: SlotId;
  readonly teamId: TeamId | null;
  readonly status: 'final' | 'provisional' | 'pending';
  readonly viaOverride: boolean;
  readonly explanation: string;
}

export interface ChampionResult {
  readonly teamIds: readonly TeamId[];
  readonly basis: 'final' | 'league_table' | 'manual' | 'shared';
  readonly fixtureId: FixtureId | null;
}

export interface ComparisonTable {
  readonly key: string;
  readonly position: number | null;
  readonly normalization: UnevenPoolNormalization;
  readonly table: StandingsTable;
}

export interface StageEvaluation {
  readonly stageId: StageId;
  readonly tables: readonly StandingsTable[];
  readonly overall: StandingsTable | null;
  readonly comparisonTables: readonly ComparisonTable[];
  readonly slots: readonly SlotResolution[];
  readonly qualification: readonly TeamQualification[];
  readonly progress: { readonly done: number; readonly total: number };
  readonly complete: boolean;
}

export interface TournamentEvaluation {
  readonly stages: readonly StageEvaluation[];
  readonly currentStageId: StageId | null;
  readonly champion: ChampionResult | null;
  readonly progress: { readonly done: number; readonly total: number };
}

export interface TeamTournamentStats {
  readonly teamId: TeamId;
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly points: number;
  readonly nrr: number | null;
  readonly runsScored: Runs;
  readonly runsConceded: Runs;
}

export interface PlayerTournamentStats {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly matches: number;
  readonly innings: number;
  readonly runs: Runs;
  readonly ballsFaced: BallCount;
  readonly notOuts: number;
  readonly battingAverage: number | null;
  readonly strikeRate: number | null;
  readonly fours: number;
  readonly sixes: number;
  readonly highestScore: { readonly runs: Runs; readonly notOut: boolean; readonly matchId: MatchId } | null;
  readonly ballsBowled: BallCount;
  readonly runsConceded: Runs;
  readonly wickets: number;
  readonly economy: number | null;
  readonly bestBowling: { readonly wickets: number; readonly runs: Runs; readonly matchId: MatchId } | null;
}

export interface TournamentRecordLine {
  readonly matchId: MatchId;
  readonly teamId: TeamId;
  readonly playerId: PlayerId | null;
  readonly value: number;
  readonly detail: string;
}

export interface TournamentStats {
  readonly totalMatches: number;
  readonly completedMatches: number;
  readonly totalRuns: Runs;
  readonly totalWickets: number;
  readonly totalFours: number;
  readonly totalSixes: number;
  readonly highestTeamScore: TournamentRecordLine | null;
  readonly highestIndividualScore: TournamentRecordLine | null;
  readonly bestBowling: TournamentRecordLine | null;
  readonly mostSixes: TournamentRecordLine | null;
  readonly mostFours: TournamentRecordLine | null;
  readonly highestPartnership: TournamentRecordLine | null;
  readonly teams: readonly TeamTournamentStats[];
  readonly players: readonly PlayerTournamentStats[];
}

import type { NrrConfig, PointsSystem, SlotSource, TieBreakerKind, TournamentOverride, TournamentRules } from './competition';
import type { MatchEventInput } from './events';
import type { NewMatchInput } from './match';
import type { BallCount, FixtureId, IsoDateTime, MatchId, OverrideId, PoolId, Runs, Seed, SlotId, StageId, TeamId } from './primitives';
import type { MatchRules, FormatId } from './rules';
import type { QualificationState, StandingsTable, TeamQualification } from './standings';
import type { MatchSummary } from './summary';
import type { Fixture, FixtureDraft, FixtureSide, FixtureStatus, Pool, PoolEntry, Stage, StageSlot, TournamentTeam } from './tournament';

export interface FixturePatch {
  readonly sideA?: FixtureSide;
  readonly sideB?: FixtureSide;
  readonly stageId?: StageId;
  readonly poolId?: PoolId | null;
  readonly scheduledDate?: string | null;
  readonly scheduledTime?: string | null;
  readonly venueId?: string | null;
  readonly status?: Extract<FixtureStatus, 'scheduled' | 'postponed' | 'rescheduled' | 'cancelled'>;
  readonly formatId?: FormatId | null;
  readonly matchRules?: MatchRules | null;
  readonly notes?: string | null;
  readonly label?: string | null;
  readonly isFinal?: boolean;
}

export type ProposedChange =
  | {
      readonly kind: 'pool_move';
      readonly stageId: StageId;
      readonly member: FixtureSide;
      readonly toPoolId: PoolId;
      readonly removeFixtureIds: readonly FixtureId[];
      readonly addFixtures: readonly FixtureDraft[];
    }
  | { readonly kind: 'pool_swap'; readonly stageId: StageId; readonly memberA: FixtureSide; readonly memberB: FixtureSide }
  | {
      readonly kind: 'team_replace';
      readonly outTeamId: TeamId;
      readonly inTeamId: TeamId;
      readonly inSeed: number | null;
      readonly priorResults: 'transfer_to_replacement' | 'keep_for_opponents' | 'expunge';
    }
  | {
      readonly kind: 'team_withdraw';
      readonly teamId: TeamId;
      readonly remainingFixtures: 'walkover' | 'cancel';
      readonly expungeResults: boolean;
    }
  | {
      readonly kind: 'pools_replace';
      readonly stageId: StageId;
      readonly pools: readonly { readonly poolId: PoolId; readonly members: readonly FixtureSide[] }[];
      readonly seed: Seed | null;
    }
  | { readonly kind: 'team_seeds_change'; readonly seeds: readonly { readonly teamId: TeamId; readonly seed: number | null }[] }
  | {
      readonly kind: 'stage_upsert';
      readonly stage: Stage;
      readonly pools: readonly Pool[];
      readonly slots: readonly StageSlot[];
    }
  | { readonly kind: 'stage_delete'; readonly stageId: StageId }
  | { readonly kind: 'fixture_add'; readonly fixture: FixtureDraft }
  | { readonly kind: 'fixture_update'; readonly fixtureId: FixtureId; readonly patch: FixturePatch }
  | { readonly kind: 'fixture_delete'; readonly fixtureId: FixtureId }
  | {
      readonly kind: 'fixtures_replace';
      readonly stageId: StageId;
      readonly poolId: PoolId | null;
      readonly fixtures: readonly FixtureDraft[];
      readonly slots: readonly StageSlot[];
      readonly seed: Seed | null;
    }
  | { readonly kind: 'match_result_change'; readonly matchId: string; readonly summary: MatchSummary | null }
  | {
      readonly kind: 'rules_change';
      readonly stageId: StageId | null;
      readonly pointsSystem?: PointsSystem;
      readonly tieBreakers?: readonly TieBreakerKind[];
      readonly nrr?: NrrConfig;
    }
  | { readonly kind: 'slot_change'; readonly slotId: SlotId; readonly source: SlotSource }
  | { readonly kind: 'override_apply'; readonly override: TournamentOverride }
  | { readonly kind: 'override_revoke'; readonly overrideId: OverrideId };

export type ImpactSeverity = 'none' | 'info' | 'warning' | 'destructive';

export interface FixtureImpact {
  readonly fixtureId: FixtureId;
  readonly label: string;
  readonly change: 'created' | 'removed' | 'teams_changed' | 'moved' | 'rescheduled' | 'status_changed' | 'result_changed';
  readonly hasMatchData: boolean;
}

export interface StandingSnapshotLine {
  readonly position: number;
  readonly points: number;
  readonly nrr: number | null;
}

export interface StandingChange {
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly teamId: TeamId;
  readonly before: StandingSnapshotLine | null;
  readonly after: StandingSnapshotLine | null;
}

export interface QualificationChange {
  readonly stageId: StageId;
  readonly teamId: TeamId;
  readonly before: QualificationState | null;
  readonly after: QualificationState | null;
}

export interface SlotChange {
  readonly slotId: SlotId;
  readonly label: string;
  readonly beforeTeamId: TeamId | null;
  readonly afterTeamId: TeamId | null;
  readonly playedFixtureIds: readonly FixtureId[];
}

export interface ImpactSummary {
  readonly severity: ImpactSeverity;
  readonly headline: string;
  readonly lines: readonly string[];
  readonly fixtures: readonly FixtureImpact[];
  readonly standings: readonly StandingChange[];
  readonly qualification: readonly QualificationChange[];
  readonly slots: readonly SlotChange[];
  readonly nrrChanged: boolean;
  readonly completedMatchesAffected: number;
  readonly requiresConfirmation: boolean;
  readonly requiresReason: boolean;
  readonly blocked: { readonly reason: string } | null;
}

export interface ChangePlan {
  readonly tournamentTeams: { readonly upsert: readonly TournamentTeam[] };
  readonly rules: TournamentRules | null;
  readonly stages: { readonly upsert: readonly Stage[]; readonly delete: readonly StageId[] };
  readonly pools: { readonly upsert: readonly Pool[]; readonly delete: readonly PoolId[] };
  readonly slots: { readonly upsert: readonly StageSlot[]; readonly delete: readonly SlotId[] };
  readonly poolEntries: readonly { readonly stageId: StageId; readonly entries: readonly PoolEntry[] }[];
  readonly fixtures: {
    readonly insert: readonly FixtureDraft[];
    readonly update: readonly Fixture[];
    readonly delete: readonly FixtureId[];
  };
  readonly overrides: {
    readonly insert: readonly TournamentOverride[];
    readonly revoke: readonly { readonly overrideId: OverrideId; readonly at: IsoDateTime; readonly reason: string | null }[];
  };
  readonly matchesToCreate: readonly {
    readonly matchId: MatchId;
    readonly fixtureId: FixtureId;
    readonly match: NewMatchInput;
    readonly events: readonly MatchEventInput[];
  }[];
  readonly summaryChanges: readonly { readonly matchId: MatchId; readonly summary: MatchSummary | null }[];
}

export type HypotheticalOutcome =
  | 'side_a_win'
  | 'side_b_win'
  | 'tie'
  | 'no_result'
  | 'abandoned'
  | 'side_a_walkover'
  | 'side_b_walkover';

export interface HypotheticalScore {
  readonly battingFirst: 'side_a' | 'side_b';
  readonly firstInnings: { readonly runs: Runs; readonly balls: BallCount; readonly allOut: boolean };
  readonly secondInnings: { readonly runs: Runs; readonly balls: BallCount; readonly allOut: boolean };
}

export interface HypotheticalResult {
  readonly fixtureId: FixtureId;
  readonly outcome: HypotheticalOutcome;
  readonly tieWinner?: 'side_a' | 'side_b' | null;
  readonly bonus?: boolean;
  readonly score: HypotheticalScore | null;
}

export interface WhatIfResult {
  readonly hypotheticals: readonly HypotheticalResult[];
  readonly before: { readonly tables: readonly StandingsTable[]; readonly qualification: readonly TeamQualification[] };
  readonly after: { readonly tables: readonly StandingsTable[]; readonly qualification: readonly TeamQualification[] };
  readonly standingChanges: readonly StandingChange[];
  readonly qualificationChanges: readonly QualificationChange[];
  readonly slotChanges: readonly SlotChange[];
  readonly narrative: readonly string[];
}

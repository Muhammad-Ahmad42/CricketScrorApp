import type {
  BallCount,
  FixtureId,
  IsoDateTime,
  OverrideId,
  PoolId,
  Runs,
  Seed,
  SlotId,
  StageId,
  TeamId,
  TournamentId,
} from './primitives';
import type { FormatId, MatchRules } from './rules';

export type BonusPointRule = { readonly kind: 'run_rate_ratio'; readonly ratio: number; readonly points: number };

export interface PointsSystem {
  readonly win: number;
  readonly tie: number;
  readonly noResult: number;
  readonly loss: number;
  readonly abandoned: number | null;
  readonly walkoverWin: number | null;
  readonly walkoverLoss: number | null;
  readonly superOverDecidedTie: 'win_loss' | 'tie';
  readonly bonus: BonusPointRule | null;
}

export type NrrMode = 'icc' | 'actual_overs';

export type WalkoverNrrPolicy =
  | { readonly kind: 'exclude' }
  | {
      readonly kind: 'notional';
      readonly winnerRuns: Runs;
      readonly winnerBalls: BallCount;
      readonly loserRuns: Runs;
      readonly loserBalls: BallCount;
    };

export interface NrrConfig {
  readonly mode: NrrMode;
  readonly includeNoResult: boolean;
  readonly includeAbandoned: boolean;
  readonly walkover: WalkoverNrrPolicy;
  readonly awarded: 'exclude' | 'use_played_innings';
  readonly revisedTarget: 'icc_par' | 'actual';
}

export const NRR_EPSILON = 1e-9;

export const TIE_BREAKER_KINDS = [
  'points',
  'nrr',
  'head_to_head',
  'head_to_head_wins',
  'head_to_head_nrr',
  'wins',
  'fewer_losses',
  'runs_scored',
  'wickets_taken',
  'seed',
  'organizer_decision',
  'draw_lots',
] as const;
export type TieBreakerKind = (typeof TIE_BREAKER_KINDS)[number];

export type UnevenPoolNormalization = 'raw' | 'per_match_average' | 'drop_extra_results';

export type SlotSource =
  | { readonly kind: 'pool_position'; readonly stageId: StageId; readonly poolId: PoolId; readonly position: number }
  | {
      readonly kind: 'best_of_position';
      readonly stageId: StageId;
      readonly position: number;
      readonly rank: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | {
      readonly kind: 'overall_position';
      readonly stageId: StageId;
      readonly rank: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | { readonly kind: 'bracket_winner'; readonly stageId: StageId; readonly round: number; readonly position: number }
  | { readonly kind: 'bracket_loser'; readonly stageId: StageId; readonly round: number; readonly position: number }
  | { readonly kind: 'fixture_winner'; readonly fixtureId: FixtureId }
  | { readonly kind: 'fixture_loser'; readonly fixtureId: FixtureId }
  | { readonly kind: 'manual'; readonly teamId: TeamId | null };

export type SlotSourceKind = SlotSource['kind'];

export type QualificationRule =
  | { readonly kind: 'top_per_pool'; readonly sourceStageId: StageId; readonly count: number; readonly fromPosition: number }
  | { readonly kind: 'pool_position'; readonly sourceStageId: StageId; readonly poolId: PoolId; readonly position: number }
  | {
      readonly kind: 'best_of_position';
      readonly sourceStageId: StageId;
      readonly position: number;
      readonly count: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | {
      readonly kind: 'top_overall';
      readonly sourceStageId: StageId;
      readonly count: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | { readonly kind: 'knockout_winners'; readonly sourceStageId: StageId }
  | { readonly kind: 'manual'; readonly count: number; readonly label: string }
  | { readonly kind: 'direct_entry'; readonly teamIds: readonly TeamId[] };

export type SeedingMethod = 'fixed' | 'random' | 'ranking';

export interface KnockoutConfig {
  readonly thirdPlacePlayoff: boolean;
  readonly rounds: number | null;
  readonly tiedMatch: 'super_over' | 'boundary_count' | 'higher_seed' | 'organizer';
  readonly noResult: 'higher_seed' | 'replay' | 'organizer' | 'shared';
}

export interface TournamentRules {
  readonly tournamentId: TournamentId;
  readonly pointsSystem: PointsSystem;
  readonly nrr: NrrConfig;
  readonly tieBreakers: readonly TieBreakerKind[];
  readonly defaultFormatId: FormatId;
  readonly defaultMatchRules: MatchRules;
  readonly updatedAt: IsoDateTime;
}

interface OverrideBase {
  readonly id: OverrideId;
  readonly tournamentId: TournamentId;
  readonly reason: string;
  readonly createdAt: IsoDateTime;
  readonly revokedAt: IsoDateTime | null;
  readonly revokeReason: string | null;
}

export type TournamentOverride =
  | (OverrideBase & {
      readonly kind: 'qualification';
      readonly stageId: StageId;
      readonly teamId: TeamId;
      readonly action: 'qualify' | 'eliminate' | 'reassign';
      readonly slotId: SlotId | null;
      readonly poolId: PoolId | null;
    })
  | (OverrideBase & {
      readonly kind: 'points_adjustment';
      readonly stageId: StageId;
      readonly poolId: PoolId | null;
      readonly teamId: TeamId;
      readonly points: number;
    })
  | (OverrideBase & {
      readonly kind: 'tie_resolution';
      readonly stageId: StageId;
      readonly poolId: PoolId | null;
      readonly orderedTeamIds: readonly TeamId[];
      readonly method: 'organizer_decision' | 'draw_lots';
      readonly seed: Seed | null;
    })
  | (OverrideBase & { readonly kind: 'slot_assignment'; readonly slotId: SlotId; readonly teamId: TeamId })
  | (OverrideBase & { readonly kind: 'expunge_results'; readonly stageId: StageId | null; readonly teamId: TeamId })
  | (OverrideBase & { readonly kind: 'champion'; readonly teamIds: readonly TeamId[] });

export type TournamentOverrideKind = TournamentOverride['kind'];

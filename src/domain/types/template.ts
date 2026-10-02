import type { KnockoutConfig, NrrConfig, PointsSystem, SeedingMethod, TieBreakerKind, UnevenPoolNormalization } from './competition';
import type { Id, IsoDateTime } from './primitives';
import type { FormatId, MatchRules } from './rules';
import type { FixtureGenerationConfig, StageType, TournamentStructureKind } from './tournament';

export type TemplateEntryRule =
  | { readonly kind: 'top_per_pool'; readonly sourceStageKey: string; readonly count: number; readonly fromPosition: number }
  | { readonly kind: 'pool_position'; readonly sourceStageKey: string; readonly poolIndex: number; readonly position: number }
  | {
      readonly kind: 'best_of_position';
      readonly sourceStageKey: string;
      readonly position: number;
      readonly count: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | {
      readonly kind: 'top_overall';
      readonly sourceStageKey: string;
      readonly count: number;
      readonly normalization: UnevenPoolNormalization;
    }
  | { readonly kind: 'knockout_winners'; readonly sourceStageKey: string }
  | { readonly kind: 'manual'; readonly count: number; readonly label: string }
  | { readonly kind: 'direct_entry'; readonly count: number };

export interface TemplateStage {
  readonly key: string;
  readonly name: string;
  readonly type: StageType;
  readonly poolCount: number;
  readonly poolSizes: readonly number[] | null;
  readonly poolSlotIndexes: readonly (readonly number[])[] | null;
  readonly fixtureGeneration: FixtureGenerationConfig;
  readonly seeding: SeedingMethod;
  readonly seedingNormalization: UnevenPoolNormalization;
  readonly entry: readonly TemplateEntryRule[];
  readonly knockout: KnockoutConfig | null;
  readonly abandonedMatches: 'no_result' | 'replay';
  readonly decidesChampion: boolean;
  readonly headToHeadRequiresCompleteMiniLeague: boolean;
  readonly formatId: FormatId | null;
  readonly matchRules: MatchRules | null;
  readonly pointsSystem: PointsSystem | null;
  readonly tieBreakers: readonly TieBreakerKind[] | null;
  readonly nrr: NrrConfig | null;
}

export interface TournamentTemplate {
  readonly id: Id;
  readonly name: string;
  readonly description: string;
  readonly builtin: boolean;
  readonly teamCount: number | null;
  readonly structureKind: TournamentStructureKind;
  readonly pointsSystem: PointsSystem;
  readonly nrr: NrrConfig;
  readonly tieBreakers: readonly TieBreakerKind[];
  readonly defaultFormatId: FormatId;
  readonly defaultMatchRules: MatchRules;
  readonly stages: readonly TemplateStage[];
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

import type {
  KnockoutConfig,
  NrrConfig,
  PointsSystem,
  QualificationRule,
  SeedingMethod,
  SlotSource,
  TieBreakerKind,
  TournamentOverride,
  TournamentRules,
  UnevenPoolNormalization,
} from './competition';
import type {
  FixtureId,
  IsoDate,
  IsoDateTime,
  LocalTime,
  MatchId,
  PoolId,
  Seed,
  SlotId,
  StageId,
  TeamId,
  TournamentId,
  VenueId,
} from './primitives';
import type { FormatId, MatchRules } from './rules';
import type { MatchSummary } from './summary';
import type { Team } from './team';

export const TOURNAMENT_STATUSES = [
  'draft',
  'registration',
  'structure_configured',
  'pools_configured',
  'fixtures_generated',
  'active',
  'completed',
  'archived',
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export type TournamentStructureKind = 'league' | 'groups' | 'knockout' | 'groups_knockout' | 'custom';

export interface Tournament {
  readonly id: TournamentId;
  readonly name: string;
  readonly season: string | null;
  readonly description: string | null;
  readonly logoUri: string | null;
  readonly organizer: string | null;
  readonly contact: string | null;
  readonly location: string | null;
  readonly notes: string | null;
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
  readonly venueIds: readonly VenueId[];
  readonly structureKind: TournamentStructureKind;
  readonly status: TournamentStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface TournamentTeam {
  readonly id: string;
  readonly tournamentId: TournamentId;
  readonly teamId: TeamId;
  readonly seed: number | null;
  readonly status: 'active' | 'withdrawn' | 'replaced';
  readonly replacedByTeamId: TeamId | null;
  readonly inheritsFromTeamId: TeamId | null;
  readonly joinedAt: IsoDateTime;
}

export const STAGE_TYPES = ['league', 'group', 'knockout', 'custom'] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export type StageStatus = 'pending' | 'active' | 'completed';

export interface FixtureGenerationConfig {
  readonly method: 'round_robin' | 'manual' | 'knockout';
  readonly legs: number;
}

export interface StageConfig {
  readonly fixtureGeneration: FixtureGenerationConfig;
  readonly seeding: SeedingMethod;
  readonly seedingSeed: Seed | null;
  readonly seedingNormalization: UnevenPoolNormalization;
  readonly pointsSystem: PointsSystem | null;
  readonly tieBreakers: readonly TieBreakerKind[] | null;
  readonly headToHeadRequiresCompleteMiniLeague: boolean;
  readonly nrr: NrrConfig | null;
  readonly entryRules: readonly QualificationRule[];
  readonly knockout: KnockoutConfig | null;
  readonly abandonedMatches: 'no_result' | 'replay';
  readonly decidesChampion: boolean;
  readonly formatId: FormatId | null;
  readonly matchRules: MatchRules | null;
}

export interface Stage {
  readonly id: StageId;
  readonly tournamentId: TournamentId;
  readonly name: string;
  readonly type: StageType;
  readonly orderIndex: number;
  readonly status: StageStatus;
  readonly config: StageConfig;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface Pool {
  readonly id: PoolId;
  readonly stageId: StageId;
  readonly name: string;
  readonly orderIndex: number;
  readonly legs: number | null;
}

export type FixtureSide = { readonly kind: 'team'; readonly teamId: TeamId } | { readonly kind: 'slot'; readonly slotId: SlotId };

export interface PoolEntry {
  readonly id: string;
  readonly poolId: PoolId;
  readonly stageId: StageId;
  readonly side: FixtureSide;
  readonly seed: number | null;
}

export interface StageSlot {
  readonly id: SlotId;
  readonly stageId: StageId;
  readonly index: number;
  readonly role: 'entry' | 'progression';
  readonly label: string;
  readonly source: SlotSource;
  readonly seed: number | null;
}

export const FIXTURE_STATUSES = ['scheduled', 'postponed', 'rescheduled', 'live', 'completed', 'abandoned', 'cancelled'] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

export interface BracketPosition {
  readonly kind: 'main' | 'third_place' | 'placement';
  readonly round: number;
  readonly position: number;
  readonly roundName: string;
}

export interface Fixture {
  readonly id: FixtureId;
  readonly tournamentId: TournamentId;
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly matchNumber: number;
  readonly label: string | null;
  readonly round: number | null;
  readonly leg: number | null;
  readonly bracket: BracketPosition | null;
  readonly isFinal: boolean;
  readonly sideA: FixtureSide;
  readonly sideB: FixtureSide;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
  readonly venueId: VenueId | null;
  readonly status: FixtureStatus;
  readonly matchId: MatchId | null;
  readonly matchSides: { readonly teamAId: TeamId; readonly teamBId: TeamId } | null;
  readonly formatId: FormatId | null;
  readonly matchRules: MatchRules | null;
  readonly notes: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type FixtureDraft = Omit<Fixture, 'createdAt' | 'updatedAt' | 'matchId' | 'matchSides'>;

export interface TournamentTeamView {
  readonly membership: TournamentTeam;
  readonly team: Team;
}

export interface TournamentSnapshot {
  readonly version: string;
  readonly tournament: Tournament;
  readonly rules: TournamentRules;
  readonly teams: readonly TournamentTeamView[];
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly poolEntries: readonly PoolEntry[];
  readonly slots: readonly StageSlot[];
  readonly fixtures: readonly Fixture[];
  readonly summaries: Readonly<Record<MatchId, MatchSummary>>;
  readonly staleSummaryMatchIds: readonly MatchId[];
  readonly overrides: readonly TournamentOverride[];
  readonly supersededMatches?: readonly SupersededMatch[];
}

export interface SupersededMatch {
  readonly fixtureId: FixtureId;
  readonly matchId: MatchId;
}

import type {
  Fixture,
  FixtureSide,
  MatchId,
  MatchSummary,
  NrrConfig,
  PointsSystem,
  PoolId,
  StageId,
  StandingsTable,
  TeamId,
  TieBreakerKind,
  TournamentOverride,
  TournamentSnapshot,
  UnevenPoolNormalization,
} from '../types';
import { buildStandingRows } from './evaluation/standingRows';
import { isSettledStatus } from './evaluation/sides';

export interface EffectiveStageRules {
  readonly points: PointsSystem;
  readonly nrr: NrrConfig;
  readonly tieBreakers: readonly TieBreakerKind[];
  readonly headToHeadRequiresCompleteMiniLeague: boolean;
}

export function effectiveStageRules(snapshot: TournamentSnapshot, stageId: StageId): EffectiveStageRules {
  const stage = snapshot.stages.find((candidate) => candidate.id === stageId);
  const config = stage?.config;
  return {
    points: config?.pointsSystem ?? snapshot.rules.pointsSystem,
    nrr: config?.nrr ?? snapshot.rules.nrr,
    tieBreakers: config?.tieBreakers ?? snapshot.rules.tieBreakers,
    headToHeadRequiresCompleteMiniLeague: config?.headToHeadRequiresCompleteMiniLeague ?? false,
  };
}

export interface StandingsMember {
  readonly side: FixtureSide;
  readonly slotLabel: string | null;
  readonly teamId: TeamId | null;
  readonly provisional: boolean;
  readonly membership: 'active' | 'withdrawn' | 'replaced';
  readonly inheritsFrom: readonly TeamId[];
}

export interface StandingsInput {
  readonly stageId: StageId;
  readonly poolId: PoolId | null;
  readonly members: readonly StandingsMember[];
  readonly fixtures: readonly Fixture[];
  readonly fixtureTeams: (fixture: Fixture) => { readonly a: TeamId | null; readonly b: TeamId | null };
  readonly summaries: Readonly<Record<MatchId, MatchSummary>>;
  readonly rules: EffectiveStageRules;
  readonly overrides: readonly TournamentOverride[];
  readonly seeds: ReadonlyMap<TeamId, number | null>;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  readonly normalization?: UnevenPoolNormalization;
  readonly poolOrder?: ReadonlyMap<PoolId, readonly TeamId[]>;
}

export function computeStandings(input: StandingsInput): StandingsTable {
  const { rows, provisionalTies } = buildStandingRows(input);
  return {
    stageId: input.stageId,
    poolId: input.poolId,
    rows,
    tieBreakers: input.rules.tieBreakers,
    complete: input.fixtures.length > 0 && input.fixtures.every((fixture) => isSettledStatus(fixture.status)),
    unresolvedTies: [],
    provisionalTies,
  };
}

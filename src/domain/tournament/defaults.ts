import type { KnockoutConfig, NrrConfig, PointsSystem, StageConfig, StageType, TieBreakerKind } from '../types';

export const DEFAULT_POINTS_SYSTEM: PointsSystem = {
  win: 2,
  tie: 1,
  noResult: 1,
  loss: 0,
  abandoned: null,
  walkoverWin: null,
  walkoverLoss: null,
  superOverDecidedTie: 'win_loss',
  bonus: null,
};

export const DEFAULT_NRR_CONFIG: NrrConfig = {
  mode: 'icc',
  includeNoResult: false,
  includeAbandoned: false,
  walkover: { kind: 'exclude' },
  awarded: 'exclude',
  revisedTarget: 'icc_par',
};

export const DEFAULT_TIE_BREAKERS: readonly TieBreakerKind[] = ['points', 'nrr', 'head_to_head', 'wins', 'organizer_decision'];

export const DEFAULT_KNOCKOUT_CONFIG: KnockoutConfig = {
  thirdPlacePlayoff: false,
  rounds: null,
  tiedMatch: 'super_over',
  noResult: 'higher_seed',
};

const BASE_STAGE_CONFIG: StageConfig = {
  fixtureGeneration: { method: 'round_robin', legs: 1 },
  seeding: 'fixed',
  seedingSeed: null,
  seedingNormalization: 'raw',
  pointsSystem: null,
  tieBreakers: null,
  headToHeadRequiresCompleteMiniLeague: false,
  nrr: null,
  entryRules: [],
  knockout: null,
  abandonedMatches: 'no_result',
  decidesChampion: false,
  formatId: null,
  matchRules: null,
};

export const DEFAULT_STAGE_CONFIGS: { readonly [K in StageType]: StageConfig } = {
  league: BASE_STAGE_CONFIG,
  group: BASE_STAGE_CONFIG,
  knockout: {
    ...BASE_STAGE_CONFIG,
    fixtureGeneration: { method: 'knockout', legs: 1 },
    knockout: DEFAULT_KNOCKOUT_CONFIG,
  },
  custom: { ...BASE_STAGE_CONFIG, fixtureGeneration: { method: 'manual', legs: 1 } },
};

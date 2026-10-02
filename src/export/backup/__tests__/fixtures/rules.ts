import type { KnockoutConfig, MatchRules, NrrConfig, PointsSystem, StageConfig } from '@/domain/types';

export const RULES: MatchRules = {
  oversPerInnings: 1,
  ballsPerOver: 6,
  playersPerSide: 3,
  lastManStands: false,
  maxOversPerBowler: null,
  bowlerQuotaMode: 'uniform',
  allowBowlerConsecutiveOvers: true,
  wide: { penaltyRuns: 1, countsAsBall: false },
  noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: false },
  powerplays: [],
  superOver: { enabled: false, overs: 1, maxWickets: 2, ifTiedAgain: 'repeat', maxRounds: null, restrictRepeatPlayers: true },
  mandatoryRetirement: null,
};

export const POINTS: PointsSystem = {
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

export const NRR: NrrConfig = {
  mode: 'icc',
  includeNoResult: false,
  includeAbandoned: false,
  walkover: { kind: 'exclude' },
  awarded: 'exclude',
  revisedTarget: 'icc_par',
};

export const KNOCKOUT: KnockoutConfig = { thirdPlacePlayoff: false, rounds: null, tiedMatch: 'super_over', noResult: 'higher_seed' };

export function stageConfig(overrides: Partial<StageConfig> = {}): StageConfig {
  return {
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
    ...overrides,
  };
}

export const T0 = '2026-09-01T10:00:00.000Z';

export function at(second: number): string {
  const base = Date.UTC(2026, 8, 1, 10, 0, 0);
  return new Date(base + second * 1000).toISOString();
}

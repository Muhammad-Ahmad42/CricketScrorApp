import type {
  FixtureStatus,
  KnockoutConfig,
  NrrMode,
  SeedingMethod,
  StageStatus,
  StageType,
  TournamentStatus,
  TournamentStructureKind,
} from '@/domain/types';

export const TOURNAMENT_STATUS_LABEL: { readonly [K in TournamentStatus]: string } = {
  draft: 'Draft',
  registration: 'Setting up',
  structure_configured: 'Setting up',
  pools_configured: 'Setting up',
  fixtures_generated: 'Ready',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const STRUCTURE_KIND_LABEL: { readonly [K in TournamentStructureKind]: string } = {
  league: 'League',
  groups: 'Groups',
  knockout: 'Knockout',
  groups_knockout: 'Groups + knockout',
  custom: 'Custom',
};

export const STRUCTURE_KIND_KEY: { readonly [K in TournamentStructureKind]: string } = {
  league: 'league',
  groups: 'groups',
  knockout: 'knockout',
  groups_knockout: 'groups-knockout',
  custom: 'custom',
};

export const STAGE_TYPE_LABEL: { readonly [K in StageType]: string } = {
  league: 'League',
  group: 'Groups',
  knockout: 'Knockout',
  custom: 'Custom',
};

export const STAGE_STATUS_LABEL: { readonly [K in StageStatus]: string } = {
  pending: 'Not started',
  active: 'In progress',
  completed: 'Completed',
};

export const FIXTURE_STATUS_LABEL: { readonly [K in FixtureStatus]: string } = {
  scheduled: 'Scheduled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
  live: 'Live',
  completed: 'Completed',
  abandoned: 'Abandoned',
  cancelled: 'Cancelled',
};

export const NRR_MODE_LABEL: { readonly [K in NrrMode]: string } = {
  icc: 'ICC: all out counts as full overs',
  actual_overs: 'Actual overs faced',
};

export const SEEDING_LABEL: { readonly [K in SeedingMethod]: string } = {
  fixed: 'Fixed',
  random: 'Random',
  ranking: 'Ranking',
};

export const TIED_MATCH_LABEL: { readonly [K in KnockoutConfig['tiedMatch']]: string } = {
  super_over: 'Super over',
  boundary_count: 'Boundary count',
  higher_seed: 'Higher seed advances',
  organizer: 'Organizer decides',
};

export const NO_RESULT_LABEL: { readonly [K in KnockoutConfig['noResult']]: string } = {
  higher_seed: 'Higher seed advances',
  replay: 'Replay the match',
  organizer: 'Organizer decides',
  shared: 'Shared',
};

export const REPEAT_DRAW_LABEL = 'Repeat a draw';

export const SETUP_STATUSES: readonly TournamentStatus[] = ['draft', 'registration', 'structure_configured', 'pools_configured'];

export function isSetupStatus(status: TournamentStatus): boolean {
  return SETUP_STATUSES.includes(status);
}

export function legsLabel(legs: number): string {
  if (legs === 1) {
    return 'single round robin';
  }
  if (legs === 2) {
    return 'double round robin';
  }
  return `round robin, ${legs} matches per opponent`;
}

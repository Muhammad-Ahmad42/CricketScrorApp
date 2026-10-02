import type { FixtureStatus, MatchStatus, StageStatus, TournamentStatus } from '../../types';

export const TOURNAMENT_STATUS_LABELS: { readonly [K in TournamentStatus]: string } = {
  draft: 'Draft',
  registration: 'Registration',
  structure_configured: 'Structure configured',
  pools_configured: 'Pools configured',
  fixtures_generated: 'Fixtures generated',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const STAGE_STATUS_LABELS: { readonly [K in StageStatus]: string } = {
  pending: 'Not started',
  active: 'In progress',
  completed: 'Completed',
};

export const FIXTURE_STATUS_LABELS: { readonly [K in FixtureStatus]: string } = {
  scheduled: 'Scheduled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
  live: 'Live',
  completed: 'Completed',
  abandoned: 'Abandoned',
  cancelled: 'Cancelled',
};

export const MATCH_STATUS_LABELS: { readonly [K in MatchStatus]: string } = {
  scheduled: 'Scheduled',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
};

export function edgeKey(from: string, to: string): string {
  return `${from}>${to}`;
}

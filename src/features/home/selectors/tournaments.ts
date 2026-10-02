import type { TournamentListItem, TournamentStatus } from '@/domain/types';
import { formatShortDate } from '@/features/scoring/selectors/dates';

export const TOURNAMENT_STATUS_TEXT: { readonly [K in TournamentStatus]: string } = {
  draft: 'Setting up',
  registration: 'Setting up',
  structure_configured: 'Setting up',
  pools_configured: 'Setting up',
  fixtures_generated: 'Ready to start',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const SETUP_STATUSES: readonly TournamentStatus[] = ['draft', 'registration', 'structure_configured', 'pools_configured'];

export function isTournamentInSetup(status: TournamentStatus): boolean {
  return SETUP_STATUSES.includes(status);
}

export function isTournamentFinished(status: TournamentStatus): boolean {
  return status === 'completed' || status === 'archived';
}

export interface TournamentRowVM {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly detail: string;
  readonly inSetup: boolean;
  readonly accessibilityLabel: string;
}

export function selectTournamentRow(item: TournamentListItem): TournamentRowVM {
  const inSetup = isTournamentInSetup(item.status);
  const progress = item.fixturesTotal > 0 && !inSetup ? ` · ${item.fixturesDone}/${item.fixturesTotal}` : '';
  const status = `${TOURNAMENT_STATUS_TEXT[item.status]}${progress}`;
  const dates = [formatShortDate(item.startDate), formatShortDate(item.endDate)].filter((part): part is string => part !== null).join(' – ');
  const detail = item.championName !== null
    ? `Champion: ${item.championName}`
    : [item.season, `${item.teamCount} teams`, dates === '' ? null : dates].filter((part): part is string => part !== null && part !== '').join(' · ');
  return {
    id: item.id,
    name: item.name,
    status,
    detail,
    inSetup,
    accessibilityLabel: `${item.name}, ${status}, ${detail}`,
  };
}

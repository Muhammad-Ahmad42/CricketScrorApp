import type { TournamentListItem, TournamentStatus } from '@/domain/types';
import { plural } from '@/features/shared';
import { TOURNAMENT_STATUS_LABEL, isSetupStatus } from '../labels';
import { formatDateRange } from './dates';

export type TournamentListFilter = 'all' | 'active' | 'drafts' | 'completed';

const FILTER_STATUSES: { readonly [K in Exclude<TournamentListFilter, 'all'>]: readonly TournamentStatus[] } = {
  active: ['fixtures_generated', 'active'],
  drafts: ['draft', 'registration', 'structure_configured', 'pools_configured'],
  completed: ['completed', 'archived'],
};

export interface TournamentRowVM {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly statusLabel: string;
  readonly progressText: string | null;
  readonly progressRatio: number;
  readonly champion: string | null;
  readonly draft: boolean;
  readonly accessibilityLabel: string;
}

export function filterTournaments(items: readonly TournamentListItem[], filter: TournamentListFilter): readonly TournamentListItem[] {
  const filtered = filter === 'all' ? items : items.filter((item) => FILTER_STATUSES[filter].includes(item.status));
  return [...filtered].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

export function tournamentRowVM(item: TournamentListItem): TournamentRowVM {
  const draft = isSetupStatus(item.status);
  const name = item.season ? `${item.name} ${item.season}` : item.name;
  const dates = formatDateRange(item.startDate, item.endDate);
  const metaParts = [plural(item.teamCount, 'team')];
  if (dates) {
    metaParts.push(dates);
  }
  const progressText = draft || item.fixturesTotal === 0 ? null : `${item.fixturesDone} of ${item.fixturesTotal} played`;
  const statusLabel = TOURNAMENT_STATUS_LABEL[item.status];
  const spoken = [name, metaParts.join(', '), statusLabel];
  if (progressText) {
    spoken.push(`${item.fixturesDone} of ${plural(item.fixturesTotal, 'match', 'matches')} played`);
  }
  if (item.championName) {
    spoken.push(`Champion ${item.championName}`);
  }
  return {
    key: item.id,
    id: item.id,
    name,
    meta: metaParts.join(' · '),
    statusLabel,
    progressText,
    progressRatio: item.fixturesTotal === 0 ? 0 : item.fixturesDone / item.fixturesTotal,
    champion: item.championName,
    draft,
    accessibilityLabel: spoken.join(', '),
  };
}

export function emptyListText(filter: TournamentListFilter): string {
  switch (filter) {
    case 'drafts':
      return 'No drafts';
    case 'completed':
      return 'No completed tournaments';
    case 'active':
      return 'No active tournaments';
    case 'all':
      return 'No tournaments yet';
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
}

import type { MatchListItem, MatchListQuery, MatchStatus } from '@/domain/types';
import { matchMonthHeading } from '@/features/scoring/selectors/dates';
import { selectMatchCard, type MatchCardVM } from './matchCard';

export type StatusFilter = 'all' | 'live' | 'completed' | 'scheduled' | 'abandoned' | 'cancelled';
export type SortOption = NonNullable<MatchListQuery['sort']>;

export const STATUS_FILTERS: readonly { readonly key: StatusFilter; readonly label: string; readonly statuses: readonly MatchStatus[] }[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'live', label: 'Live', statuses: ['live', 'paused'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['scheduled', 'postponed'] },
  { key: 'abandoned', label: 'Abandoned', statuses: ['abandoned'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

export const SORT_OPTIONS: readonly { readonly key: SortOption; readonly label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'scheduled', label: 'Scheduled' },
];

export function statusFilterOf(query: MatchListQuery): StatusFilter {
  const statuses = query.statuses ?? [];
  const match = STATUS_FILTERS.find((filter) => filter.statuses.length === statuses.length && filter.statuses.every((status) => statuses.includes(status)));
  return match?.key ?? 'all';
}

export function withStatus(query: MatchListQuery, filter: StatusFilter): MatchListQuery {
  const statuses = STATUS_FILTERS.find((entry) => entry.key === filter)?.statuses ?? [];
  return { ...query, statuses: statuses.length === 0 ? undefined : statuses, offset: 0 };
}

export function withTeam(query: MatchListQuery, teamId: string | null): MatchListQuery {
  return { ...query, teamId: teamId ?? undefined, offset: 0 };
}

export function withSearch(query: MatchListQuery, search: string): MatchListQuery {
  const text = search.trim();
  return { ...query, search: text === '' ? undefined : text, offset: 0 };
}

export function withSort(query: MatchListQuery, sort: SortOption): MatchListQuery {
  return { ...query, sort, offset: 0 };
}

export function hasFilters(query: MatchListQuery): boolean {
  return (query.statuses?.length ?? 0) > 0 || query.teamId !== undefined || (query.search ?? '') !== '';
}

export type HistoryRow = { readonly type: 'header'; readonly key: string; readonly title: string } | { readonly type: 'match'; readonly key: string; readonly vm: MatchCardVM };

export function historyRows(items: readonly MatchListItem[]): readonly HistoryRow[] {
  const rows: HistoryRow[] = [];
  let current: string | null = null;
  for (const item of items) {
    const heading = matchMonthHeading(item);
    if (heading !== current) {
      current = heading;
      rows.push({ type: 'header', key: `header-${heading}-${rows.length}`, title: heading });
    }
    rows.push({ type: 'match', key: item.id, vm: selectMatchCard(item) });
  }
  return rows;
}

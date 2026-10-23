import type { IsoDate, IsoDateTime, MatchListItem } from '../types';

export type MatchDateBasis = 'played' | 'scheduled' | 'updated';

export interface MatchDisplayDate {
  readonly value: IsoDateTime | IsoDate;
  readonly basis: MatchDateBasis;
}

export type MatchDateSource = Pick<MatchListItem, 'scheduledDate' | 'updatedAt' | 'startedAt' | 'completedAt'>;

export function matchDisplayDate(source: MatchDateSource): MatchDisplayDate {
  const played = source.startedAt ?? source.completedAt ?? null;
  if (played !== null) {
    return { value: played, basis: 'played' };
  }
  if (source.scheduledDate !== null) {
    return { value: source.scheduledDate, basis: 'scheduled' };
  }
  return { value: source.updatedAt, basis: 'updated' };
}

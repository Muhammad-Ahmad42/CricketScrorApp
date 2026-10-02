import type { TeamId, TieBreakerKind } from '../../types';
import { compareNrr } from '../nrr';
import type { HeadToHeadRecord, TeamRecord } from '../tiebreakers';
import { formatSignedNrr, pointsText } from './format';

export type RecordCriterion = Exclude<
  TieBreakerKind,
  'head_to_head' | 'head_to_head_wins' | 'head_to_head_nrr' | 'organizer_decision' | 'draw_lots'
>;

export type HeadToHeadCriterion = Extract<TieBreakerKind, 'head_to_head' | 'head_to_head_wins' | 'head_to_head_nrr'>;

export function isHeadToHead(kind: TieBreakerKind): kind is HeadToHeadCriterion {
  return kind === 'head_to_head' || kind === 'head_to_head_wins' || kind === 'head_to_head_nrr';
}

export function isResolution(kind: TieBreakerKind): kind is 'organizer_decision' | 'draw_lots' {
  return kind === 'organizer_decision' || kind === 'draw_lots';
}

function descending(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function seedOrder(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function compareRecords(kind: RecordCriterion, a: TeamRecord, b: TeamRecord): number {
  switch (kind) {
    case 'points':
      return descending(a.points, b.points);
    case 'nrr':
      return compareNrr(a.nrr, b.nrr);
    case 'wins':
      return descending(a.won, b.won);
    case 'fewer_losses':
      return descending(b.lost, a.lost);
    case 'runs_scored':
      return descending(a.runsScored, b.runsScored);
    case 'wickets_taken':
      return descending(a.wicketsTaken, b.wicketsTaken);
    case 'seed':
      return seedOrder(a.seed, b.seed);
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function compareHeadToHead(kind: HeadToHeadCriterion, a: HeadToHeadRecord, b: HeadToHeadRecord): number {
  switch (kind) {
    case 'head_to_head':
      return descending(a.points, b.points);
    case 'head_to_head_wins':
      return descending(a.wins, b.wins);
    case 'head_to_head_nrr':
      return compareNrr(a.nrr, b.nrr);
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function recordValueText(kind: RecordCriterion, record: TeamRecord): string {
  switch (kind) {
    case 'points':
      return Number.isFinite(record.points) ? pointsText(record.points) : 'no matches';
    case 'nrr':
      return formatSignedNrr(record.nrr);
    case 'wins':
      return String(record.won);
    case 'fewer_losses':
      return String(record.lost);
    case 'runs_scored':
      return String(record.runsScored);
    case 'wickets_taken':
      return String(record.wicketsTaken);
    case 'seed':
      return record.seed === null ? 'unseeded' : `seed ${record.seed}`;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function headToHeadValueText(kind: HeadToHeadCriterion, record: HeadToHeadRecord): string {
  switch (kind) {
    case 'head_to_head':
      return pointsText(record.points);
    case 'head_to_head_wins':
      return String(record.wins);
    case 'head_to_head_nrr':
      return formatSignedNrr(record.nrr);
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export const CRITERION_PHRASE: { readonly [K in TieBreakerKind]: string } = {
  points: 'points',
  nrr: 'net run rate',
  head_to_head: 'head-to-head',
  head_to_head_wins: 'head-to-head wins',
  head_to_head_nrr: 'head-to-head net run rate',
  wins: 'wins',
  fewer_losses: 'fewer losses',
  runs_scored: 'runs scored',
  wickets_taken: 'wickets taken',
  seed: 'seeding',
  organizer_decision: 'organizer decision',
  draw_lots: 'draw of lots',
};

export const CRITERION_LABEL: { readonly [K in TieBreakerKind]: string } = {
  points: 'Points',
  nrr: 'NRR',
  head_to_head: 'Head-to-Head',
  head_to_head_wins: 'Head-to-Head wins',
  head_to_head_nrr: 'Head-to-Head NRR',
  wins: 'Most wins',
  fewer_losses: 'Fewest losses',
  runs_scored: 'Runs scored',
  wickets_taken: 'Wickets taken',
  seed: 'Seeding',
  organizer_decision: 'Organizer decision',
  draw_lots: 'Draw of lots',
};

export function splitSorted<T>(items: readonly T[], compare: (a: T, b: T) => number): T[][] {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map((entry) => entry.item);
  const groups: T[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current && compare(current[current.length - 1], item) === 0) current.push(item);
    else groups.push([item]);
  }
  return groups;
}

export function teamIdsOf(records: readonly { readonly teamId: TeamId }[]): TeamId[] {
  return records.map((record) => record.teamId);
}

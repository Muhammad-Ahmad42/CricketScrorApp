import type { ImportReport } from '@/services/contracts';
import { collectionForKey, HEADLINE_COLLECTIONS, nounForKey, type BackupCollection } from './backupNouns';
import { countOf, joinList } from './text';

interface Entry {
  readonly key: string;
  readonly count: number;
  readonly rank: number;
}

function rankOf(key: string): number {
  const collection: BackupCollection | null = collectionForKey(key);
  const index = collection ? HEADLINE_COLLECTIONS.indexOf(collection) : -1;
  return index >= 0 ? index : HEADLINE_COLLECTIONS.length;
}

function mergedEntries(counts: ImportReport['imported']): readonly Entry[] {
  const byNoun = new Map<string, Entry>();
  for (const [key, count] of Object.entries(counts)) {
    if (!(count > 0)) {
      continue;
    }
    const nounKey = collectionForKey(key) ?? key;
    const previous = byNoun.get(nounKey);
    byNoun.set(nounKey, { key, count: (previous?.count ?? 0) + count, rank: rankOf(key) });
  }
  return [...byNoun.values()].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
}

const PRIMARY: readonly BackupCollection[] = ['tournaments', 'matches'];
const HEADLINE_LIMIT = 2;

function shownEntries(counts: ImportReport['imported']): readonly Entry[] {
  const entries = mergedEntries(counts);
  const headline = entries.filter((entry) => entry.rank < HEADLINE_COLLECTIONS.length);
  return headline.length > 0 ? headline : entries;
}

function words(entries: readonly Entry[]): readonly string[] {
  return entries.map((entry) => countOf(entry.count, nounForKey(entry.key)));
}

function isPrimary(entry: Entry): boolean {
  const collection = collectionForKey(entry.key);
  return collection !== null && PRIMARY.includes(collection);
}

export interface ImportReportLines {
  readonly headline: string;
  readonly supporting: string | null;
}

export function importReportLines(report: ImportReport): ImportReportLines {
  const imported = shownEntries(report.imported);
  const primary = imported.filter(isPrimary);
  const lead = primary.length > 0 ? primary : imported.slice(0, HEADLINE_LIMIT);
  const rest = imported.filter((entry) => !lead.includes(entry));
  const skipped = words(shownEntries(report.skipped));
  const supporting =
    skipped.length > 0 ? `Skipped ${skipped.join(', ')} already on this phone` : rest.length > 0 ? `Also ${joinList(words(rest))}` : null;
  return {
    headline: lead.length > 0 ? `Imported ${words(lead).join(', ')}` : 'Nothing new was imported',
    supporting,
  };
}

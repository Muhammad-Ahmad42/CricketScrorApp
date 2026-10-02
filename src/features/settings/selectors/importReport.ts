import type { ImportReport } from '@/services/contracts';
import { collectionForKey, HEADLINE_COLLECTIONS, nounForKey, type BackupCollection } from './backupNouns';
import { countOf } from './text';

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

function describe(counts: ImportReport['imported']): readonly string[] {
  const entries = mergedEntries(counts);
  const headline = entries.filter((entry) => entry.rank < HEADLINE_COLLECTIONS.length);
  const shown = headline.length > 0 ? headline : entries;
  return shown.map((entry) => countOf(entry.count, nounForKey(entry.key)));
}

export function importReportText(report: ImportReport): string {
  const imported = describe(report.imported);
  const skipped = describe(report.skipped);
  const sentences: string[] = [];
  if (imported.length > 0) {
    sentences.push(`Imported ${imported.join(', ')}.`);
  } else {
    sentences.push('Nothing new was imported. Everything in this file is already on this phone.');
  }
  if (skipped.length > 0) {
    sentences.push(`Skipped ${skipped.join(', ')} already on this phone.`);
  }
  if (report.rebuiltMatches > 0) {
    sentences.push(`Recalculated ${countOf(report.rebuiltMatches, { one: 'scorecard', many: 'scorecards' })}.`);
  }
  return sentences.join(' ');
}

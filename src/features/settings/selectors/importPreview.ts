import type { BackupIssue, ImportAggregateKind, ImportConflict, ImportConflictPolicy, ImportPreview } from '@/domain/types';
import {
  AGGREGATE_NOUNS,
  COLLECTION_NOUNS,
  CONTENT_COLLECTIONS,
  nounForKey,
  scopeLabel,
  type BackupCollection,
} from './backupNouns';
import { problemText } from './problem';
import { countOf, formatCount, formatDay, joinList } from './text';

export interface IssueVM {
  readonly key: string;
  readonly severity: 'error' | 'warning';
  readonly severityLabel: string;
  readonly message: string;
  readonly headline: string;
  readonly supporting: string | null;
}

export interface ConflictVM {
  readonly key: string;
  readonly title: string;
  readonly detail: string | null;
  readonly losesLocalData: boolean;
}

export interface ContentLineVM {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}

export interface PolicyOptionVM {
  readonly policy: ImportConflictPolicy;
  readonly chip: 'skip' | 'copy' | 'replace';
  readonly title: string;
  readonly detail: string;
  readonly destructive: boolean;
}

export interface LocalLoss {
  readonly matches: number;
  readonly events: number;
}

export interface ImportPreviewVM {
  readonly title: string;
  readonly scopeLabel: string;
  readonly importable: boolean;
  readonly validity: string;
  readonly source: string | null;
  readonly previouslyImported: string | null;
  readonly issues: readonly IssueVM[];
  readonly contents: readonly ContentLineVM[];
  readonly conflicts: readonly ConflictVM[];
  readonly policies: readonly PolicyOptionVM[];
  readonly localLoss: LocalLoss;
}

export const DEFAULT_IMPORT_POLICY: ImportConflictPolicy = 'skip_existing';

export const SETTINGS_NOT_RESTORED = 'Not restored';

export function sortIssues(issues: readonly BackupIssue[]): readonly IssueVM[] {
  const ordered = [...issues.filter((issue) => issue.severity === 'error'), ...issues.filter((issue) => issue.severity !== 'error')];
  return ordered.map((issue, index) => ({
    key: `${index}-${issue.code}`,
    severity: issue.severity,
    severityLabel: issue.severity === 'error' ? 'Problem' : 'Warning',
    message: issue.message,
    ...problemText(issue.message),
  }));
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

export function contentLines(counts: ImportPreview['counts']): readonly ContentLineVM[] {
  const lines: ContentLineVM[] = CONTENT_COLLECTIONS.filter((key: BackupCollection) => counts[key] > 0).map((key) => ({
    key,
    label: capitalize(COLLECTION_NOUNS[key].many),
    value: formatCount(counts[key]),
    testID: `import-text-count-${key}`,
  }));
  if (counts.settings > 0) {
    lines.push({ key: 'settings', label: 'App settings', value: SETTINGS_NOT_RESTORED, testID: 'import-text-settings-kept' });
  }
  return lines;
}

function localOnlyText(conflict: ImportConflict): string | null {
  const { matches, events } = conflict.localOnly;
  if (matches > 0) {
    const verb = matches === 1 ? 'exists' : 'exist';
    const eventsText = events > 0 ? ` (${countOf(events, COLLECTION_NOUNS.matchEvents)})` : '';
    return `${countOf(matches, COLLECTION_NOUNS.matches)}${eventsText} ${verb} only on this phone`;
  }
  if (events > 0) {
    return `${countOf(events, COLLECTION_NOUNS.matchEvents)} exist only on this phone`;
  }
  return null;
}

const LIBRARY_ENTITIES: readonly ImportAggregateKind[] = ['team', 'player', 'venue', 'template', 'preset'];

function losesLocalData(conflict: ImportConflict): boolean {
  return conflict.localOnly.matches > 0 || conflict.localOnly.events > 0;
}

function grouped(conflict: ImportConflict): boolean {
  return LIBRARY_ENTITIES.includes(conflict.entity) && !losesLocalData(conflict);
}

function singleLine(conflict: ImportConflict, index: number): ConflictVM {
  return {
    key: `${conflict.entity}-${conflict.id}-${index}`,
    title: `${AGGREGATE_NOUNS[conflict.entity].one} ${conflict.label}`,
    detail: localOnlyText(conflict),
    losesLocalData: losesLocalData(conflict),
  };
}

export function conflictLines(conflicts: readonly ImportConflict[]): readonly ConflictVM[] {
  const detailed = conflicts.map((conflict, index) => ({ conflict, index })).filter(({ conflict }) => !grouped(conflict));
  const library = LIBRARY_ENTITIES.flatMap((entity): ConflictVM[] => {
    const matching = conflicts.map((conflict, index) => ({ conflict, index })).filter(({ conflict }) => conflict.entity === entity && grouped(conflict));
    if (matching.length === 0) {
      return [];
    }
    if (matching.length === 1) {
      return [singleLine(matching[0].conflict, matching[0].index)];
    }
    return [
      {
        key: `${entity}-group`,
        title: countOf(matching.length, nounForKey(entity)),
        detail: null,
        losesLocalData: false,
      },
    ];
  });
  return [...detailed.map(({ conflict, index }) => singleLine(conflict, index)), ...library];
}

export function localLoss(conflicts: readonly ImportConflict[]): LocalLoss {
  return conflicts.reduce<LocalLoss>(
    (total, conflict) => ({ matches: total.matches + conflict.localOnly.matches, events: total.events + conflict.localOnly.events }),
    { matches: 0, events: 0 },
  );
}

function replaceDetail(loss: LocalLoss): string {
  if (loss.matches > 0) {
    return `${countOf(loss.matches, COLLECTION_NOUNS.matches)} recorded only on this phone will be lost`;
  }
  if (loss.events > 0) {
    return `${countOf(loss.events, COLLECTION_NOUNS.matchEvents)} recorded only on this phone will be lost`;
  }
  return "Uses the file's version";
}

export function policyOptions(loss: LocalLoss): readonly PolicyOptionVM[] {
  return [
    {
      policy: 'skip_existing',
      chip: 'skip',
      title: 'Skip them',
      detail: 'Import only new items',
      destructive: false,
    },
    {
      policy: 'import_as_copy',
      chip: 'copy',
      title: 'Import as a copy',
      detail: 'Nothing on this phone changes',
      destructive: false,
    },
    {
      policy: 'replace_existing',
      chip: 'replace',
      title: 'Replace mine',
      detail: replaceDetail(loss),
      destructive: true,
    },
  ];
}

function sourceLine(preview: ImportPreview): string | null {
  const source = preview.source;
  if (!source) {
    return null;
  }
  return `Exported ${formatDay(source.exportedAt)} · Scorebook ${source.appVersion}`;
}

function scopeLine(preview: ImportPreview): string {
  const title = preview.source?.title?.trim();
  return title ? `${scopeLabel(preview.scope)} · ${title}` : scopeLabel(preview.scope);
}

export function shownIssues(preview: ImportPreview): readonly BackupIssue[] {
  if (preview.conflicts.length === 0) {
    return preview.issues;
  }
  return preview.issues.filter((issue) => issue.code !== 'ID_CONFLICT');
}

export const READY_TO_IMPORT = 'Ready to import';
export const CANNOT_IMPORT = "This file can't be imported";

function validityLine(preview: ImportPreview): string {
  return preview.ok ? READY_TO_IMPORT : CANNOT_IMPORT;
}

export function selectImportPreview(preview: ImportPreview, fileName: string | null): ImportPreviewVM {
  const loss = localLoss(preview.conflicts);
  return {
    title: fileName ?? 'Backup file',
    scopeLabel: scopeLine(preview),
    importable: preview.ok,
    validity: validityLine(preview),
    source: sourceLine(preview),
    previouslyImported: preview.previouslyImportedAt ? `Imported before on ${formatDay(preview.previouslyImportedAt)}` : null,
    issues: sortIssues(shownIssues(preview)),
    contents: preview.ok ? contentLines(preview.counts) : [],
    conflicts: preview.ok ? conflictLines(preview.conflicts) : [],
    policies: preview.ok && preview.conflicts.length > 0 ? policyOptions(loss) : [],
    localLoss: loss,
  };
}

export function policyForImport(preview: ImportPreview, chosen: ImportConflictPolicy): ImportConflictPolicy {
  return preview.conflicts.length > 0 ? chosen : DEFAULT_IMPORT_POLICY;
}

export function replaceConfirmation(preview: ImportPreview): string {
  const loss = localLoss(preview.conflicts);
  const replaced = countOf(preview.conflicts.length, { one: 'item', many: 'items' });
  const lost: string[] = [];
  if (loss.matches > 0) {
    lost.push(countOf(loss.matches, COLLECTION_NOUNS.matches));
  }
  if (loss.events > 0) {
    lost.push(countOf(loss.events, COLLECTION_NOUNS.matchEvents));
  }
  const lossText = lost.length > 0 ? ` ${capitalize(joinList(lost))} recorded only on this phone will be deleted.` : '';
  return `${capitalize(replaced)} will be replaced.${lossText} This can't be undone.`;
}

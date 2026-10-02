import type { BackupIssue, ImportConflict, ImportConflictPolicy, ImportPreview } from '@/domain/types';
import {
  AGGREGATE_NOUNS,
  COLLECTION_NOUNS,
  CONTENT_COLLECTIONS,
  HEADLINE_COLLECTIONS,
  scopeLabel,
  type BackupCollection,
} from './backupNouns';
import { countOf, formatCount, formatDay, joinList } from './text';

export interface IssueVM {
  readonly key: string;
  readonly severity: 'error' | 'warning';
  readonly severityLabel: string;
  readonly message: string;
}

export interface ConflictVM {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly losesLocalData: boolean;
}

export interface ContentLineVM {
  readonly key: string;
  readonly label: string;
  readonly value: string;
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
  readonly settingsNote: string | null;
  readonly importable: boolean;
  readonly validity: string;
  readonly source: string | null;
  readonly versions: string | null;
  readonly previouslyImported: string | null;
  readonly issues: readonly IssueVM[];
  readonly contents: readonly ContentLineVM[];
  readonly conflicts: readonly ConflictVM[];
  readonly policies: readonly PolicyOptionVM[];
  readonly localLoss: LocalLoss;
}

export const DEFAULT_IMPORT_POLICY: ImportConflictPolicy = 'skip_existing';

export const SETTINGS_NOT_RESTORED = 'App settings in this file are not restored. Your current settings stay as they are.';

export function sortIssues(issues: readonly BackupIssue[]): readonly IssueVM[] {
  const ordered = [...issues.filter((issue) => issue.severity === 'error'), ...issues.filter((issue) => issue.severity !== 'error')];
  return ordered.map((issue, index) => ({
    key: `${index}-${issue.code}`,
    severity: issue.severity,
    severityLabel: issue.severity === 'error' ? 'Problem' : 'Warning',
    message: issue.message,
  }));
}

export function summarizeCounts(counts: ImportPreview['counts']): string {
  const headline = HEADLINE_COLLECTIONS.filter((key) => counts[key] > 0);
  const primary = headline.filter((key) => key === 'tournaments' || key === 'matches');
  const chosen = (primary.length > 0 ? primary : headline).slice(0, 3);
  if (chosen.length === 0) {
    return counts.settings > 0 ? 'app settings only' : 'no data';
  }
  return chosen.map((key) => countOf(counts[key], COLLECTION_NOUNS[key])).join(', ');
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

export function contentLines(counts: ImportPreview['counts']): readonly ContentLineVM[] {
  const lines: ContentLineVM[] = CONTENT_COLLECTIONS.filter((key: BackupCollection) => counts[key] > 0).map((key) => ({
    key,
    label: capitalize(COLLECTION_NOUNS[key].many),
    value: formatCount(counts[key]),
  }));
  if (counts.settings > 0) {
    lines.push({ key: 'settings', label: 'App settings', value: 'Included' });
  }
  return lines;
}

function localOnlyText(conflict: ImportConflict): string {
  const { matches, events } = conflict.localOnly;
  if (matches > 0) {
    const verb = matches === 1 ? 'exists' : 'exist';
    const eventsText = events > 0 ? ` (${countOf(events, COLLECTION_NOUNS.matchEvents)})` : '';
    return `${countOf(matches, COLLECTION_NOUNS.matches)}${eventsText} ${verb} only on this phone`;
  }
  if (events > 0) {
    return `${countOf(events, COLLECTION_NOUNS.matchEvents)} exist only on this phone`;
  }
  if (conflict.entity === 'tournament' || conflict.entity === 'match') {
    return 'Already on this phone, with nothing extra recorded here';
  }
  return 'Already in your library';
}

export function conflictLines(conflicts: readonly ImportConflict[]): readonly ConflictVM[] {
  return conflicts.map((conflict, index) => ({
    key: `${conflict.entity}-${conflict.id}-${index}`,
    title: `${AGGREGATE_NOUNS[conflict.entity].one} ${conflict.label}`,
    detail: localOnlyText(conflict),
    losesLocalData: conflict.localOnly.matches > 0 || conflict.localOnly.events > 0,
  }));
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
  return "Items on this phone are replaced by the file's version";
}

export function policyOptions(loss: LocalLoss): readonly PolicyOptionVM[] {
  return [
    {
      policy: 'skip_existing',
      chip: 'skip',
      title: 'Skip them',
      detail: 'Keep what is on this phone and import only the new items',
      destructive: false,
    },
    {
      policy: 'import_as_copy',
      chip: 'copy',
      title: 'Import as a copy',
      detail: 'Add the items from the file as new copies. Nothing on this phone changes',
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
  const platform = source.platform ? ` on ${capitalize(source.platform)}` : '';
  return `Exported ${formatDay(source.exportedAt)} from Scorebook ${source.appVersion}${platform}`;
}

function versionsLine(preview: ImportPreview): string | null {
  const source = preview.source;
  if (!source) {
    return null;
  }
  return `Backup format ${source.formatVersion} · data version ${source.schemaVersion}`;
}

function scopeLine(preview: ImportPreview): string {
  const title = preview.source?.title?.trim();
  return title ? `${scopeLabel(preview.scope)} · ${title}` : scopeLabel(preview.scope);
}

function validityLine(preview: ImportPreview): string {
  if (!preview.ok) {
    return "This file can't be imported. Nothing on this phone was changed.";
  }
  const warnings = preview.issues.filter((issue) => issue.severity === 'warning').length;
  const base = `File is valid · ${summarizeCounts(preview.counts)}`;
  return warnings > 0 ? `${base} · ${countOf(warnings, { one: 'warning', many: 'warnings' })}` : base;
}

export function selectImportPreview(preview: ImportPreview, fileName: string | null): ImportPreviewVM {
  const loss = localLoss(preview.conflicts);
  return {
    title: fileName ?? 'Backup file',
    scopeLabel: scopeLine(preview),
    settingsNote: preview.ok && preview.counts.settings > 0 ? SETTINGS_NOT_RESTORED : null,
    importable: preview.ok,
    validity: validityLine(preview),
    source: sourceLine(preview),
    versions: versionsLine(preview),
    previouslyImported: preview.previouslyImportedAt ? `Imported before on ${formatDay(preview.previouslyImportedAt)}` : null,
    issues: sortIssues(preview.issues),
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
  const lossText =
    lost.length > 0 ? ` ${capitalize(joinList(lost))} that exist only on this phone will be deleted.` : ' Nothing recorded only on this phone will be lost.';
  return `${capitalize(replaced)} on this phone will be replaced by the version in the file.${lossText} This can't be undone.`;
}

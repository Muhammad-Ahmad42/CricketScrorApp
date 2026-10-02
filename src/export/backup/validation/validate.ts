import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/domain/types';
import type { BackupData, BackupEnvelope, BackupIssue, EventId, Id, ImportPreview, ImportSource, MatchEvent, MatchId } from '@/domain/types';
import { backupCounts, emptyBackupData } from '../collections';
import type { ParsedBackup, RawBackup } from '../parse';
import { detectConflicts, lookupPlan, type LocalLookupPlan } from './conflicts';
import type { BackupValidationContext } from './context';
import { checkMatchLog, matchLabel, matchLogJobs, type MatchLogCheck, type MatchLogJob } from './eventLogs';
import { checkIdentity } from './identity';
import { createIssueLog, errorIssue, warningIssue, type IssueLog } from './issues';
import { checkReferences, missingLibraryIds } from './references';
import { checkSemantics } from './semantics';
import { readBackupStructure, type StructuredBackup } from './structure';

export interface BackupValidation {
  readonly preview: ImportPreview;
  readonly envelope: BackupEnvelope | null;
  readonly logChecks: ReadonlyMap<MatchId, MatchLogCheck>;
}

export interface ValidationHooks {
  readonly pause: () => Promise<void>;
  readonly yieldEvery?: number;
  readonly onProgress?: (checked: number, total: number) => void;
}

interface Prepared {
  readonly backup: RawBackup;
  readonly log: IssueLog;
  readonly structure: StructuredBackup;
  readonly jobs: readonly MatchLogJob[];
}

function failedValidation(issues: readonly BackupIssue[]): BackupValidation {
  return {
    preview: {
      ok: false,
      previouslyImportedAt: null,
      issues,
      conflicts: [],
      counts: backupCounts(emptyBackupData()),
      scope: { kind: 'full' },
    },
    envelope: null,
    logChecks: new Map(),
  };
}

function checkChecksum(backup: RawBackup, computed: string | null, log: IssueLog): void {
  if (backup.checksumMalformed) {
    return;
  }
  if (backup.checksum === null) {
    log.add(warningIssue('CHECKSUM_MISSING', "This file has no checksum, so Scorebook can't tell whether it was changed after it was exported.", 'checksum'));
    return;
  }
  if (computed === null) {
    log.add(warningIssue('CHECKSUM_MISSING', "The file's checksum couldn't be checked on this device.", 'checksum'));
    return;
  }
  if (computed.toLowerCase() !== backup.checksum) {
    log.add(errorIssue('CHECKSUM_MISMATCH', 'This file was changed or damaged after it was exported.', 'checksum'));
  }
}

function scopeTitle(backup: RawBackup, data: BackupData): string | null {
  const scope = backup.scope;
  switch (scope.kind) {
    case 'full':
      return null;
    case 'tournament':
      return data.tournaments.find((row) => row.id === scope.tournamentId)?.name ?? null;
    case 'match': {
      const match = data.matches.find((row) => row.id === scope.matchId);
      return match ? matchLabel(match, data) : null;
    }
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

function sourceOf(backup: RawBackup, data: BackupData): ImportSource {
  return {
    exportId: backup.exportId,
    formatVersion: backup.formatVersion,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    appVersion: backup.app.version,
    platform: backup.app.platform,
    title: scopeTitle(backup, data),
  };
}

function union(...sets: readonly ReadonlySet<Id>[]): ReadonlySet<Id> {
  return new Set(sets.flatMap((set) => [...set]));
}

function prepare(backup: RawBackup, parseIssues: readonly BackupIssue[], ctx: BackupValidationContext): Prepared {
  const log = createIssueLog();
  parseIssues.forEach((issue) => log.add(issue));
  checkChecksum(backup, ctx.checksum, log);
  const structure = readBackupStructure(backup.data, backup.counts, log);
  const duplicated = checkIdentity(structure.data, log);
  const unresolved = checkReferences(structure.data, structure.knownIds, ctx.local, log);
  const inconsistent = checkSemantics(structure.data, log);
  const skip = union(structure.taintedMatchIds, duplicated, unresolved, inconsistent);
  return { backup, log, structure, jobs: matchLogJobs(structure.data, skip) };
}

function runJob(job: MatchLogJob, ctx: BackupValidationContext): MatchLogCheck {
  return ctx.logChecks?.get(job.matchId) ?? checkMatchLog(job, ctx.logChecker);
}

function withCheckedLogs(data: BackupData, checks: readonly MatchLogCheck[]): BackupData {
  const replaced = new Map<EventId, MatchEvent>();
  checks.forEach((check) => check.events.forEach((event) => replaced.set(event.id, event)));
  if (replaced.size === 0) {
    return data;
  }
  return { ...data, matchEvents: data.matchEvents.map((event) => replaced.get(event.id) ?? event) };
}

function finish(prepared: Prepared, checks: readonly MatchLogCheck[], ctx: BackupValidationContext): BackupValidation {
  const { backup, log, structure } = prepared;
  checks.forEach((check) => check.issues.forEach((issue) => log.add(issue)));
  const conflicts = detectConflicts(structure.data, ctx.local, log);
  const ok = !log.hasErrors();
  const envelope: BackupEnvelope | null = ok
    ? {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        exportId: backup.exportId,
        schemaVersion: backup.schemaVersion,
        exportedAt: backup.exportedAt,
        app: backup.app,
        scope: backup.scope,
        counts: structure.counts,
        checksum: backup.checksum,
        data: withCheckedLogs(structure.data, checks),
      }
    : null;
  return {
    preview: {
      ok,
      previouslyImportedAt: ctx.local.previouslyImportedAt,
      issues: log.issues(),
      conflicts,
      counts: structure.counts,
      scope: backup.scope,
      source: sourceOf(backup, structure.data),
    },
    envelope,
    logChecks: new Map(checks.map((check) => [check.matchId, check])),
  };
}

export function validateBackup(parsed: ParsedBackup, ctx: BackupValidationContext): BackupValidation {
  if (!parsed.ok) {
    return failedValidation(parsed.issues);
  }
  const prepared = prepare(parsed.backup, parsed.issues, ctx);
  return finish(prepared, prepared.jobs.map((job) => runJob(job, ctx)), ctx);
}

export async function validateBackupAsync(parsed: ParsedBackup, ctx: BackupValidationContext, hooks: ValidationHooks): Promise<BackupValidation> {
  if (!parsed.ok) {
    return failedValidation(parsed.issues);
  }
  const prepared = prepare(parsed.backup, parsed.issues, ctx);
  const every = Math.max(1, hooks.yieldEvery ?? 1);
  const checks: MatchLogCheck[] = [];
  for (const job of prepared.jobs) {
    checks.push(runJob(job, ctx));
    hooks.onProgress?.(checks.length, prepared.jobs.length);
    if (checks.length % every === 0) {
      await hooks.pause();
    }
  }
  return finish(prepared, checks, ctx);
}

export function planLocalLookup(parsed: ParsedBackup): LocalLookupPlan {
  if (!parsed.ok) {
    return { tournament: [], match: [], team: [], player: [], venue: [], template: [], preset: [] };
  }
  const structure = readBackupStructure(parsed.backup.data, parsed.backup.counts, createIssueLog(0));
  return lookupPlan(structure.data, missingLibraryIds(structure.data, structure.knownIds));
}

export function importPreviewOf(parsed: ParsedBackup, ctx: BackupValidationContext): ImportPreview {
  return validateBackup(parsed, ctx).preview;
}

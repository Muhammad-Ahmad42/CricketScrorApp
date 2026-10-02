import {
  backupCounts,
  backupFileName,
  buildBackupEnvelope,
  parseBackupText,
  planLocalLookup,
  sealBackupEnvelope,
  serializeBackupEnvelope,
  validateBackupAsync,
  type BackupValidation,
} from '@/export';
import { foreignKeyCheck, LATEST_SCHEMA_VERSION } from '@/db';
import type { BackupData, BackupScope, TournamentId } from '@/domain/types';
import type { Repositories } from '@/db';
import type { BackupService, ImportReport } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { exportsDirectory, joinPath } from '../core/paths';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { rebuildProjection } from '../match/rebuild';
import { refreshTournamentProjection } from '../tournament/matchEffects';
import { planImport } from './importPlan';
import { readLocalData } from './localLookup';

const MAX_IMPORT_CHARACTERS = 100 * 1024 * 1024;
const YIELD_EVERY = 20;

interface PreviewedFile {
  readonly exportId: string;
  readonly checksum: string | null;
}

interface ValidatedFile {
  readonly validation: BackupValidation;
  readonly exportId: string | null;
  readonly checksum: string | null;
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function scopeLabel(scope: BackupScope, data: BackupData): string | null {
  switch (scope.kind) {
    case 'full':
      return null;
    case 'tournament':
      return data.tournaments.find((tournament) => tournament.id === scope.tournamentId)?.name ?? null;
    case 'match':
      return data.matches.find((match) => match.id === scope.matchId)?.title ?? null;
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

async function raiseRevision(repos: Repositories, tournamentId: TournamentId, floor: number): Promise<void> {
  let revision = await repos.tournaments.bumpRevision(tournamentId);
  while (revision < floor) {
    revision = await repos.tournaments.bumpRevision(tournamentId);
  }
}

function firstError(validation: BackupValidation): string {
  return validation.preview.issues.find((issue) => issue.severity === 'error')?.message ?? 'This backup could not be validated.';
}

export function createBackupService(ctx: ServiceContext): BackupService {
  const previews = new Map<string, PreviewedFile>();
  let importing: Promise<unknown> = Promise.resolve();

  function oneImportAtATime<T>(task: () => Promise<T>): Promise<T> {
    const run = importing.then(task, task);
    importing = run.catch(() => undefined);
    return run;
  }

  async function readFile(fileUri: string): Promise<string> {
    let text: string;
    try {
      text = await ctx.fileSystem.readText(fileUri);
    } catch (error) {
      throw failure('IMPORT_INVALID', MESSAGES.importRead, { detail: error instanceof Error ? error.message : String(error) });
    }
    if (text.length > MAX_IMPORT_CHARACTERS) {
      throw failure('IMPORT_INVALID', 'This backup is larger than 100 MB, which Scorebook cannot import on this device.');
    }
    return text;
  }

  async function validateText(text: string): Promise<ValidatedFile> {
    const parsed = parseBackupText(text, { latestSchemaVersion: LATEST_SCHEMA_VERSION });
    const checksum = parsed.ok ? await ctx.sha256(parsed.checksumInput) : null;
    const exportId = parsed.ok ? parsed.backup.exportId : null;
    const local = await inTransaction(ctx, (repos) => readLocalData(repos, planLocalLookup(parsed), exportId));
    const validation = await validateBackupAsync(parsed, { checksum, local }, { pause, yieldEvery: YIELD_EVERY });
    return { validation, exportId, checksum };
  }

  return {
    exportBackup(scope) {
      return attempt(MESSAGES.exportBackup, async () => {
        const data = await inTransaction(ctx, (repos) => repos.backup.exportData(scope));
        const exportedAt = ctx.clock.now();
        const prepared = buildBackupEnvelope(data, {
          exportId: ctx.ids(),
          exportedAt,
          schemaVersion: LATEST_SCHEMA_VERSION,
          appVersion: ctx.app.version,
          platform: ctx.app.platform,
          scope,
        });
        const envelope = sealBackupEnvelope(prepared.envelope, await ctx.sha256(prepared.checksumInput));
        const fileUri = joinPath(exportsDirectory(ctx.fileSystem.cacheDirectory), backupFileName(scope, exportedAt, scopeLabel(scope, data)));
        const temporary = `${fileUri}.tmp`;
        try {
          await ctx.fileSystem.writeText(temporary, serializeBackupEnvelope(envelope));
          await ctx.fileSystem.move(temporary, fileUri);
        } catch (error) {
          await ctx.fileSystem.remove(temporary).catch(() => undefined);
          throw failure('EXPORT_FAILED', MESSAGES.exportBackup, { detail: error instanceof Error ? error.message : String(error) });
        }
        return { fileUri, envelope };
      });
    },

    previewImport(fileUri) {
      return attempt(MESSAGES.importRead, async () => {
        const checked = await validateText(await readFile(fileUri));
        if (checked.exportId !== null) {
          previews.set(fileUri, { exportId: checked.exportId, checksum: checked.checksum });
        } else {
          previews.delete(fileUri);
        }
        return checked.validation.preview;
      });
    },

    applyImport(fileUri, policy) {
      return oneImportAtATime(() =>
        attempt(MESSAGES.importApply, async () => {
          const previewed = previews.get(fileUri);
          if (previewed === undefined) {
            throw failure('IMPORT_INVALID', 'Preview this backup before importing it.');
          }
          const checked = await validateText(await readFile(fileUri));
          const envelope = checked.validation.envelope;
          if (!checked.validation.preview.ok || envelope === null) {
            throw failure('IMPORT_INVALID', firstError(checked.validation));
          }
          if (checked.exportId !== previewed.exportId || checked.checksum !== previewed.checksum) {
            throw failure('CONFLICT', 'This file changed since it was previewed. Preview it again before importing.');
          }
          const plan = planImport(envelope.data, checked.validation.preview.conflicts, policy, ctx.ids);
          const report = await inTransaction(ctx, async (repos, tx): Promise<ImportReport> => {
            const revisionFloors = new Map<TournamentId, number>();
            for (const aggregate of plan.replace) {
              if (aggregate.entity === 'tournament') {
                revisionFloors.set(aggregate.id, await repos.tournaments.bumpRevision(aggregate.id));
              }
              await repos.backup.deleteAggregate(aggregate.entity, aggregate.id);
              if (aggregate.entity === 'tournament') {
                ctx.locator.forget(aggregate.id);
              }
            }
            await repos.backup.importData(plan.data, { libraryConflict: plan.libraryConflict });
            let rebuilt = 0;
            for (const match of plan.data.matches) {
              const outcome = await rebuildProjection(ctx, repos, tx, match.id, { tournamentEffects: false });
              if (!outcome.rebuilt) {
                throw failure('IMPORT_INVALID', `"${match.title}" could not be rebuilt from its scoring log.`, { detail: outcome.issue });
              }
              rebuilt += 1;
              if (rebuilt % YIELD_EVERY === 0) {
                await pause();
              }
            }
            const now = ctx.clock.now();
            for (const tournament of plan.data.tournaments) {
              const floor = revisionFloors.get(tournament.id);
              if (floor !== undefined) {
                await raiseRevision(repos, tournament.id, floor);
              }
              await refreshTournamentProjection(ctx, repos, tournament.id, now);
            }
            const violations = await foreignKeyCheck(tx);
            if (violations.length > 0) {
              throw failure('IMPORT_INVALID', "The backup's records don't fit together, so nothing was imported.", {
                detail: violations.map((violation) => `${violation.table} → ${violation.parent}`).join(', '),
              });
            }
            const imported = backupCounts(plan.data);
            await writeAudit(
              ctx,
              repos,
              {
                tournamentId: null,
                action: 'backup_imported',
                entityType: 'backup',
                entityId: envelope.exportId,
                summary: `A backup was imported (${policy.replace(/_/g, ' ')}).`,
                newValue: { counts: imported, policy, exportedAt: envelope.exportedAt },
              },
              now,
            );
            return { imported, skipped: plan.skipped, rebuiltMatches: rebuilt };
          });
          previews.delete(fileUri);
          return report;
        }),
      );
    },
  };
}

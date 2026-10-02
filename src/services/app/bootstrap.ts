import { SCORING_PROJECTION_VERSION } from '@/domain/scoring';
import type { MatchId } from '@/domain/types';
import { foreignKeyCheck, readConnectionPragmas, runMigrations, type SqlDatabase } from '@/db';
import type { BootstrapReport, DatabasePragmas, IntegrityReport } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES, toServiceError } from '../core/errors';
import { failure } from '../core/result';
import { inTransaction, withRepositories } from '../core/transaction';
import { readMatchLog } from '../match/matchLog';
import { rebuildProjection, repairMessage } from '../match/rebuild';

type IntegrityIssue = BootstrapReport['integrityIssues'][number];

async function openDatabase(ctx: ServiceContext): Promise<SqlDatabase> {
  try {
    return await ctx.database();
  } catch (error) {
    throw failure('STORAGE', MESSAGES.bootstrap, { detail: toServiceError(error, MESSAGES.bootstrap).detail });
  }
}

async function readPragmas(db: SqlDatabase): Promise<DatabasePragmas | null> {
  try {
    return await readConnectionPragmas(db);
  } catch {
    return null;
  }
}

async function rebuildStale(ctx: ServiceContext, issues: IntegrityIssue[]): Promise<number> {
  const stale = await withRepositories(ctx, (repos) => repos.matches.listStaleProjections(SCORING_PROJECTION_VERSION));
  let rebuilt = 0;
  for (const matchId of stale) {
    try {
      const outcome = await inTransaction(ctx, (repos, tx) => rebuildProjection(ctx, repos, tx, matchId));
      if (outcome.rebuilt) {
        rebuilt += 1;
      } else {
        issues.push({ matchId, message: outcome.issue });
      }
    } catch (error) {
      issues.push({ matchId, message: toServiceError(error, 'This match could not be rebuilt.').message });
    }
  }
  return rebuilt;
}

async function matchNeedsRepair(ctx: ServiceContext, matchId: MatchId): Promise<string | null> {
  const log = await inTransaction(ctx, (repos) => readMatchLog(repos, matchId));
  return repairMessage(log.state);
}

export async function bootstrapServices(ctx: ServiceContext): Promise<BootstrapReport> {
  const db = await openDatabase(ctx);
  const migration = await runMigrations(db, { now: () => ctx.clock.now() });
  const issues: IntegrityIssue[] = [];
  const projectionsRebuilt = await rebuildStale(ctx, issues);
  const live = await withRepositories(ctx, (repos) => repos.matches.findResumable());
  for (const item of live) {
    if (!issues.some((issue) => issue.matchId === item.id)) {
      const message = await matchNeedsRepair(ctx, item.id);
      if (message !== null) {
        issues.push({ matchId: item.id, message });
      }
    }
  }
  const resumable = await withRepositories(ctx, (repos) => repos.matches.findResumable({ forPrompt: true }));
  const pragmas = await readPragmas(db);
  return { schemaVersion: migration.toVersion, resumable, projectionsRebuilt, integrityIssues: issues, pragmas };
}

export async function checkIntegrity(ctx: ServiceContext): Promise<IntegrityReport> {
  const db = await ctx.database();
  const violations = await foreignKeyCheck(db);
  const matches = await withRepositories(ctx, (repos) => repos.matches.list({}));
  const needing: MatchId[] = [];
  for (const item of matches) {
    if ((await matchNeedsRepair(ctx, item.id)) !== null) {
      needing.push(item.id);
    }
  }
  return { checkedAt: ctx.clock.now(), foreignKeyViolations: violations.length, matchesNeedingRepair: needing };
}

import { createRepositories, type Repositories, type SqlExecutor } from '@/db';
import type { ServiceResult } from '../contracts';
import type { ServiceContext } from './context';
import { toServiceError } from './errors';
import { fail, ok } from './result';

export type RepositoryTask<T> = (repos: Repositories, executor: SqlExecutor) => Promise<T>;

export async function inTransaction<T>(ctx: ServiceContext, task: RepositoryTask<T>): Promise<T> {
  const db = await ctx.database();
  return db.withTransactionAsync((tx) => task(createRepositories(tx), tx));
}

export async function withRepositories<T>(ctx: ServiceContext, task: RepositoryTask<T>): Promise<T> {
  const db = await ctx.database();
  return task(createRepositories(db), db);
}

export async function attempt<T>(message: string, body: () => Promise<T>): Promise<ServiceResult<T>> {
  try {
    return ok(await body());
  } catch (error) {
    return fail(toServiceError(error, message));
  }
}

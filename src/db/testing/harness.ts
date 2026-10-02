import { createRepositories } from '../repositories';
import type { Repositories } from '../repositories/contracts';
import type { SqlExecutor } from '../types';
import { createMigratedSqlJsDatabase, type SqlJsTestDatabase } from './sqljsDatabase';

export interface TestRepositories {
  readonly db: SqlJsTestDatabase;
  readonly repos: Repositories;
}

export async function openTestRepositories(data?: Uint8Array | null): Promise<TestRepositories> {
  const db = await createMigratedSqlJsDatabase({ data });
  return { db, repos: createRepositories(db) };
}

export async function countRows(db: SqlExecutor, table: string, where = '1', params: readonly (string | number)[] = []): Promise<number> {
  const row = await db.getFirstAsync<{ readonly n: number }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, params);
  return row?.n ?? 0;
}

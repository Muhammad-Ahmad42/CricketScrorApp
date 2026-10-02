import type { Database } from 'sql.js';
import { runMigrations } from '../migrate';
import { createSerializedDatabase } from '../internal/serializedDatabase';
import type { SqlDatabase } from '../types';
import { openSqlJsRaw, sqlJsConnection } from './sqljsConnection';

export { loadSqlJs } from './sqljsConnection';

export interface SqlJsTestDatabase extends SqlDatabase {
  readonly raw: Database;
  exportAsync(): Promise<Uint8Array>;
}

export interface SqlJsOpenOptions {
  readonly data?: Uint8Array | null;
}

export async function createSqlJsDatabase(options: SqlJsOpenOptions = {}): Promise<SqlJsTestDatabase> {
  const raw = await openSqlJsRaw(options.data);
  const connection = sqlJsConnection(raw);
  const db = createSerializedDatabase(connection);
  return {
    ...db,
    raw,
    exportAsync: () => db.runExclusive(async () => connection.exportImage()),
  };
}

export const TEST_MIGRATION_TIME = '2026-05-01T09:00:00.000Z';

export async function createMigratedSqlJsDatabase(options: SqlJsOpenOptions = {}): Promise<SqlJsTestDatabase> {
  const db = await createSqlJsDatabase(options);
  await runMigrations(db, { now: () => TEST_MIGRATION_TIME });
  return db;
}

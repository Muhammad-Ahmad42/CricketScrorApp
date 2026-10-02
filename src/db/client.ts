import { openDatabaseAsync, type SQLiteBindParams, type SQLiteRunResult } from 'expo-sqlite';
import { createSerializedDatabase, type SqlConnection } from './internal/serializedDatabase';
import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult, SqlValue } from './types';

export const DATABASE_NAME = 'scorebook.db';

export const CONNECTION_PRAGMAS: readonly string[] = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = FULL',
];

export interface ExpoSqliteHandle {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]>;
  closeAsync(): Promise<void>;
}

export interface ConnectionPragmas {
  readonly foreignKeys: number;
  readonly journalMode: string;
  readonly synchronous: number;
}

function isPositional(params: SqlParams): params is readonly SqlValue[] {
  return Array.isArray(params);
}

export function toExpoParams(params: SqlParams | undefined): SQLiteBindParams {
  if (params === undefined) {
    return [];
  }
  return isPositional(params) ? [...params] : { ...params };
}

export function expoConnection(handle: ExpoSqliteHandle): SqlConnection {
  return {
    execAsync(source: string): Promise<void> {
      return handle.execAsync(source);
    },
    async runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      const result = await handle.runAsync(source, toExpoParams(params));
      return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
    },
    getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      return handle.getFirstAsync<T>(source, toExpoParams(params));
    },
    getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      return handle.getAllAsync<T>(source, toExpoParams(params));
    },
    closeAsync(): Promise<void> {
      return handle.closeAsync();
    },
  };
}

export async function configureConnection(connection: SqlExecutor): Promise<void> {
  for (const pragma of CONNECTION_PRAGMAS) {
    await connection.execAsync(pragma);
  }
}

async function closeQuietly(handle: ExpoSqliteHandle): Promise<void> {
  try {
    await handle.closeAsync();
  } catch {
    return;
  }
}

export async function createExpoDatabase(handle: ExpoSqliteHandle): Promise<SqlDatabase> {
  const connection = expoConnection(handle);
  try {
    await configureConnection(connection);
  } catch (error) {
    await closeQuietly(handle);
    throw error;
  }
  return createSerializedDatabase(connection);
}

export type ExpoDatabaseOpener = (name: string) => Promise<ExpoSqliteHandle>;

export async function openAppDatabase(name: string = DATABASE_NAME, open: ExpoDatabaseOpener = openDatabaseAsync): Promise<SqlDatabase> {
  const handle = await open(name);
  return createExpoDatabase(handle);
}

export async function readConnectionPragmas(db: SqlExecutor): Promise<ConnectionPragmas> {
  const foreignKeys = await db.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys');
  const journalMode = await db.getFirstAsync<{ readonly journal_mode: string }>('PRAGMA journal_mode');
  const synchronous = await db.getFirstAsync<{ readonly synchronous: number }>('PRAGMA synchronous');
  return {
    foreignKeys: foreignKeys?.foreign_keys ?? 0,
    journalMode: journalMode?.journal_mode ?? 'unknown',
    synchronous: synchronous?.synchronous ?? 0,
  };
}

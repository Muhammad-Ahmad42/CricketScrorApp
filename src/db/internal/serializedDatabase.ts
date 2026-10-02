import { TransactionClosedError } from '../errors';
import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult } from '../types';
import { createMutex } from './mutex';

export interface SqlConnection extends SqlExecutor {
  closeAsync(): Promise<void>;
}

export const BEGIN_SQL = 'BEGIN IMMEDIATE';
export const COMMIT_SQL = 'COMMIT';
export const ROLLBACK_SQL = 'ROLLBACK';

interface TransactionScope {
  readonly executor: SqlExecutor;
  close(): void;
}

function openScope(connection: SqlConnection): TransactionScope {
  let open = true;
  const guard = (): void => {
    if (!open) {
      throw new TransactionClosedError();
    }
  };
  const executor: SqlExecutor = {
    async execAsync(source: string): Promise<void> {
      guard();
      return connection.execAsync(source);
    },
    async runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      guard();
      return connection.runAsync(source, params);
    },
    async getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      guard();
      return connection.getFirstAsync<T>(source, params);
    },
    async getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      guard();
      return connection.getAllAsync<T>(source, params);
    },
  };
  return {
    executor,
    close: () => {
      open = false;
    },
  };
}

async function rollbackQuietly(connection: SqlConnection): Promise<void> {
  try {
    await connection.execAsync(ROLLBACK_SQL);
  } catch {
    return;
  }
}

async function runTransaction<T>(connection: SqlConnection, task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  await connection.execAsync(BEGIN_SQL);
  const scope = openScope(connection);
  try {
    const value = await task(scope.executor);
    scope.close();
    await connection.execAsync(COMMIT_SQL);
    return value;
  } catch (error) {
    scope.close();
    await rollbackQuietly(connection);
    throw error;
  }
}

export interface SerializedDatabase extends SqlDatabase {
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
}

export function createSerializedDatabase(connection: SqlConnection): SerializedDatabase {
  const mutex = createMutex();
  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      return mutex.run(work);
    },
    execAsync(source: string): Promise<void> {
      return mutex.run(() => connection.execAsync(source));
    },
    runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      return mutex.run(() => connection.runAsync(source, params));
    },
    getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      return mutex.run(() => connection.getFirstAsync<T>(source, params));
    },
    getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      return mutex.run(() => connection.getAllAsync<T>(source, params));
    },
    withTransactionAsync<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      return mutex.run(() => runTransaction(connection, task));
    },
    closeAsync(): Promise<void> {
      return mutex.run(() => connection.closeAsync());
    },
  };
}

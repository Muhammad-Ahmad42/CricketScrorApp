/** @jest-environment node */
import type { SQLiteBindParams, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';
import {
  CONNECTION_PRAGMAS,
  DATABASE_NAME,
  createExpoDatabase,
  openAppDatabase,
  readConnectionPragmas,
  toExpoParams,
  type ExpoSqliteHandle,
} from '../client';
import { runMigrations } from '../migrate';
import { createSqlJsDatabase } from '../testing/sqljsDatabase';
import { sqlJsConnection, openSqlJsRaw } from '../testing/sqljsConnection';
import type { SqlParams, SqlValue } from '../types';

function toSqlValue(value: SQLiteBindValue): SqlValue {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return value;
}

function toSqlParams(params: SQLiteBindParams): SqlParams {
  if (Array.isArray(params)) {
    return params.map(toSqlValue);
  }
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, toSqlValue(value)]));
}

interface Call {
  readonly method: string;
  readonly source: string;
  readonly params: SQLiteBindParams | null;
}

async function spyHandle(): Promise<{ readonly handle: ExpoSqliteHandle; readonly calls: Call[] }> {
  const inner = sqlJsConnection(await openSqlJsRaw());
  await inner.execAsync('PRAGMA foreign_keys = OFF');
  const calls: Call[] = [];
  const handle: ExpoSqliteHandle = {
    async execAsync(source: string): Promise<void> {
      calls.push({ method: 'exec', source, params: null });
      await inner.execAsync(source);
    },
    async runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult> {
      calls.push({ method: 'run', source, params });
      return inner.runAsync(source, toSqlParams(params));
    },
    async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
      calls.push({ method: 'getFirst', source, params });
      return inner.getFirstAsync<T>(source, toSqlParams(params));
    },
    async getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]> {
      calls.push({ method: 'getAll', source, params });
      return inner.getAllAsync<T>(source, toSqlParams(params));
    },
    async closeAsync(): Promise<void> {
      calls.push({ method: 'close', source: '', params: null });
    },
  };
  return { handle, calls };
}

describe('expo-sqlite adapter', () => {
  it('applies foreign_keys, WAL and synchronous FULL at open, before any other statement', async () => {
    const { handle, calls } = await spyHandle();
    const db = await createExpoDatabase(handle);
    expect(calls.map((call) => call.source)).toEqual([
      'PRAGMA foreign_keys = ON',
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = FULL',
    ]);
    expect(CONNECTION_PRAGMAS).toHaveLength(3);
    await runMigrations(db, { now: () => '2026-05-01T09:00:00.000Z' });
    const firstMigrationStatement = calls.findIndex((call) => /BEGIN/.test(call.source));
    expect(firstMigrationStatement).toBeGreaterThan(2);
    const migrationSql = calls.slice(3).map((call) => call.source).join('\n');
    expect(migrationSql).not.toMatch(/PRAGMA (journal_mode|synchronous)/);
    const pragmas = await readConnectionPragmas(db);
    expect(pragmas.foreignKeys).toBe(1);
    expect(pragmas.synchronous).toBe(2);
    expect(DATABASE_NAME).toMatch(/\.db$/);
  });

  it('passes positional and named parameters in the shapes expo-sqlite expects', async () => {
    expect(toExpoParams(undefined)).toEqual([]);
    const positional = Object.freeze(['a', 1, null]);
    const converted = toExpoParams(positional);
    expect(converted).toEqual(['a', 1, null]);
    expect(converted).not.toBe(positional);
    expect(toExpoParams({ $name: 'x', $n: 2 })).toEqual({ $name: 'x', $n: 2 });
    const { handle, calls } = await spyHandle();
    const db = await createExpoDatabase(handle);
    await db.execAsync('CREATE TABLE t (name TEXT, n INTEGER) STRICT');
    const result = await db.runAsync('INSERT INTO t VALUES ($name, $n)', { $name: 'x', $n: 2 });
    expect(result).toEqual({ lastInsertRowId: 1, changes: 1 });
    expect(await db.getFirstAsync('SELECT name, n FROM t WHERE n = ?', [2])).toEqual({ name: 'x', n: 2 });
    expect(calls.find((call) => call.method === 'run')?.params).toEqual({ $name: 'x', $n: 2 });
  });

  it('wraps a use case in BEGIN IMMEDIATE / COMMIT on the same connection behind the writer mutex', async () => {
    const { handle, calls } = await spyHandle();
    const db = await createExpoDatabase(handle);
    await db.execAsync('CREATE TABLE t (n INTEGER) STRICT');
    calls.splice(0, calls.length);
    const first = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO t VALUES (?)', [1]);
      await new Promise((done) => setTimeout(done, 5));
      await tx.runAsync('INSERT INTO t VALUES (?)', [2]);
    });
    const root = db.runAsync('INSERT INTO t VALUES (?)', [3]);
    await Promise.all([first, root]);
    expect(calls.map((call) => `${call.source} ${JSON.stringify(call.params)}`)).toEqual([
      'BEGIN IMMEDIATE null',
      'INSERT INTO t VALUES (?) [1]',
      'INSERT INTO t VALUES (?) [2]',
      'COMMIT null',
      'INSERT INTO t VALUES (?) [3]',
    ]);
    await db.closeAsync();
    expect(calls[calls.length - 1].method).toBe('close');
  });

  it('opens the app database by name through expo-sqlite and configures it before handing it out', async () => {
    const { handle, calls } = await spyHandle();
    const opened: string[] = [];
    const db = await openAppDatabase(undefined, async (name) => {
      opened.push(name);
      return handle;
    });
    expect(opened).toEqual([DATABASE_NAME]);
    expect(calls.map((call) => call.source)).toEqual([...CONNECTION_PRAGMAS]);
    await runMigrations(db, { now: () => '2026-05-01T09:00:00.000Z' });
    expect(await db.getFirstAsync('SELECT count(*) AS n FROM schema_migrations')).toEqual({ n: 1 });
    await expect(
      openAppDatabase('broken.db', async () => ({
        ...handle,
        execAsync: async (source: string) => {
          if (/journal_mode/.test(source)) {
            throw new Error('SQLITE_IOERR: disk I/O error');
          }
        },
      })),
    ).rejects.toThrow(/SQLITE_IOERR/);
    expect(calls[calls.length - 1].method).toBe('close');
  });

  it('reports connection pragmas for diagnostics', async () => {
    const db = await createSqlJsDatabase();
    const pragmas = await readConnectionPragmas(db);
    expect(pragmas.foreignKeys).toBe(1);
    expect(typeof pragmas.journalMode).toBe('string');
  });
});

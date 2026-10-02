import initSqlJs from 'sql.js';
import type { BindParams, Database, SqlJsStatic } from 'sql.js';
import type { SqlConnection } from '../internal/serializedDatabase';
import type { SqlParams, SqlRunResult, SqlValue } from '../types';
import { createStatementCache, type StatementCache } from './statementCache';

let sqlJsModule: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsModule === null) {
    sqlJsModule = initSqlJs();
  }
  return sqlJsModule;
}

export interface SqlJsConnection extends SqlConnection {
  readonly database: Database;
  exportImage(): Uint8Array;
}

function isPositional(params: SqlParams): params is readonly SqlValue[] {
  return Array.isArray(params);
}

function toBindParams(params: SqlParams | undefined): BindParams {
  if (params === undefined) {
    return [];
  }
  return isPositional(params) ? [...params] : { ...params };
}

function rowAs<T>(row: object): T {
  return row as T;
}

function queryRows<T>(cache: StatementCache, source: string, params: SqlParams | undefined, limit: number): T[] {
  return cache.use(source, (statement) => {
    statement.bind(toBindParams(params));
    const rows: T[] = [];
    while (rows.length < limit && statement.step()) {
      rows.push(rowAs<T>(statement.getAsObject()));
    }
    return rows;
  });
}

function lastInsertRowId(cache: StatementCache): number {
  return cache.use('SELECT last_insert_rowid() AS id', (statement) => {
    statement.step();
    const value = statement.get()[0];
    return typeof value === 'number' ? value : 0;
  });
}

function readForeignKeys(database: Database): number {
  const value = database.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : 0;
}

export function sqlJsConnection(database: Database): SqlJsConnection {
  const cache = createStatementCache(database);
  return {
    database,
    async execAsync(source: string): Promise<void> {
      database.exec(source);
    },
    async runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      cache.use(source, (statement) => {
        statement.bind(toBindParams(params));
        statement.step();
      });
      return { changes: database.getRowsModified(), lastInsertRowId: lastInsertRowId(cache) };
    },
    async getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      const rows = queryRows<T>(cache, source, params, 1);
      return rows.length === 0 ? null : rows[0];
    },
    async getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      return queryRows<T>(cache, source, params, Number.POSITIVE_INFINITY);
    },
    async closeAsync(): Promise<void> {
      cache.clear();
      database.close();
    },
    exportImage(): Uint8Array {
      const foreignKeys = readForeignKeys(database);
      cache.clear();
      const image = database.export();
      database.exec(`PRAGMA foreign_keys = ${foreignKeys === 1 ? 'ON' : 'OFF'}`);
      return image;
    },
  };
}

export async function openSqlJsRaw(data?: Uint8Array | null): Promise<Database> {
  const SQL = await loadSqlJs();
  const database = data ? new SQL.Database(data) : new SQL.Database();
  database.exec('PRAGMA foreign_keys = ON');
  return database;
}

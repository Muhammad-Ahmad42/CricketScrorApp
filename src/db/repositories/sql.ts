import type { SqlRecord } from '../mappers/values';
import type { SqlExecutor, SqlRunResult, SqlValue } from '../types';

export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

export type ConflictClause =
  | { readonly kind: 'none' }
  | { readonly kind: 'update'; readonly target: string; readonly keep?: readonly string[] }
  | { readonly kind: 'ignore'; readonly target: string };

const NO_CONFLICT: ConflictClause = { kind: 'none' };

function conflictSql(columns: readonly string[], conflict: ConflictClause): string {
  switch (conflict.kind) {
    case 'none':
      return '';
    case 'ignore':
      return ` ON CONFLICT(${conflict.target}) DO NOTHING`;
    case 'update': {
      const fixed = new Set([...conflict.target.split(',').map((c) => c.trim()), ...(conflict.keep ?? [])]);
      const assignments = columns.filter((column) => !fixed.has(column)).map((column) => `${column} = excluded.${column}`);
      return ` ON CONFLICT(${conflict.target}) DO UPDATE SET ${assignments.join(', ')}`;
    }
    default: {
      const unreachable: never = conflict;
      return unreachable;
    }
  }
}

export function insertStatement(table: string, record: SqlRecord, conflict: ConflictClause = NO_CONFLICT): SqlStatement {
  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})${conflictSql(columns, conflict)}`,
    params: columns.map((column) => record[column]),
  };
}

export function updateStatement(table: string, record: SqlRecord, where: string, whereParams: readonly SqlValue[]): SqlStatement {
  const columns = Object.keys(record);
  return {
    sql: `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${where}`,
    params: [...columns.map((column) => record[column]), ...whereParams],
  };
}

export function execute(db: SqlExecutor, statement: SqlStatement): Promise<SqlRunResult> {
  return db.runAsync(statement.sql, statement.params);
}

export function insertRow(db: SqlExecutor, table: string, record: SqlRecord, conflict?: ConflictClause): Promise<SqlRunResult> {
  return execute(db, insertStatement(table, record, conflict));
}

export function withoutColumns(record: SqlRecord, columns: readonly string[]): SqlRecord {
  return Object.fromEntries(Object.entries(record).filter(([column]) => !columns.includes(column)));
}

export function jsonList(values: readonly string[]): string {
  return JSON.stringify(values);
}

export const IN_JSON_LIST = 'IN (SELECT value FROM json_each(?))';

export function placeholderList(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

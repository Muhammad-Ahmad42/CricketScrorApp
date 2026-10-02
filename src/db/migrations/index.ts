import type { SqlDatabase } from '../types';
import type { Migration } from '../types';
import { migration001Initial } from './001_initial';

export const SCHEMA_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL
) STRICT;
`;

export const MIGRATIONS: readonly Migration[] = [migration001Initial];

export const LATEST_SCHEMA_VERSION: number = MIGRATIONS[MIGRATIONS.length - 1].version;

export interface MigrationReport {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
}

export type RunMigrations = (db: SqlDatabase, opts: { readonly now: () => string }) => Promise<MigrationReport>;

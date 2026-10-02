import {
  ForeignKeyViolationError,
  MigrationError,
  MigrationHistoryError,
  SchemaTooNewError,
  type ForeignKeyViolation,
} from './errors';
import { MIGRATIONS, SCHEMA_MIGRATIONS_TABLE_SQL, type MigrationReport, type RunMigrations } from './migrations';
import type { Migration, SqlDatabase, SqlExecutor } from './types';

interface ForeignKeyCheckRow {
  readonly table: string;
  readonly rowid: number | null;
  readonly parent: string;
  readonly fkid: number;
}

export async function foreignKeyCheck(db: SqlExecutor): Promise<readonly ForeignKeyViolation[]> {
  const rows = await db.getAllAsync<ForeignKeyCheckRow>('PRAGMA foreign_key_check');
  return rows.map((row) => ({ table: row.table, rowid: row.rowid, parent: row.parent, fkid: row.fkid }));
}

async function migrationsTableExists(db: SqlExecutor): Promise<boolean> {
  const row = await db.getFirstAsync<{ readonly n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  );
  return (row?.n ?? 0) > 0;
}

export async function readAppliedVersions(db: SqlExecutor): Promise<readonly number[]> {
  if (!(await migrationsTableExists(db))) {
    return [];
  }
  const rows = await db.getAllAsync<{ readonly version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  return rows.map((row) => row.version);
}

export async function readSchemaVersion(db: SqlExecutor): Promise<number> {
  const applied = await readAppliedVersions(db);
  return applied.length === 0 ? 0 : applied[applied.length - 1];
}

function assertOrderedMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (index > 0 && migration.version <= migrations[index - 1].version) {
      throw new MigrationHistoryError(migrations.map((m) => m.version));
    }
  });
}

function assertKnownHistory(applied: readonly number[], migrations: readonly Migration[]): void {
  const latest = migrations.length === 0 ? 0 : migrations[migrations.length - 1].version;
  const known = new Set(migrations.map((m) => m.version));
  const unknown = applied.filter((version) => version > latest || !known.has(version));
  if (unknown.length > 0) {
    throw new SchemaTooNewError(Math.max(...unknown), latest);
  }
  const isPrefix = applied.every((version, index) => migrations[index]?.version === version);
  if (!isPrefix) {
    throw new MigrationHistoryError(applied);
  }
}

async function applyMigration(db: SqlDatabase, migration: Migration, appliedAt: string): Promise<void> {
  await db.withTransactionAsync(async (tx) => {
    await tx.execAsync(migration.up);
    await tx.runAsync('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
      migration.version,
      migration.name,
      appliedAt,
    ]);
    if (migration.foreignKeysOff) {
      const violations = await foreignKeyCheck(tx);
      if (violations.length > 0) {
        throw new ForeignKeyViolationError(violations);
      }
    }
  });
}

async function runOne(db: SqlDatabase, migration: Migration, appliedAt: string): Promise<void> {
  if (migration.foreignKeysOff) {
    await db.execAsync('PRAGMA foreign_keys = OFF');
  }
  try {
    await applyMigration(db, migration, appliedAt);
  } catch (error) {
    throw new MigrationError(migration.version, migration.name, error);
  } finally {
    if (migration.foreignKeysOff) {
      await db.execAsync('PRAGMA foreign_keys = ON');
    }
  }
}

export function createMigrationRunner(migrations: readonly Migration[]): RunMigrations {
  return async (db, opts): Promise<MigrationReport> => {
    assertOrderedMigrations(migrations);
    const applied = await readAppliedVersions(db);
    assertKnownHistory(applied, migrations);
    const fromVersion = applied.length === 0 ? 0 : applied[applied.length - 1];
    const pending = migrations.slice(applied.length);
    if (pending.length === 0) {
      return { fromVersion, toVersion: fromVersion, applied: [] };
    }
    if (!(await migrationsTableExists(db))) {
      await db.execAsync(SCHEMA_MIGRATIONS_TABLE_SQL);
    }
    const done: number[] = [];
    for (const migration of pending) {
      await runOne(db, migration, opts.now());
      done.push(migration.version);
    }
    const violations = await foreignKeyCheck(db);
    if (violations.length > 0) {
      throw new ForeignKeyViolationError(violations);
    }
    return { fromVersion, toVersion: done[done.length - 1], applied: done };
  };
}

export const runMigrations: RunMigrations = createMigrationRunner(MIGRATIONS);

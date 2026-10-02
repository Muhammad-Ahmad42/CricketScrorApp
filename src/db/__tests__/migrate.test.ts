/** @jest-environment node */
import { MigrationError, SchemaTooNewError, MigrationHistoryError } from '../errors';
import { createMigrationRunner, foreignKeyCheck, readAppliedVersions, readSchemaVersion, runMigrations } from '../migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '../migrations';
import { createFaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { createSqlJsDatabase } from '../testing/sqljsDatabase';
import type { Migration, SqlExecutor } from '../types';

const now = (): string => '2026-05-01T09:00:00.000Z';

async function tableNames(db: SqlExecutor): Promise<string[]> {
  const rows = await db.getAllAsync<{ readonly name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

async function foreignKeysEnabled(db: SqlExecutor): Promise<number> {
  const row = await db.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys');
  return row?.foreign_keys ?? -1;
}

const rebuildVenues: Migration = {
  version: 2,
  name: 'rebuild_venues',
  foreignKeysOff: true,
  up: `
CREATE TABLE venues_new (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  location     TEXT,
  notes        TEXT,
  capacity     INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived_at  TEXT
) STRICT;
INSERT INTO venues_new (id, name, location, notes, created_at, updated_at, archived_at)
  SELECT id, name, location, notes, created_at, updated_at, archived_at FROM venues;
DROP TABLE venues;
ALTER TABLE venues_new RENAME TO venues;
`,
};

const orphanPlayer: Migration = {
  version: 2,
  name: 'orphan_player',
  foreignKeysOff: true,
  up: `INSERT INTO players (id, team_id, name, role, created_at, updated_at) VALUES ('ghost', 'no-such-team', 'Ghost', 'unknown', 'x', 'x');`,
};

const failing: Migration = {
  version: 2,
  name: 'failing',
  up: `CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT; INSERT INTO no_such_table VALUES (1);`,
};

async function seedVenueInUse(db: SqlExecutor): Promise<void> {
  await db.execAsync(`
INSERT INTO venues (id, name, created_at, updated_at) VALUES ('v1', 'Gaddafi', 't', 't');
INSERT INTO teams (id, name, short_name, created_at, updated_at) VALUES ('a', 'Lions', 'LIO', 't', 't'), ('b', 'Tigers', 'TIG', 't', 't');
INSERT INTO matches (id, title, team_a_id, team_b_id, venue_id, format_id, rules_json, created_at, updated_at)
  VALUES ('m1', 'Lions v Tigers', 'a', 'b', 'v1', 'T20', '{"oversPerInnings":20}', 't', 't');
`);
}

describe('migration runner', () => {
  it('creates schema v1 on a fresh database and records it', async () => {
    const db = await createSqlJsDatabase();
    const report = await runMigrations(db, { now });
    expect(report).toEqual({ fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    expect(LATEST_SCHEMA_VERSION).toBe(1);
    expect(await readAppliedVersions(db)).toEqual([1]);
    expect(await readSchemaVersion(db)).toBe(1);
    const rows = await db.getAllAsync('SELECT version, name, applied_at FROM schema_migrations');
    expect(rows).toEqual([{ version: 1, name: 'initial', applied_at: '2026-05-01T09:00:00.000Z' }]);
    expect(await tableNames(db)).toEqual(
      expect.arrayContaining(['match_events', 'matches', 'tournaments', 'fixtures', 'stage_slots', 'audit_events']),
    );
    expect(await foreignKeysEnabled(db)).toBe(1);
    expect(await foreignKeyCheck(db)).toEqual([]);
  });

  it('is a no-op on re-run and skips the foreign key check when nothing ran', async () => {
    const db = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(db, { now });
    expect(db.statementLog.some((entry) => /foreign_key_check/.test(entry.sql))).toBe(true);
    db.clearLog();
    const report = await runMigrations(db, { now: () => 'later' });
    expect(report).toEqual({ fromVersion: 1, toVersion: 1, applied: [] });
    expect(db.statementLog.some((entry) => /foreign_key_check/.test(entry.sql))).toBe(false);
    expect(db.statementLog.every((entry) => /^\s*SELECT/i.test(entry.sql))).toBe(true);
    expect(await db.getAllAsync('SELECT applied_at FROM schema_migrations')).toEqual([{ applied_at: '2026-05-01T09:00:00.000Z' }]);
  });

  it('refuses a database recorded with a newer schema without writing anything', async () => {
    const db = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(db, { now });
    await db.runAsync("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'future', 'x')");
    db.clearLog();
    const attempt = runMigrations(db, { now });
    await expect(attempt).rejects.toBeInstanceOf(SchemaTooNewError);
    await expect(runMigrations(db, { now })).rejects.toMatchObject({ databaseVersion: 2, appVersion: 1 });
    expect(db.statementLog.length).toBeGreaterThan(0);
    expect(db.statementLog.every((entry) => /^\s*SELECT/i.test(entry.sql))).toBe(true);
    expect(await readAppliedVersions(db)).toEqual([1, 2]);
  });

  it('refuses a history that is not a prefix of the known migrations', async () => {
    const db = await createSqlJsDatabase();
    const runner = createMigrationRunner([...MIGRATIONS, { ...failing, version: 2, up: 'SELECT 1;' }, { ...failing, version: 3, up: 'SELECT 1;' }]);
    await runMigrations(db, { now });
    await db.runAsync("INSERT INTO schema_migrations (version, name, applied_at) VALUES (3, 'three', 'x')");
    await expect(runner(db, { now })).rejects.toBeInstanceOf(MigrationHistoryError);
  });

  it('rolls back a failing migration together with its schema_migrations row', async () => {
    const db = await createSqlJsDatabase();
    const runner = createMigrationRunner([...MIGRATIONS, failing]);
    await runMigrations(db, { now });
    const error = await runner(db, { now }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrationError);
    expect(error).toMatchObject({ version: 2, migrationName: 'failing' });
    expect(await readAppliedVersions(db)).toEqual([1]);
    expect(await tableNames(db)).not.toContain('extra');
  });

  it('rolls back a failing first migration and leaves no schema', async () => {
    const db = await createSqlJsDatabase();
    const runner = createMigrationRunner([{ ...failing, version: 1 }]);
    await expect(runner(db, { now })).rejects.toBeInstanceOf(MigrationError);
    expect(await readAppliedVersions(db)).toEqual([]);
    expect(await tableNames(db)).toEqual(['schema_migrations']);
  });

  it('runs a foreignKeysOff migration with foreign keys switched off and back on', async () => {
    const db = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(db, { now });
    await seedVenueInUse(db);
    await expect(db.execAsync('DROP TABLE venues')).rejects.toThrow(/FOREIGN KEY/);
    db.clearLog();
    const report = await createMigrationRunner([...MIGRATIONS, rebuildVenues])(db, { now });
    expect(report.applied).toEqual([2]);
    const statements = db.statementLog.map((entry) => entry.sql.trim());
    const off = statements.indexOf('PRAGMA foreign_keys = OFF');
    const begin = statements.findIndex((sql) => /^BEGIN/.test(sql));
    const check = statements.indexOf('PRAGMA foreign_key_check');
    const commit = statements.indexOf('COMMIT');
    const on = statements.indexOf('PRAGMA foreign_keys = ON');
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(begin);
    expect(begin).toBeLessThan(check);
    expect(check).toBeLessThan(commit);
    expect(commit).toBeLessThan(on);
    expect(await foreignKeysEnabled(db)).toBe(1);
    expect(await db.getAllAsync('SELECT id, name, capacity FROM venues')).toEqual([{ id: 'v1', name: 'Gaddafi', capacity: null }]);
    expect(await readAppliedVersions(db)).toEqual([1, 2]);
  });

  it('aborts a foreignKeysOff migration whose foreign_key_check finds rows, and re-enables foreign keys', async () => {
    const db = await createSqlJsDatabase();
    await runMigrations(db, { now });
    const error = await createMigrationRunner([...MIGRATIONS, orphanPlayer])(db, { now }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).cause).toMatchObject({ name: 'ForeignKeyViolationError' });
    expect(await readAppliedVersions(db)).toEqual([1]);
    expect(await db.getAllAsync("SELECT id FROM players WHERE id = 'ghost'")).toEqual([]);
    expect(await foreignKeysEnabled(db)).toBe(1);
  });

  it('runs every pending migration in order in one call', async () => {
    const db = await createSqlJsDatabase();
    const report = await createMigrationRunner([...MIGRATIONS, rebuildVenues])(db, { now });
    expect(report).toEqual({ fromVersion: 0, toVersion: 2, applied: [1, 2] });
    expect(await readSchemaVersion(db)).toBe(2);
  });
});

/** @jest-environment node */
import {
  DbError,
  ForeignKeyViolationError,
  LogConflictError,
  MigrationError,
  NotFoundError,
  SchemaTooNewError,
  SquadPlayerInUseError,
  sqliteErrorKind,
} from '../errors';
import { runMigrations } from '../migrate';
import { buildTeamSeed } from '../testing/builders';
import { sqliteError } from '../testing/faultInjectingDatabase';
import { openTestRepositories } from '../testing/harness';

describe('sqliteErrorKind', () => {
  it('classifies SQLite messages from both drivers', () => {
    const cases: readonly (readonly [unknown, ReturnType<typeof sqliteErrorKind>])[] = [
      [new Error('UNIQUE constraint failed: match_events.match_id, match_events.seq'), 'unique'],
      [new Error('PRIMARY KEY constraint failed: teams.id'), 'unique'],
      [new Error('FOREIGN KEY constraint failed'), 'foreign_key'],
      [new Error('CHECK constraint failed: runs_run BETWEEN 0 AND 9'), 'check'],
      [new Error('NOT NULL constraint failed: teams.name'), 'not_null'],
      [new Error('match_players.team_id is not a team of this match'), 'trigger'],
      [new Error('innings teams are not the teams of this match'), 'trigger'],
      [sqliteError('SQLITE_CONSTRAINT'), 'constraint'],
      [sqliteError('SQLITE_BUSY'), 'busy'],
      [new Error('database is locked'), 'busy'],
      [sqliteError('SQLITE_FULL'), 'full'],
      [sqliteError('SQLITE_IOERR'), 'io'],
      [new Error('file is not a database'), 'corrupt'],
      [new Error('database disk image is malformed'), 'corrupt'],
      ['Statement closed', 'other'],
      [new Error('something else'), 'other'],
    ];
    for (const [error, kind] of cases) {
      expect([String(error), sqliteErrorKind(error)]).toEqual([String(error), kind]);
    }
  });

  it('classifies real constraint failures raised by the schema', async () => {
    const { repos } = await openTestRepositories();
    const seed = buildTeamSeed('lio', 'Lions', 'LIO', 1);
    const lions = { ...seed, team: { ...seed.team, captainId: null } };
    await repos.teams.insert(lions.team);
    expect(sqliteErrorKind(await repos.teams.insert(lions.team).catch((e: unknown) => e))).toBe('unique');
    expect(sqliteErrorKind(await repos.teams.insert({ ...lions.team, id: 'y', captainId: 'ghost' }).catch((e: unknown) => e))).toBe('foreign_key');
    expect(sqliteErrorKind(await repos.players.insert({ ...lions.players[0], teamId: 'ghost' }).catch((e: unknown) => e))).toBe('foreign_key');
    expect(sqliteErrorKind(await repos.teams.insert({ ...lions.team, id: 'x', shortName: 'TOOLONG' }).catch((e: unknown) => e))).toBe('check');
  });
});

describe('DbError subclasses', () => {
  it('carry a name, structured details and plain-English messages', () => {
    const tooNew = new SchemaTooNewError(3, 1);
    expect(tooNew).toBeInstanceOf(DbError);
    expect(tooNew).toBeInstanceOf(Error);
    expect(tooNew.name).toBe('SchemaTooNewError');
    expect(tooNew.message).toMatch(/newer version of Scorebook/);
    expect(tooNew).toMatchObject({ databaseVersion: 3, appVersion: 1 });
    const cause = new Error('boom');
    const migration = new MigrationError(2, 'rebuild', cause);
    expect(migration.cause).toBe(cause);
    expect(migration.message).toMatch(/rolled back/);
    const fk = new ForeignKeyViolationError([
      { table: 'players', rowid: 4, parent: 'teams', fkid: 0 },
      { table: 'players', rowid: 5, parent: 'teams', fkid: 0 },
    ]);
    expect(fk.message).toBe('Foreign key check failed with 2 row(s): players → teams.');
    expect(new LogConflictError('m1', 8, 9, 'tail is 9, expected 8')).toMatchObject({ name: 'LogConflictError', matchId: 'm1', expectedLastSeq: 8, actualLastSeq: 9 });
    expect(new SquadPlayerInUseError('m1', 'p1')).toMatchObject({ name: 'SquadPlayerInUseError', matchId: 'm1', playerId: 'p1' });
    expect(new NotFoundError('match', 'm9').message).toBe('No match with id m9.');
    for (const error of [tooNew, migration, fk]) {
      expect(error.message).not.toMatch(/SQLITE|undefined/);
    }
  });

  it('are what the migration runner throws', async () => {
    const { db } = await openTestRepositories();
    await db.runAsync("INSERT INTO schema_migrations (version, name, applied_at) VALUES (5, 'future', 'x')");
    const error = await runMigrations(db, { now: () => 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaTooNewError);
  });
});

export class DbError extends Error {
  constructor(name: string, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SchemaTooNewError extends DbError {
  readonly databaseVersion: number;
  readonly appVersion: number;

  constructor(databaseVersion: number, appVersion: number) {
    super(
      'SchemaTooNewError',
      `This data was saved by a newer version of Scorebook (schema ${databaseVersion}; this app supports up to ${appVersion}). Update Scorebook to open it.`,
    );
    this.databaseVersion = databaseVersion;
    this.appVersion = appVersion;
  }
}

export class MigrationHistoryError extends DbError {
  readonly appliedVersions: readonly number[];

  constructor(appliedVersions: readonly number[]) {
    super('MigrationHistoryError', `The recorded schema history [${appliedVersions.join(', ')}] does not match this app's migrations.`);
    this.appliedVersions = appliedVersions;
  }
}

export class MigrationError extends DbError {
  readonly version: number;
  readonly migrationName: string;

  constructor(version: number, migrationName: string, cause: unknown) {
    super('MigrationError', `Database upgrade ${version} (${migrationName}) failed and was rolled back.`, { cause });
    this.version = version;
    this.migrationName = migrationName;
  }
}

export interface ForeignKeyViolation {
  readonly table: string;
  readonly rowid: number | null;
  readonly parent: string;
  readonly fkid: number;
}

export class ForeignKeyViolationError extends DbError {
  readonly violations: readonly ForeignKeyViolation[];

  constructor(violations: readonly ForeignKeyViolation[]) {
    const tables = [...new Set(violations.map((v) => `${v.table} → ${v.parent}`))].join(', ');
    super('ForeignKeyViolationError', `Foreign key check failed with ${violations.length} row(s): ${tables}.`);
    this.violations = violations;
  }
}

export class LogConflictError extends DbError {
  readonly matchId: string;
  readonly expectedLastSeq: number;
  readonly actualLastSeq: number;

  constructor(matchId: string, expectedLastSeq: number, actualLastSeq: number, detail: string) {
    super('LogConflictError', `The event log of match ${matchId} changed (${detail}).`);
    this.matchId = matchId;
    this.expectedLastSeq = expectedLastSeq;
    this.actualLastSeq = actualLastSeq;
  }
}

export class SquadPlayerInUseError extends DbError {
  readonly matchId: string;
  readonly playerId: string;

  constructor(matchId: string, playerId: string) {
    super('SquadPlayerInUseError', `Player ${playerId} is referenced by events of match ${matchId} and cannot be removed.`);
    this.matchId = matchId;
    this.playerId = playerId;
  }
}

export class InvalidRowsError extends DbError {
  constructor(message: string) {
    super('InvalidRowsError', message);
  }
}

export class NotFoundError extends DbError {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super('NotFoundError', `No ${entity} with id ${id}.`);
    this.entity = entity;
    this.id = id;
  }
}

export class TransactionClosedError extends DbError {
  constructor() {
    super('TransactionClosedError', 'A statement was issued on a transaction handle after its transaction ended.');
  }
}

export type SqliteErrorKind =
  | 'unique'
  | 'foreign_key'
  | 'check'
  | 'not_null'
  | 'trigger'
  | 'constraint'
  | 'busy'
  | 'full'
  | 'io'
  | 'corrupt'
  | 'other';

const SQLITE_ERROR_PATTERNS: readonly (readonly [SqliteErrorKind, RegExp])[] = [
  ['unique', /UNIQUE constraint failed|PRIMARY KEY constraint failed/i],
  ['foreign_key', /FOREIGN KEY constraint failed/i],
  ['check', /CHECK constraint failed/i],
  ['not_null', /NOT NULL constraint failed/i],
  ['trigger', /is not a team of this match|are not the teams of this match/i],
  ['constraint', /SQLITE_CONSTRAINT|constraint failed/i],
  ['busy', /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i],
  ['full', /SQLITE_FULL|database or disk is full/i],
  ['io', /SQLITE_IOERR|disk I\/O error/i],
  ['corrupt', /SQLITE_CORRUPT|SQLITE_NOTADB|malformed|not a database/i],
];

export function sqliteErrorKind(error: unknown): SqliteErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  const match = SQLITE_ERROR_PATTERNS.find(([, pattern]) => pattern.test(message));
  return match ? match[0] : 'other';
}

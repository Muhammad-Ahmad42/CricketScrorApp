import type { Database } from 'sql.js';
import { createSerializedDatabase, type SqlConnection } from '../internal/serializedDatabase';
import type { SqlDatabase, SqlParams, SqlRunResult } from '../types';
import { openSqlJsRaw, sqlJsConnection, type SqlJsConnection } from './sqljsConnection';

export class SimulatedCrash extends Error {
  constructor(message = 'Simulated crash: the process died.') {
    super(message);
    this.name = 'SimulatedCrash';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function sqliteError(code: 'SQLITE_FULL' | 'SQLITE_IOERR' | 'SQLITE_CONSTRAINT' | 'SQLITE_BUSY'): Error {
  const messages = {
    SQLITE_FULL: 'SQLITE_FULL: database or disk is full',
    SQLITE_IOERR: 'SQLITE_IOERR: disk I/O error',
    SQLITE_CONSTRAINT: 'SQLITE_CONSTRAINT: constraint failed',
    SQLITE_BUSY: 'SQLITE_BUSY: database is locked',
  } as const;
  return new Error(messages[code]);
}

export interface FailureRule {
  readonly sql: RegExp;
  readonly occurrence?: number;
  readonly error: Error;
}

export interface CrashRule {
  readonly sql: RegExp;
  readonly occurrence?: number;
}

export type StatementOutcome = 'ok' | 'error' | 'injected' | 'crashed' | 'frozen';

export interface LoggedStatement {
  readonly sql: string;
  readonly params: SqlParams | null;
  readonly inTransaction: boolean;
  readonly outcome: StatementOutcome;
}

export interface FaultInjectingDatabase extends SqlDatabase {
  readonly raw: Database;
  readonly statementLog: readonly LoggedStatement[];
  readonly durableImages: readonly Uint8Array[];
  readonly crashed: boolean;
  failOn(rule: FailureRule): void;
  failOnCommit(occurrence: number, error?: Error): void;
  crashAt(rule: CrashRule): void;
  clearFaults(): void;
  clearLog(): void;
  exportAsync(): Promise<Uint8Array>;
  lastDurableImage(): Uint8Array;
}

export interface FaultInjectingOptions {
  readonly data?: Uint8Array | null;
  readonly captureDurableImages?: boolean;
}

interface ArmedRule {
  readonly sql: RegExp;
  readonly occurrence: number;
  readonly action: { readonly kind: 'fail'; readonly error: Error } | { readonly kind: 'crash' };
  seen: number;
  fired: boolean;
}

const READ_ONLY = /^\s*(SELECT|WITH|PRAGMA\s+(foreign_key_check|foreign_keys|journal_mode|synchronous)\s*$)/i;
const BEGIN = /^\s*BEGIN\b/i;
const COMMIT = /^\s*(COMMIT|END)\b/i;
const ROLLBACK = /^\s*ROLLBACK\b/i;

class FaultState {
  readonly rules: ArmedRule[] = [];
  readonly log: LoggedStatement[] = [];
  readonly images: Uint8Array[] = [];
  inTransaction = false;
  frozen = false;

  constructor(
    private readonly inner: SqlJsConnection,
    private readonly capture: boolean,
  ) {
    if (capture) {
      this.images.push(inner.exportImage());
    }
  }

  private record(sql: string, params: SqlParams | undefined, outcome: StatementOutcome): void {
    this.log.push({ sql, params: params ?? null, inTransaction: this.inTransaction, outcome });
  }

  private triggered(sql: string): ArmedRule | null {
    let hit: ArmedRule | null = null;
    for (const rule of this.rules) {
      if (rule.fired || !rule.sql.test(sql)) {
        continue;
      }
      rule.seen += 1;
      if (rule.seen === rule.occurrence && hit === null) {
        rule.fired = true;
        hit = rule;
      }
    }
    return hit;
  }

  private afterSuccess(sql: string): void {
    if (BEGIN.test(sql)) {
      this.inTransaction = true;
      return;
    }
    if (COMMIT.test(sql)) {
      this.inTransaction = false;
      this.captureImage();
      return;
    }
    if (ROLLBACK.test(sql)) {
      this.inTransaction = false;
      return;
    }
    if (!this.inTransaction && !READ_ONLY.test(sql)) {
      this.captureImage();
    }
  }

  private captureImage(): void {
    if (this.capture) {
      this.images.push(this.inner.exportImage());
    }
  }

  async execute<T>(sql: string, params: SqlParams | undefined, work: () => Promise<T>): Promise<T> {
    if (this.frozen) {
      this.record(sql, params, 'frozen');
      throw new SimulatedCrash();
    }
    const rule = this.triggered(sql);
    if (rule !== null && rule.action.kind === 'crash') {
      this.frozen = true;
      this.record(sql, params, 'crashed');
      throw new SimulatedCrash();
    }
    if (rule !== null && rule.action.kind === 'fail') {
      this.record(sql, params, 'injected');
      if (ROLLBACK.test(sql)) {
        this.inTransaction = false;
      }
      throw rule.action.error;
    }
    try {
      const value = await work();
      this.record(sql, params, 'ok');
      this.afterSuccess(sql);
      return value;
    } catch (error) {
      this.record(sql, params, 'error');
      if (ROLLBACK.test(sql)) {
        this.inTransaction = false;
      }
      throw error;
    }
  }
}

function faultConnection(inner: SqlJsConnection, state: FaultState): SqlConnection {
  return {
    execAsync(source: string): Promise<void> {
      return state.execute(source, undefined, () => inner.execAsync(source));
    },
    runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      return state.execute(source, params, () => inner.runAsync(source, params));
    },
    getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      return state.execute(source, params, () => inner.getFirstAsync<T>(source, params));
    },
    getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      return state.execute(source, params, () => inner.getAllAsync<T>(source, params));
    },
    closeAsync(): Promise<void> {
      return inner.closeAsync();
    },
  };
}

export async function createFaultInjectingDatabase(options: FaultInjectingOptions = {}): Promise<FaultInjectingDatabase> {
  const raw = await openSqlJsRaw(options.data);
  const inner = sqlJsConnection(raw);
  const state = new FaultState(inner, options.captureDurableImages ?? true);
  const db = createSerializedDatabase(faultConnection(inner, state));
  const arm = (sql: RegExp, occurrence: number | undefined, action: ArmedRule['action']): void => {
    state.rules.push({ sql, occurrence: occurrence ?? 1, action, seen: 0, fired: false });
  };
  return {
    execAsync: db.execAsync,
    runAsync: db.runAsync,
    getFirstAsync: db.getFirstAsync,
    getAllAsync: db.getAllAsync,
    withTransactionAsync: db.withTransactionAsync,
    closeAsync: db.closeAsync,
    raw,
    get statementLog(): readonly LoggedStatement[] {
      return state.log;
    },
    get durableImages(): readonly Uint8Array[] {
      return state.images;
    },
    get crashed(): boolean {
      return state.frozen;
    },
    failOn(rule: FailureRule): void {
      arm(rule.sql, rule.occurrence, { kind: 'fail', error: rule.error });
    },
    failOnCommit(occurrence: number, error?: Error): void {
      arm(COMMIT, occurrence, { kind: 'fail', error: error ?? sqliteError('SQLITE_IOERR') });
    },
    crashAt(rule: CrashRule): void {
      arm(rule.sql, rule.occurrence, { kind: 'crash' });
    },
    clearFaults(): void {
      state.rules.splice(0, state.rules.length);
    },
    clearLog(): void {
      state.log.splice(0, state.log.length);
    },
    exportAsync(): Promise<Uint8Array> {
      return db.runExclusive(async () => inner.exportImage());
    },
    lastDurableImage(): Uint8Array {
      const captured = state.images[state.images.length - 1];
      return captured ?? inner.exportImage();
    },
  };
}

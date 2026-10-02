export type SqlValue = string | number | null | Uint8Array;

export type SqlParams = readonly SqlValue[] | { readonly [name: string]: SqlValue };

export interface SqlRunResult {
  readonly lastInsertRowId: number;
  readonly changes: number;
}

export interface SqlExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  withTransactionAsync<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  closeAsync(): Promise<void>;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
  readonly foreignKeysOff?: boolean;
}

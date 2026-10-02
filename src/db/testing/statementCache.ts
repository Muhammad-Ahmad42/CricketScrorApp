import type { Database, Statement } from 'sql.js';

export interface StatementCache {
  use<T>(source: string, work: (statement: Statement) => T): T;
  clear(): void;
  readonly size: number;
}

export function createStatementCache(database: Database, capacity = 256): StatementCache {
  const statements = new Map<string, Statement>();

  const evictOldest = (): void => {
    const oldest = statements.keys().next();
    if (oldest.done) {
      return;
    }
    statements.get(oldest.value)?.free();
    statements.delete(oldest.value);
  };

  const acquire = (source: string): Statement => {
    const cached = statements.get(source);
    if (cached !== undefined) {
      statements.delete(source);
      statements.set(source, cached);
      return cached;
    }
    const prepared = database.prepare(source);
    statements.set(source, prepared);
    if (statements.size > capacity) {
      evictOldest();
    }
    return prepared;
  };

  return {
    use<T>(source: string, work: (statement: Statement) => T): T {
      const statement = acquire(source);
      try {
        return work(statement);
      } finally {
        statement.reset();
      }
    },
    clear(): void {
      for (const statement of statements.values()) {
        statement.free();
      }
      statements.clear();
    },
    get size(): number {
      return statements.size;
    },
  };
}

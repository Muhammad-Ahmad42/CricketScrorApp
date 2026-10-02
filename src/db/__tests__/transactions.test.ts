/** @jest-environment node */
import { TransactionClosedError } from '../errors';
import { createFaultInjectingDatabase, sqliteError } from '../testing/faultInjectingDatabase';
import { createSqlJsDatabase, type SqlJsTestDatabase } from '../testing/sqljsDatabase';
import type { SqlExecutor } from '../types';

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 5));

async function freshDb(): Promise<SqlJsTestDatabase> {
  const db = await createSqlJsDatabase();
  await db.execAsync('CREATE TABLE log (id INTEGER PRIMARY KEY, label TEXT NOT NULL) STRICT');
  return db;
}

async function labels(db: SqlExecutor): Promise<string[]> {
  const rows = await db.getAllAsync<{ readonly label: string }>('SELECT label FROM log ORDER BY id');
  return rows.map((row) => row.label);
}

describe('SqlDatabase transactions (sql.js adapter)', () => {
  it('commits the task and resolves its value', async () => {
    const db = await freshDb();
    const value = await db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['a']);
      const result = await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['b']);
      return result.lastInsertRowId;
    });
    expect(value).toBe(2);
    expect(await labels(db)).toEqual(['a', 'b']);
  });

  it('rolls back everything when the task throws and rethrows the error', async () => {
    const db = await freshDb();
    const failure = new Error('boom');
    await expect(
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['a']);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await labels(db)).toEqual([]);
  });

  it('serialises concurrent transactions without interleaving their statements', async () => {
    const db = await freshDb();
    const run = (name: string) =>
      db.withTransactionAsync(async (tx) => {
        for (let i = 0; i < 3; i += 1) {
          await tx.runAsync('INSERT INTO log (label) VALUES (?)', [`${name}${i}`]);
          await tick();
        }
      });
    await Promise.all([run('a'), run('b'), run('c')]);
    expect(await labels(db)).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2', 'c0', 'c1', 'c2']);
  });

  it('runs statements issued through the transaction handle directly (no deadlock)', async () => {
    const db = await freshDb();
    const count = await db.withTransactionAsync(async (tx) => {
      await Promise.all([
        tx.runAsync('INSERT INTO log (label) VALUES (?)', ['x']),
        tx.runAsync('INSERT INTO log (label) VALUES (?)', ['y']),
      ]);
      const row = await tx.getFirstAsync<{ readonly n: number }>('SELECT count(*) AS n FROM log');
      return row?.n;
    });
    expect(count).toBe(2);
  });

  it('makes a root write wait for an open transaction and keeps it when that transaction rolls back', async () => {
    const db = await freshDb();
    const gate = deferred();
    const started = deferred();
    const transaction = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['in-tx']);
      started.resolve();
      await gate.promise;
      throw new Error('use case failed');
    });
    await started.promise;
    let rootDone = false;
    const rootWrite = db.runAsync('INSERT INTO log (label) VALUES (?)', ['root']).then(() => {
      rootDone = true;
    });
    await tick();
    expect(rootDone).toBe(false);
    const raw = db.raw.exec('SELECT label FROM log');
    expect(raw[0]?.values.map((v) => v[0])).toEqual(['in-tx']);
    gate.resolve();
    await expect(transaction).rejects.toThrow('use case failed');
    await rootWrite;
    expect(rootDone).toBe(true);
    expect(await labels(db)).toEqual(['root']);
  });

  it('makes root reads wait until the transaction commits', async () => {
    const db = await freshDb();
    const gate = deferred();
    const started = deferred();
    const transaction = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['a']);
      started.resolve();
      await gate.promise;
    });
    await started.promise;
    const read = labels(db);
    gate.resolve();
    await transaction;
    expect(await read).toEqual(['a']);
  });

  it('refuses statements on a transaction handle after its transaction ended', async () => {
    const db = await freshDb();
    const leaked: SqlExecutor[] = [];
    await db.withTransactionAsync(async (tx) => {
      leaked.push(tx);
    });
    expect(leaked).toHaveLength(1);
    await expect(leaked[0].runAsync('INSERT INTO log (label) VALUES (?)', ['late'])).rejects.toBeInstanceOf(TransactionClosedError);
    await expect(leaked[0].getAllAsync('SELECT label FROM log')).rejects.toBeInstanceOf(TransactionClosedError);
    expect(await labels(db)).toEqual([]);
  });

  it('continues to serve later callers after a failed transaction', async () => {
    const db = await freshDb();
    await expect(db.withTransactionAsync(async () => Promise.reject(new Error('first')))).rejects.toThrow('first');
    await db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['second']);
    });
    expect(await labels(db)).toEqual(['second']);
  });

  it('rolls back when COMMIT fails and leaves the database usable', async () => {
    const db = await createFaultInjectingDatabase();
    await db.execAsync('CREATE TABLE log (id INTEGER PRIMARY KEY, label TEXT NOT NULL) STRICT');
    db.failOnCommit(1);
    await expect(
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['lost']);
      }),
    ).rejects.toThrow(/SQLITE_IOERR/);
    expect(db.statementLog.map((entry) => entry.sql).slice(-2)).toEqual(['COMMIT', 'ROLLBACK']);
    expect(await labels(db)).toEqual([]);
    await db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log (label) VALUES (?)', ['kept']);
    });
    expect(await labels(db)).toEqual(['kept']);
  });

  it('surfaces a failure of BEGIN without running the task or a rollback', async () => {
    const db = await createFaultInjectingDatabase();
    await db.execAsync('CREATE TABLE log (id INTEGER PRIMARY KEY, label TEXT NOT NULL) STRICT');
    db.failOn({ sql: /^BEGIN/, error: sqliteError('SQLITE_BUSY') });
    const task = jest.fn(async () => undefined);
    await expect(db.withTransactionAsync(task)).rejects.toThrow(/SQLITE_BUSY/);
    expect(task).not.toHaveBeenCalled();
    expect(db.statementLog.some((entry) => entry.sql === 'ROLLBACK')).toBe(false);
    await expect(db.withTransactionAsync(async () => 'ok')).resolves.toBe('ok');
  });

  it('rolls back a transaction whose deferred foreign keys fail at COMMIT', async () => {
    const db = await freshDb();
    await db.execAsync(`
CREATE TABLE parent (id TEXT PRIMARY KEY) STRICT;
CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED) STRICT;`);
    await expect(
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync("INSERT INTO child VALUES ('c1', 'p1')");
        await tx.runAsync("INSERT INTO log (label) VALUES ('side effect')");
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(await db.getAllAsync('SELECT * FROM child')).toEqual([]);
    expect(await labels(db)).toEqual([]);
    await db.withTransactionAsync(async (tx) => {
      await tx.runAsync("INSERT INTO child VALUES ('c2', 'p2')");
      await tx.runAsync("INSERT INTO parent VALUES ('p2')");
    });
    expect(await db.getAllAsync('SELECT id FROM child')).toEqual([{ id: 'c2' }]);
  });

  it('exports a committed image while no transaction is open', async () => {
    const db = await freshDb();
    await db.runAsync("INSERT INTO log (label) VALUES ('durable')");
    const gate = deferred();
    const started = deferred();
    const transaction = db.withTransactionAsync(async (tx) => {
      await tx.runAsync("INSERT INTO log (label) VALUES ('pending')");
      started.resolve();
      await gate.promise;
    });
    await started.promise;
    const image = db.exportAsync();
    gate.resolve();
    await transaction;
    const reopened = await createSqlJsDatabase({ data: await image });
    expect(await labels(reopened)).toEqual(['durable', 'pending']);
    const fk = await db.getFirstAsync<{ readonly foreign_keys: number }>('PRAGMA foreign_keys');
    expect(fk?.foreign_keys).toBe(1);
  });
});

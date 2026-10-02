/** @jest-environment node */
import { runMigrations } from '../migrate';
import { openSqlJsRaw } from '../testing/sqljsConnection';
import { createSqlJsDatabase } from '../testing/sqljsDatabase';
import { createStatementCache } from '../testing/statementCache';

describe('sql.js SqlDatabase adapter', () => {
  it('binds positional and named parameters and returns typed rows, blobs and run results', async () => {
    const db = await createSqlJsDatabase();
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL, data BLOB) STRICT');
    const first = await db.runAsync('INSERT INTO t (name, score, data) VALUES (?, ?, ?)', ['a', 1.5, new Uint8Array([1, 2, 3])]);
    const second = await db.runAsync('INSERT INTO t (name, score, data) VALUES ($name, $score, NULL)', { $name: 'b', $score: 2 });
    expect(first).toEqual({ changes: 1, lastInsertRowId: 1 });
    expect(second).toEqual({ changes: 1, lastInsertRowId: 2 });
    expect(await db.getAllAsync('SELECT id, name, score, data FROM t ORDER BY id')).toEqual([
      { id: 1, name: 'a', score: 1.5, data: new Uint8Array([1, 2, 3]) },
      { id: 2, name: 'b', score: 2, data: null },
    ]);
    expect(await db.getFirstAsync('SELECT name FROM t WHERE id = ?', [9])).toBeNull();
    expect(await db.runAsync('UPDATE t SET score = score + 1')).toMatchObject({ changes: 2 });
    expect(await db.runAsync('DELETE FROM t WHERE id = ?', [9])).toMatchObject({ changes: 0 });
  });

  it('keeps working after exporting an image and closes cleanly', async () => {
    const db = await createSqlJsDatabase();
    await db.execAsync('CREATE TABLE t (n INTEGER) STRICT');
    await db.runAsync('INSERT INTO t VALUES (?)', [1]);
    expect(await db.getAllAsync('SELECT n FROM t')).toEqual([{ n: 1 }]);
    const image = await db.exportAsync();
    await db.runAsync('INSERT INTO t VALUES (?)', [2]);
    expect(await db.getAllAsync('SELECT n FROM t')).toEqual([{ n: 1 }, { n: 2 }]);
    const copy = await createSqlJsDatabase({ data: image });
    expect(await copy.getAllAsync('SELECT n FROM t')).toEqual([{ n: 1 }]);
    await db.closeAsync();
    await copy.closeAsync();
  });

  it('re-prepares cached statements after a schema change', async () => {
    const db = await createSqlJsDatabase();
    await db.execAsync('CREATE TABLE t (a INTEGER) STRICT');
    await db.runAsync('INSERT INTO t VALUES (?)', [1]);
    expect(await db.getAllAsync('SELECT * FROM t')).toEqual([{ a: 1 }]);
    await db.execAsync('ALTER TABLE t ADD COLUMN b TEXT');
    expect(await db.getAllAsync('SELECT * FROM t')).toEqual([{ a: 1, b: null }]);
  });

  it('reuses statements, evicts the least recently used one and resets after failures', async () => {
    const raw = await openSqlJsRaw();
    raw.exec('CREATE TABLE t (n INTEGER PRIMARY KEY)');
    const cache = createStatementCache(raw, 2);
    const insert = (n: number): void =>
      cache.use('INSERT INTO t VALUES (?)', (statement) => {
        statement.bind([n]);
        statement.step();
      });
    const count = (): unknown => cache.use('SELECT count(*) AS n FROM t', (statement) => (statement.step() ? statement.getAsObject().n : null));
    insert(1);
    insert(2);
    expect(count()).toBe(2);
    expect(cache.size).toBe(2);
    expect(() => insert(1)).toThrow(/UNIQUE/);
    insert(3);
    cache.use('SELECT 1', (statement) => statement.step());
    expect(cache.size).toBe(2);
    expect(count()).toBe(3);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(count()).toBe(3);
  });

  it('opens with foreign keys on and runs the real migrations', async () => {
    const db = await createSqlJsDatabase();
    expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    const report = await runMigrations(db, { now: () => '2026-05-01T09:00:00.000Z' });
    expect(report.applied).toEqual([1]);
    expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  });
});

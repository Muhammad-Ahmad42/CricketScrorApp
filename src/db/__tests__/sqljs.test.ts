/** @jest-environment node */
import initSqlJs from 'sql.js';

describe('sql.js under jest', () => {
  it('executes SQL with foreign keys', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec('PRAGMA foreign_keys = ON; CREATE TABLE a(id TEXT PRIMARY KEY); CREATE TABLE b(id TEXT, a_id TEXT REFERENCES a(id));');
    db.run('INSERT INTO a VALUES (?)', ['x']);
    expect(() => db.run('INSERT INTO b VALUES (?, ?)', ['1', 'missing'])).toThrow();
    const res = db.exec('SELECT count(*) FROM a');
    expect(res[0].values[0][0]).toBe(1);
  });
});

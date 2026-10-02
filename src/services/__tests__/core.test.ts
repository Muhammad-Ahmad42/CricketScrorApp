/** @jest-environment node */
import { toServiceError } from '../core/errors';
import { exportsDirectory, joinPath, safeFileName } from '../core/paths';
import { failure, ok, unwrap } from '../core/result';
import { sha256Hex } from '../core/sha256';
import { deepEqual, isIsoDate, isLocalTime, toJsonValue, trimmedOrNull } from '../core/values';
import { createTournamentLocator } from '../core/context';
import { LogConflictError, MigrationError, NotFoundError, SchemaTooNewError, SquadPlayerInUseError } from '@/db';

interface NodeCrypto {
  createHash(algorithm: 'sha256'): { update(text: string, encoding: 'utf8'): { digest(encoding: 'hex'): string } };
}

const nodeCrypto = jest.requireActual<NodeCrypto>('crypto');

function nodeSha(text: string): string {
  return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('matches the published vector for %j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it.each(['Lions & <Co> café', 'شاہین آفریدی 🏏', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(1000), '\ud83c'])(
    'agrees with node crypto for %#',
    (input) => {
      expect(sha256Hex(input)).toBe(nodeSha(input));
    },
  );
});

describe('paths', () => {
  it('joins without doubled separators', () => {
    expect(joinPath('file:///cache/', 'exports', 'a.json')).toBe('file:///cache/exports/a.json');
    expect(joinPath('file:///cache', '/exports/', '')).toBe('file:///cache/exports');
    expect(exportsDirectory('file:///data/cache/')).toBe('file:///data/cache/exports');
  });

  it('makes names safe for the file system', () => {
    expect(safeFileName('Scorecard - Lions v Tigers: Final/2026?')).toBe('Scorecard - Lions v Tigers Final 2026');
    expect(safeFileName('   ')).toBe('export');
    expect(safeFileName('a'.repeat(200))).toHaveLength(120);
  });
});

describe('values', () => {
  it('converts objects to JSON values and drops undefined members', () => {
    expect(toJsonValue({ a: 1, b: undefined, c: [1, 'x', null, Number.NaN], d: { e: true } })).toEqual({ a: 1, c: [1, 'x', null, null], d: { e: true } });
  });

  it('compares structurally and ignores undefined members', () => {
    expect(deepEqual({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });

  it('validates dates and times', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('31/12/2026')).toBe(false);
    expect(isLocalTime('23:59')).toBe(true);
    expect(isLocalTime('24:00')).toBe(false);
    expect(trimmedOrNull('  x ')).toBe('x');
    expect(trimmedOrNull('   ')).toBeNull();
    expect(trimmedOrNull(undefined)).toBeNull();
  });
});

describe('service errors (§86)', () => {
  it('maps storage failures to human messages and keeps the detail separate', () => {
    const error = toServiceError(new Error('SQLITE_FULL: database or disk is full'), 'Could not save.');
    expect(error).toMatchObject({ code: 'STORAGE', message: 'Could not save.' });
    expect(error.detail).toMatch(/SQLITE_FULL/);
  });

  it('maps known database errors', () => {
    expect(toServiceError(new LogConflictError('m', 1, 2, 'tail'), 'x').code).toBe('CONFLICT');
    expect(toServiceError(new Error('UNIQUE constraint failed: match_events.match_id, match_events.seq'), 'x').code).toBe('CONFLICT');
    expect(toServiceError(new SchemaTooNewError(3, 1), 'x')).toMatchObject({ code: 'STORAGE', message: expect.stringMatching(/newer version/) });
    expect(toServiceError(new MigrationError(1, 'initial', new Error('boom')), 'x').message).toMatch(/upgrade/);
    expect(toServiceError(new SquadPlayerInUseError('m', 'p'), 'x').code).toBe('FORBIDDEN_STATE');
    expect(toServiceError(new NotFoundError('match', 'm'), 'x').code).toBe('NOT_FOUND');
    expect(toServiceError('plain', 'x')).toMatchObject({ code: 'STORAGE', detail: 'plain' });
  });

  it('passes typed failures through unchanged', () => {
    const typed = failure('VALIDATION', 'Choose two teams.', { domainCode: 'X' });
    expect(toServiceError(typed, 'other')).toEqual({ code: 'VALIDATION', message: 'Choose two teams.', domainCode: 'X', detail: null });
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap({ ok: false, error: typed.error })).toThrow('Choose two teams.');
  });
});

describe('tournament locator', () => {
  it('remembers and forgets stage and fixture owners', () => {
    const locator = createTournamentLocator();
    const snapshot = {
      tournament: { id: 't1' },
      stages: [{ id: 's1' }],
      fixtures: [{ id: 'f1' }],
    } as unknown as Parameters<typeof locator.remember>[0];
    locator.remember(snapshot);
    expect(locator.ownerOfStage('s1')).toBe('t1');
    expect(locator.ownerOfFixture('f1')).toBe('t1');
    locator.forget('t1');
    expect(locator.ownerOfStage('s1')).toBeNull();
    expect(locator.ownerOfFixture('f1')).toBeNull();
  });
});

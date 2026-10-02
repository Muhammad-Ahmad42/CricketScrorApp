/** @jest-environment node */
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/domain/types';
import type { BackupData } from '@/domain/types';
import { canonicalJson } from '../canonicalJson';
import { backupCounts, emptyBackupData } from '../collections';
import { backupFileName, buildBackupEnvelope, sealBackupEnvelope, serializeBackupEnvelope, type BackupEnvelopeMeta } from '../envelope';
import { tournamentBackup } from './fixtures/backupData';
import { deepFreeze } from './support/freeze';
import { sha256Hex } from './support/sha256';

const META: BackupEnvelopeMeta = {
  exportId: '0b6f3c1e-8a4e-4c7e-9d0b-2f3a8e1c5d77',
  exportedAt: '2026-09-30T13:41:00.000Z',
  schemaVersion: 1,
  appVersion: '1.0.0',
  platform: 'android',
  scope: { kind: 'tournament', tournamentId: 'tour-spring' },
};

function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reversedKeys);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reversedKeys(entry)]),
    );
  }
  return value;
}

describe('canonicalJson', () => {
  it('sorts object keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,1,{"y":2,"z":1}]},"b":1}');
  });

  it('orders keys by UTF-16 code units', () => {
    expect(canonicalJson({ b: 1, a: 2, B: 3, Z: 4, aa: 5, é: 6, _: 7 })).toBe('{"B":3,"Z":4,"_":7,"a":2,"aa":5,"b":1,"é":6}');
  });

  it('orders number-like keys as text too', () => {
    expect(canonicalJson({ a: 3, 2: 2, 10: 1, nested: [{ 1: 'x', b: undefined, 0: 'y' }] })).toBe('{"10":1,"2":2,"a":3,"nested":[{"0":"y","1":"x"}]}');
    expect(canonicalJson({ '01': 1, '1': 2 })).toBe('{"01":1,"1":2}');
  });

  it('prints top-level primitives like JSON', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(3)).toBe('3');
  });

  it('omits undefined members and prints like JSON.stringify otherwise', () => {
    expect(canonicalJson({ a: undefined, b: null, c: [undefined, 1.5, -0, 1e21], d: 'q"\n ' })).toBe(
      `{"b":null,"c":[null,1.5,0,1e+21],"d":${JSON.stringify('q"\n ')}}`,
    );
    expect(canonicalJson({ n: Number.NaN, i: Number.POSITIVE_INFINITY })).toBe('{"i":null,"n":null}');
    expect(canonicalJson([true, false, 'x'])).toBe('[true,false,"x"]');
  });

  it('is identical for the same data built in a different key order', () => {
    const data = tournamentBackup();
    expect(canonicalJson(reversedKeys(data))).toBe(canonicalJson(data));
    expect(JSON.parse(canonicalJson(data))).toEqual(data);
  });

  it('never overflows the call stack on deeply nested values', () => {
    const depth = 20000;
    const nested = JSON.parse(`${'['.repeat(depth)}${']'.repeat(depth)}`) as unknown;
    expect(() => canonicalJson(nested)).not.toThrow();
    expect(canonicalJson(nested)).toBe(`${'['.repeat(depth)}${']'.repeat(depth)}`);
    const objects = JSON.parse(`${'{"b":1,"a":'.repeat(depth)}null${'}'.repeat(depth)}`) as unknown;
    expect(canonicalJson(objects)).toBe(`${'{"a":'.repeat(depth)}null${',"b":1}'.repeat(depth)}`);
  });

  it('prints deep values exactly like shallow ones, including omitted members and number-like keys', () => {
    const tail = { z: undefined, 1: 'x', b: [undefined, Number.NaN, 'q'], 0: null };
    let deep: unknown = tail;
    for (let level = 0; level < 20000; level += 1) {
      deep = [deep];
    }
    const printed = canonicalJson(deep);
    expect(printed.slice(20000, printed.length - 20000)).toBe(canonicalJson(tail));
    expect(canonicalJson(tail)).toBe('{"0":null,"1":"x","b":[null,null,"q"]}');
  });
});

describe('buildBackupEnvelope', () => {
  const data = deepFreeze(tournamentBackup());

  it('fills format, versions, metadata and counts', () => {
    const { envelope } = buildBackupEnvelope(data, META);
    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(envelope.exportId).toBe(META.exportId);
    expect(envelope.exportedAt).toBe(META.exportedAt);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.app).toEqual({ name: 'Scorebook', version: '1.0.0', platform: 'android' });
    expect(envelope.scope).toEqual(META.scope);
    expect(envelope.checksum).toBeNull();
    expect(envelope.data).toBe(data);
    expect(envelope.counts).toEqual(backupCounts(data));
    expect(envelope.counts.teams).toBe(5);
    expect(envelope.counts.matchEvents).toBe(data.matchEvents.length);
    expect(envelope.counts.settings).toBe(1);
  });

  it('counts settings as 0 when they are not included', () => {
    const { envelope } = buildBackupEnvelope({ ...data, settings: null }, META);
    expect(envelope.counts.settings).toBe(0);
    expect(buildBackupEnvelope(emptyBackupData(), META).envelope.counts).toEqual(
      Object.fromEntries(Object.keys(envelope.counts).map((key) => [key, 0])),
    );
  });

  it('gives the canonical JSON of the data as checksum input', () => {
    const { checksumInput } = buildBackupEnvelope(data, META);
    expect(checksumInput).toBe(canonicalJson(data));
  });

  it('is deterministic for identical data', () => {
    const first = buildBackupEnvelope(tournamentBackup(), META);
    const second = buildBackupEnvelope(reversedKeys(tournamentBackup()) as BackupData, META);
    expect(second.checksumInput).toBe(first.checksumInput);
    const sealedFirst = serializeBackupEnvelope(sealBackupEnvelope(first.envelope, sha256Hex(first.checksumInput)));
    const sealedSecond = serializeBackupEnvelope(sealBackupEnvelope(second.envelope, sha256Hex(second.checksumInput)));
    expect(sealedSecond).toBe(sealedFirst);
  });

  it('changes the checksum when any value changes', () => {
    const base = sha256Hex(buildBackupEnvelope(data, META).checksumInput);
    const renamed = { ...data, teams: data.teams.map((team, index) => (index === 0 ? { ...team, name: 'Lions XI' } : team)) };
    expect(sha256Hex(buildBackupEnvelope(renamed, META).checksumInput)).not.toBe(base);
  });
});

describe('sealing and serialising', () => {
  it('stores the checksum in lower case', () => {
    const { envelope } = buildBackupEnvelope(emptyBackupData(), META);
    expect(sealBackupEnvelope(envelope, 'ABCDEF').checksum).toBe('abcdef');
  });

  it('writes the header first and round-trips through JSON', () => {
    const { envelope, checksumInput } = buildBackupEnvelope(tournamentBackup(), META);
    const sealed = sealBackupEnvelope(envelope, sha256Hex(checksumInput));
    const text = serializeBackupEnvelope(sealed);
    expect(text.startsWith('{"format":"scorebook-backup","formatVersion":1,"exportId":')).toBe(true);
    expect(JSON.parse(text)).toEqual(sealed);
  });

  it('uses a real SHA-256 in the test support', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});

describe('backupFileName', () => {
  it('names files by scope, label and date', () => {
    expect(backupFileName({ kind: 'full' }, '2026-09-30T13:41:00.000Z')).toBe('scorebook-backup-2026-09-30.json');
    expect(backupFileName({ kind: 'tournament', tournamentId: 't' }, '2026-09-30T13:41:00.000Z', 'Spring Cup')).toBe(
      'tournament-backup-spring-cup-2026-09-30.json',
    );
    expect(backupFileName({ kind: 'match', matchId: 'm' }, '2026-09-30T13:41:00.000Z', 'Lions v Tigers!')).toBe(
      'match-backup-lions-v-tigers-2026-09-30.json',
    );
    expect(backupFileName({ kind: 'match', matchId: 'm' }, '2026-09-30T13:41:00.000Z', '<>')).toBe('match-backup-2026-09-30.json');
  });
});

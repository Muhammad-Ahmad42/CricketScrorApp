/** @jest-environment node */
import { canonicalJson } from '../canonicalJson';
import { parseBackupText } from '../parse';
import { upgradeEnvelope, type BackupUpgrade } from '../upgrade';
import { EMPTY_LOCAL_DATA } from '../validation/context';
import { validateBackup } from '../validation/validate';
import { tournamentBackup } from './fixtures/backupData';
import { acceptAll, codes, dataOf, exportText, PARSE, previewText, tamper } from './support/files';
import { sha256Hex } from './support/sha256';

const valid = exportText(tournamentBackup(), { kind: 'tournament', tournamentId: 'tour-spring' });

function reseal(text: string): string {
  return tamper(text, (file) => (file.checksum = sha256Hex(canonicalJson(file.data))));
}

function humane(message: string): boolean {
  return !/undefined|SQLITE|TypeError|at \w+ \(|\bnull\b/.test(message) && message.trim().length > 0;
}

describe('backup envelope checks', () => {
  it('accepts an untouched export', () => {
    const preview = previewText(valid);
    expect(preview.ok).toBe(true);
    expect(codes(preview, 'error')).toEqual([]);
    expect(codes(preview)).toEqual([]);
    expect(preview.scope).toEqual({ kind: 'tournament', tournamentId: 'tour-spring' });
    expect(preview.counts.matches).toBe(2);
    expect(preview.previouslyImportedAt).toBeNull();
  });

  it('describes where the file came from and what it holds, for the import summary (W-X1, BACKUP_RESTORE §10)', () => {
    expect(previewText(valid).source).toEqual({
      exportId: 'export-1',
      formatVersion: 1,
      schemaVersion: 1,
      exportedAt: '2026-09-30T13:41:00.000Z',
      appVersion: '1.0.0',
      platform: 'android',
      title: 'Spring Cup',
    });
    expect(previewText(exportText(tournamentBackup(), { kind: 'full' })).source?.title).toBeNull();
    expect(previewText(exportText(tournamentBackup(), { kind: 'match', matchId: 'match-1' })).source?.title).toBe('Lions v Tigers');
    expect(previewText(tamper(valid, (file) => (dataOf(file).teams[0].name = 'Edited Lions'))).source?.exportedAt).toBe('2026-09-30T13:41:00.000Z');
    expect(previewText('{"format":').source ?? null).toBeNull();
  });

  it.each([
    ['broken JSON', '{"format":'],
    ['an empty file', ''],
    ['whitespace only', '   \n'],
  ])('FR-04a rejects %s as INVALID_JSON', (_label, text) => {
    const preview = previewText(text);
    expect(preview.ok).toBe(false);
    expect(codes(preview)).toEqual(['INVALID_JSON']);
    expect(preview.conflicts).toEqual([]);
    expect(preview.counts.matches).toBe(0);
  });

  it('FR-04b rejects a file from another app as INVALID_FORMAT', () => {
    expect(codes(previewText(tamper(valid, (file) => (file.format = 'other-app'))))).toEqual(['INVALID_FORMAT']);
    expect(codes(previewText('[1,2,3]'))).toEqual(['INVALID_FORMAT']);
    expect(codes(previewText('"scorebook-backup"'))).toEqual(['INVALID_FORMAT']);
    expect(codes(previewText(tamper(valid, (file) => delete file.data)))).toEqual(['INVALID_FORMAT']);
  });

  it('FR-04c rejects an unsupported format version', () => {
    const newer = previewText(tamper(valid, (file) => (file.formatVersion = 99)));
    expect(newer.ok).toBe(false);
    expect(codes(newer)).toEqual(['UNSUPPORTED_FORMAT_VERSION']);
    expect(newer.issues[0].message).toContain('newer version of Scorebook');
    expect(codes(previewText(tamper(valid, (file) => (file.formatVersion = 'one'))))).toEqual(['UNSUPPORTED_FORMAT_VERSION']);
    expect(codes(previewText(tamper(valid, (file) => (file.formatVersion = 0))))).toEqual(['UNSUPPORTED_FORMAT_VERSION']);
  });

  it('FR-04d rejects a schema that is newer than this app', () => {
    const preview = previewText(tamper(valid, (file) => (file.schemaVersion = 99)));
    expect(preview.ok).toBe(false);
    expect(codes(preview)).toEqual(['SCHEMA_TOO_NEW']);
    expect(preview.issues[0].path).toBe('schemaVersion');
  });

  it('FR-04e flags a value changed after export as CHECKSUM_MISMATCH', () => {
    const changed = tamper(valid, (file) => {
      dataOf(file).teams[0].name = 'Lions XI';
    });
    const preview = previewText(changed);
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual({
      severity: 'error',
      code: 'CHECKSUM_MISMATCH',
      message: 'This file was changed or damaged after it was exported.',
      path: 'checksum',
    });
  });

  it('FR-04e rejects a checksum that is not a SHA-256 value', () => {
    expect(codes(previewText(tamper(valid, (file) => (file.checksum = 'abc'))), 'error')).toEqual(['CHECKSUM_MISMATCH']);
  });

  it.each<[string, unknown]>([
    ['too short', 'abc'],
    ['a number', 42],
    ['empty', ''],
  ])('never also calls a malformed checksum (%s) missing', (_label, checksum) => {
    const preview = previewText(tamper(valid, (file) => (file.checksum = checksum)));
    expect(preview.ok).toBe(false);
    expect(preview.issues.map((issue) => issue.code)).toEqual(['CHECKSUM_MISMATCH']);
  });

  it('refuses a schema version below the first one (schema versions start at 1)', () => {
    const preview = previewText(tamper(valid, (file) => (file.schemaVersion = 0)));
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'INVALID_VALUE', path: 'schemaVersion' }));
  });

  it('reports a deeply nested value as an issue instead of throwing', () => {
    const depth = 5000;
    const deep = valid.replace('"name":"Ground 2"', `"name":${'['.repeat(depth)}${']'.repeat(depth)}`);
    expect(deep).not.toBe(valid);
    const run = () => previewText(deep);
    expect(run).not.toThrow();
    const preview = run();
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_VALUE', path: expect.stringMatching(/^data\.venues\[\d+\]\.name$/) }));
  });

  it('FR-04f warns about a missing checksum but still allows the import', () => {
    const preview = previewText(tamper(valid, (file) => (file.checksum = null)));
    expect(preview.ok).toBe(true);
    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0]).toMatchObject({ severity: 'warning', code: 'CHECKSUM_MISSING' });
  });

  it('accepts the checksum case-insensitively', () => {
    const upper = tamper(valid, (file) => (file.checksum = String(file.checksum).toUpperCase()));
    expect(previewText(upper).ok).toBe(true);
  });

  it('warns when the checksum could not be computed on this device', () => {
    const preview = validateBackup(parseBackupText(valid, PARSE), { checksum: null, local: EMPTY_LOCAL_DATA, logChecker: acceptAll }).preview;
    expect(preview.ok).toBe(true);
    expect(preview.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'CHECKSUM_MISSING', path: 'checksum' })]);
  });

  it('reports bad envelope metadata without stopping', () => {
    const preview = previewText(
      tamper(valid, (file) => {
        file.exportId = '';
        file.exportedAt = 'yesterday';
        file.scope = { kind: 'season' };
        file.app = 'Scorebook';
      }),
    );
    expect(preview.ok).toBe(false);
    expect(preview.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['exportId', 'exportedAt', 'scope.kind', 'app']));
    expect(preview.scope).toEqual({ kind: 'full' });
  });

  it('warns when the counts do not match the data', () => {
    const preview = previewText(
      tamper(valid, (file) => {
        (file.counts as { teams: number }).teams = 7;
      }),
    );
    expect(preview.ok).toBe(true);
    expect(preview.issues).toContainEqual({
      severity: 'warning',
      code: 'INVALID_VALUE',
      message: 'The file says it has 7 teams but contains 5.',
      path: 'counts.teams',
    });
  });

  it('checks the checksum against the data as exported, before any upgrade', () => {
    const parsed = parseBackupText(valid, PARSE);
    if (!parsed.ok) {
      throw new Error('expected a parsed backup');
    }
    expect(parsed.checksumInput).toBe(canonicalJson(JSON.parse(valid).data));
  });

  it('FR-04l maps an older format version forward', () => {
    const upgrades: readonly BackupUpgrade[] = [
      {
        fromVersion: 1,
        upgrade: (envelope) => ({ ...envelope, data: { ...(envelope.data as object), templates: [] } }),
      },
    ];
    const old = reseal(
      tamper(valid, (file) => {
        delete (file.data as { templates?: unknown }).templates;
        delete (file.counts as { templates?: unknown }).templates;
      }),
    );
    expect(codes(previewText(old), 'error')).toEqual(['INVALID_VALUE']);
    const upgraded = previewText(old, { parse: { ...PARSE, currentFormatVersion: 2, upgrades } });
    expect(upgraded.ok).toBe(true);
    expect(upgraded.counts.templates).toBe(0);
    expect(codes(upgraded, 'error')).toEqual([]);
  });

  it('refuses an old version when no upgrade step exists', () => {
    const preview = previewText(valid, { parse: { ...PARSE, currentFormatVersion: 3, upgrades: [] } });
    expect(codes(preview)).toEqual(['UNSUPPORTED_FORMAT_VERSION']);
  });

  it('applies upgrade steps in order and bumps the version', () => {
    const steps: readonly BackupUpgrade[] = [
      { fromVersion: 2, upgrade: (envelope) => ({ ...envelope, trail: `${String(envelope.trail)}>3` }) },
      { fromVersion: 1, upgrade: (envelope) => ({ ...envelope, trail: '1>2' }) },
    ];
    const result = upgradeEnvelope({ formatVersion: 1 }, 1, steps, 3);
    expect(result).toEqual({ ok: true, envelope: { formatVersion: 3, trail: '1>2>3' } });
    expect(upgradeEnvelope({ formatVersion: 1 }, 1, steps.slice(0, 1), 3)).toEqual({ ok: false, missingFrom: 1 });
  });

  it('uses organizer-friendly messages for every envelope problem', () => {
    const files = [
      '{',
      tamper(valid, (file) => (file.format = 'x')),
      tamper(valid, (file) => (file.formatVersion = 99)),
      tamper(valid, (file) => (file.schemaVersion = 99)),
      tamper(valid, (file) => (dataOf(file).teams[0].name = 'Changed')),
      tamper(valid, (file) => (file.checksum = null)),
    ];
    files.forEach((text) => {
      previewText(text).issues.forEach((issue) => expect(humane(issue.message)).toBe(true));
    });
  });
});

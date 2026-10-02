import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/domain/types';
import type { BackupEnvelope, BackupIssue, BackupScope, IsoDateTime } from '@/domain/types';
import { canonicalJson } from './canonicalJson';
import { BACKUP_UPGRADES, upgradeEnvelope, type BackupUpgrade, type RawEnvelope } from './upgrade';
import { discriminated, idText, isoDateTime, isRecord, literal, nullable, object, text, type Guard } from './validation/guards';
import { createIssueLog, errorIssue, warningIssue, type IssueSink } from './validation/issues';

export interface ParseOptions {
  readonly latestSchemaVersion: number;
  readonly upgrades?: readonly BackupUpgrade[];
  readonly currentFormatVersion?: number;
}

export interface RawBackup {
  readonly formatVersion: number;
  readonly exportId: string;
  readonly schemaVersion: number;
  readonly exportedAt: IsoDateTime;
  readonly app: BackupEnvelope['app'];
  readonly scope: BackupScope;
  readonly counts: unknown;
  readonly checksum: string | null;
  readonly checksumMalformed: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

export type ParsedBackup =
  | { readonly ok: true; readonly backup: RawBackup; readonly checksumInput: string; readonly issues: readonly BackupIssue[] }
  | { readonly ok: false; readonly issues: readonly BackupIssue[] };

const NEWER_APP = 'This backup was made by a newer version of Scorebook. Update the app, then import it again.';

type ScopeOf<K extends BackupScope['kind']> = Extract<BackupScope, { readonly kind: K }>;

const scopeShape = discriminated<BackupScope, 'kind'>('kind', {
  full: object<ScopeOf<'full'>>({ kind: literal('full') }),
  tournament: object<ScopeOf<'tournament'>>({ kind: literal('tournament'), tournamentId: idText }),
  match: object<ScopeOf<'match'>>({ kind: literal('match'), matchId: idText }),
});

const appShape: Guard<BackupEnvelope['app']> = object<BackupEnvelope['app']>({
  name: literal('Scorebook'),
  version: text,
  platform: nullable(text),
});

function failed(issue: BackupIssue): ParsedBackup {
  return { ok: false, issues: [issue] };
}

function readVersion(envelope: RawEnvelope, current: number): number | BackupIssue {
  const version = envelope.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return errorIssue('UNSUPPORTED_FORMAT_VERSION', 'This backup uses a format Scorebook does not recognise.', 'formatVersion');
  }
  return version > current ? errorIssue('UNSUPPORTED_FORMAT_VERSION', NEWER_APP, 'formatVersion') : version;
}

const FIRST_SCHEMA_VERSION = 1;

function readSchemaVersion(envelope: RawEnvelope, latest: number, sink: IssueSink): number | BackupIssue {
  const version = envelope.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    sink.add(errorIssue('INVALID_VALUE', 'The backup does not say which database version it was made with.', 'schemaVersion'));
    return FIRST_SCHEMA_VERSION;
  }
  if (version < FIRST_SCHEMA_VERSION) {
    sink.add(errorIssue('INVALID_VALUE', 'The backup names a database version that Scorebook has never used.', 'schemaVersion'));
    return FIRST_SCHEMA_VERSION;
  }
  return version > latest ? errorIssue('SCHEMA_TOO_NEW', NEWER_APP, 'schemaVersion') : version;
}

function readChecksum(value: unknown, sink: IssueSink): Pick<RawBackup, 'checksum' | 'checksumMalformed'> {
  if (value === null || value === undefined) {
    return { checksum: null, checksumMalformed: false };
  }
  if (typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value)) {
    return { checksum: value.toLowerCase(), checksumMalformed: false };
  }
  sink.add(errorIssue('CHECKSUM_MISMATCH', 'The checksum in this file is not valid, so the file cannot be trusted.', 'checksum'));
  return { checksum: null, checksumMalformed: true };
}

function readMeta(envelope: RawEnvelope, sink: IssueSink): Pick<RawBackup, 'exportId' | 'exportedAt' | 'app' | 'scope'> {
  const exportId = idText(envelope.exportId, 'exportId', sink) ? envelope.exportId : '';
  const exportedAt = isoDateTime(envelope.exportedAt, 'exportedAt', sink) ? envelope.exportedAt : '';
  const appSink = createIssueLog();
  const app = appShape(envelope.app, 'app', appSink) ? envelope.app : { name: 'Scorebook' as const, version: 'unknown', platform: null };
  if (appSink.hasErrors()) {
    sink.add(warningIssue('INVALID_VALUE', 'The file does not say which app version made it.', 'app'));
  }
  const scope: BackupScope = scopeShape(envelope.scope, 'scope', sink) ? envelope.scope : { kind: 'full' };
  return { exportId, exportedAt, app, scope };
}

export function parseBackupValue(value: unknown, options: ParseOptions): ParsedBackup {
  const current = options.currentFormatVersion ?? BACKUP_FORMAT_VERSION;
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    return failed(errorIssue('INVALID_FORMAT', "This file isn't a Scorebook backup.", isRecord(value) ? 'format' : null));
  }
  const version = readVersion(value, current);
  if (typeof version !== 'number') {
    return failed(version);
  }
  if (!isRecord(value.data)) {
    return failed(errorIssue('INVALID_FORMAT', 'This backup has no data in it.', 'data'));
  }
  const checksumInput = canonicalJson(value.data);
  const upgraded = upgradeEnvelope(value, version, options.upgrades ?? BACKUP_UPGRADES, current);
  if (!upgraded.ok) {
    return failed(errorIssue('UNSUPPORTED_FORMAT_VERSION', 'This backup uses an older format that this version of Scorebook cannot read.', 'formatVersion'));
  }
  const envelope = upgraded.envelope;
  const log = createIssueLog();
  const schemaVersion = readSchemaVersion(envelope, options.latestSchemaVersion, log);
  if (typeof schemaVersion !== 'number') {
    return failed(schemaVersion);
  }
  if (!isRecord(envelope.data)) {
    return failed(errorIssue('INVALID_FORMAT', 'This backup has no data in it.', 'data'));
  }
  const meta = readMeta(envelope, log);
  const checksum = readChecksum(envelope.checksum, log);
  return {
    ok: true,
    backup: { formatVersion: version, schemaVersion, counts: envelope.counts, data: envelope.data, ...checksum, ...meta },
    checksumInput,
    issues: log.issues(),
  };
}

export function parseBackupText(text: string, options: ParseOptions): ParsedBackup {
  if (text.trim().length === 0) {
    return failed(errorIssue('INVALID_JSON', 'This file is empty.'));
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failed(errorIssue('INVALID_JSON', "This file couldn't be read. It may be damaged or not a Scorebook backup."));
  }
  return parseBackupValue(value, options);
}

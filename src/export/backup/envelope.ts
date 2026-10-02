import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/domain/types';
import type { BackupData, BackupEnvelope, BackupScope, IsoDateTime } from '@/domain/types';
import { canonicalJson } from './canonicalJson';
import { backupCounts } from './collections';

export interface BackupEnvelopeMeta {
  readonly exportId: string;
  readonly exportedAt: IsoDateTime;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly platform: string | null;
  readonly scope: BackupScope;
}

export interface PreparedBackup {
  readonly envelope: BackupEnvelope;
  readonly checksumInput: string;
}

export function buildBackupEnvelope(data: BackupData, meta: BackupEnvelopeMeta): PreparedBackup {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportId: meta.exportId,
    schemaVersion: meta.schemaVersion,
    exportedAt: meta.exportedAt,
    app: { name: 'Scorebook', version: meta.appVersion, platform: meta.platform },
    scope: meta.scope,
    counts: backupCounts(data),
    checksum: null,
    data,
  };
  return { envelope, checksumInput: canonicalJson(data) };
}

export function sealBackupEnvelope(envelope: BackupEnvelope, checksum: string): BackupEnvelope {
  return { ...envelope, checksum: checksum.toLowerCase() };
}

export function serializeBackupEnvelope(envelope: BackupEnvelope): string {
  const fields: readonly (readonly [keyof BackupEnvelope, unknown])[] = [
    ['format', envelope.format],
    ['formatVersion', envelope.formatVersion],
    ['exportId', envelope.exportId],
    ['schemaVersion', envelope.schemaVersion],
    ['exportedAt', envelope.exportedAt],
    ['app', envelope.app],
    ['scope', envelope.scope],
    ['counts', envelope.counts],
    ['checksum', envelope.checksum],
    ['data', envelope.data],
  ];
  return `{${fields.map(([name, value]) => `${JSON.stringify(name)}:${canonicalJson(value)}`).join(',')}}`;
}

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function backupFileName(scope: BackupScope, exportedAt: IsoDateTime, label: string | null = null): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export';
  const named = label === null ? '' : slug(label);
  const suffix = named === '' ? date : `${named}-${date}`;
  switch (scope.kind) {
    case 'full':
      return `scorebook-backup-${date}.json`;
    case 'tournament':
      return `tournament-backup-${suffix}.json`;
    case 'match':
      return `match-backup-${suffix}.json`;
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

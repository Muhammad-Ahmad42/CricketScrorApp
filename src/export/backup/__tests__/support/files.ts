import type { BackupData, BackupScope, ImportPreview } from '@/domain/types';
import { buildBackupEnvelope, sealBackupEnvelope, serializeBackupEnvelope } from '../../envelope';
import { parseBackupText, type ParseOptions } from '../../parse';
import { EMPTY_LOCAL_DATA, type BackupValidationContext, type LocalData } from '../../validation/context';
import type { MatchLogChecker } from '../../validation/eventLogs';
import { validateBackup, type BackupValidation } from '../../validation/validate';
import { sha256Hex } from './sha256';

export const LATEST_SCHEMA = 1;

export const PARSE: ParseOptions = { latestSchemaVersion: LATEST_SCHEMA };

export const acceptAll: MatchLogChecker = (_setup, events) => ({ events, corrected: 0, errors: [], state: null });

export function exportText(data: BackupData, scope: BackupScope = { kind: 'full' }): string {
  const prepared = buildBackupEnvelope(data, {
    exportId: 'export-1',
    exportedAt: '2026-09-30T13:41:00.000Z',
    schemaVersion: LATEST_SCHEMA,
    appVersion: '1.0.0',
    platform: 'android',
    scope,
  });
  return serializeBackupEnvelope(sealBackupEnvelope(prepared.envelope, sha256Hex(prepared.checksumInput)));
}

export type MutableJson = { [key: string]: unknown };

export function tamper(text: string, change: (file: MutableJson) => void): string {
  const file = JSON.parse(text) as MutableJson;
  change(file);
  return JSON.stringify(file);
}

export function dataOf(file: MutableJson): { [key: string]: MutableJson[] } {
  return file.data as { [key: string]: MutableJson[] };
}

export function validateText(
  text: string,
  options: { readonly local?: LocalData; readonly checker?: MatchLogChecker; readonly parse?: ParseOptions } = {},
): BackupValidation {
  const parsed = parseBackupText(text, options.parse ?? PARSE);
  const ctx: BackupValidationContext = {
    checksum: parsed.ok ? sha256Hex(parsed.checksumInput) : null,
    local: options.local ?? EMPTY_LOCAL_DATA,
    logChecker: options.checker ?? acceptAll,
  };
  return validateBackup(parsed, ctx);
}

export function previewText(text: string, options: Parameters<typeof validateText>[1] = {}): ImportPreview {
  return validateText(text, options).preview;
}

export function codes(preview: ImportPreview, severity?: 'error' | 'warning'): string[] {
  return preview.issues.filter((issue) => severity === undefined || issue.severity === severity).map((issue) => issue.code);
}

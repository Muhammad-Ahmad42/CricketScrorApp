import { BACKUP_FORMAT_VERSION } from '@/domain/types';

export type RawEnvelope = Readonly<Record<string, unknown>>;

export interface BackupUpgrade {
  readonly fromVersion: number;
  readonly upgrade: (envelope: RawEnvelope) => RawEnvelope;
}

export const BACKUP_UPGRADES: readonly BackupUpgrade[] = [];

export type UpgradeResult = { readonly ok: true; readonly envelope: RawEnvelope } | { readonly ok: false; readonly missingFrom: number };

export function upgradeEnvelope(
  envelope: RawEnvelope,
  fromVersion: number,
  upgrades: readonly BackupUpgrade[] = BACKUP_UPGRADES,
  targetVersion: number = BACKUP_FORMAT_VERSION,
): UpgradeResult {
  let current = envelope;
  for (let version = fromVersion; version < targetVersion; version += 1) {
    const step = upgrades.find((candidate) => candidate.fromVersion === version);
    if (step === undefined) {
      return { ok: false, missingFrom: version };
    }
    current = { ...step.upgrade(current), formatVersion: version + 1 };
  }
  return { ok: true, envelope: current };
}

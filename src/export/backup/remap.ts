import type { BackupData, Id } from '@/domain/types';
import { visitBackupIds } from './ids/visitBackup';

export type BackupEntity = keyof BackupData;

export interface IdReference {
  readonly path: string;
  readonly entity: BackupEntity;
  readonly id: Id;
}

export function collectIdReferences(data: BackupData): readonly IdReference[] {
  const references: IdReference[] = [];
  visitBackupIds(data, (site) => {
    if (site.role === 'reference') {
      references.push({ path: site.path, entity: site.entity, id: site.id });
    }
    return site.id;
  });
  return references;
}

export function remapBackupIds(data: BackupData, idFor: (entity: BackupEntity, oldId: Id) => Id): BackupData {
  const assigned = new Map<string, Id>();
  return visitBackupIds(data, (site) => {
    const memoKey = `${site.entity}\u0000${site.id}`;
    const known = assigned.get(memoKey);
    if (known !== undefined) {
      return known;
    }
    const next = idFor(site.entity, site.id);
    assigned.set(memoKey, next);
    return next;
  });
}

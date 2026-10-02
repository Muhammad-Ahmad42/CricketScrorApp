import type { Id } from '@/domain/types';
import type { BackupEntity } from '../remap';

export type IdRole = 'key' | 'reference' | 'link';

export interface IdSite {
  readonly path: string;
  readonly entity: BackupEntity;
  readonly id: Id;
  readonly role: IdRole;
}

export type IdVisit = (site: IdSite) => Id;

export interface Cursor {
  readonly path: string;
  readonly visit: IdVisit;
}

export function at(cursor: Cursor, field: string): Cursor {
  return { path: `${cursor.path}.${field}`, visit: cursor.visit };
}

export function item(cursor: Cursor, index: number): Cursor {
  return { path: `${cursor.path}[${index}]`, visit: cursor.visit };
}

function site(cursor: Cursor, field: string, entity: BackupEntity, id: Id, role: IdRole): Id {
  return cursor.visit({ path: `${cursor.path}.${field}`, entity, id, role });
}

export function key(cursor: Cursor, field: string, entity: BackupEntity, id: Id): Id {
  return site(cursor, field, entity, id, 'key');
}

export function ref(cursor: Cursor, field: string, entity: BackupEntity, id: Id): Id {
  return site(cursor, field, entity, id, 'reference');
}

export function optionalRef(cursor: Cursor, field: string, entity: BackupEntity, id: Id | null): Id | null {
  return id === null ? null : ref(cursor, field, entity, id);
}

export function refList(cursor: Cursor, field: string, entity: BackupEntity, ids: readonly Id[]): readonly Id[] {
  const list = at(cursor, field);
  return ids.map((id, index) => list.visit({ path: `${list.path}[${index}]`, entity, id, role: 'reference' }));
}

export function link(cursor: Cursor, field: string, entity: BackupEntity, id: Id): Id {
  return site(cursor, field, entity, id, 'link');
}

export function optionalLink(cursor: Cursor, field: string, entity: BackupEntity, id: Id | null): Id | null {
  return id === null ? null : link(cursor, field, entity, id);
}

export function rows<T>(root: Cursor, collection: string, list: readonly T[], visitRow: (row: T, cursor: Cursor) => T): readonly T[] {
  const base = at(root, collection);
  return list.map((row, index) => visitRow(row, item(base, index)));
}

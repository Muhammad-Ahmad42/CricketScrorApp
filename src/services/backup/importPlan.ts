import { backupCounts, markAsCopies, remapBackupIds, withoutAggregates, type BackupEntity } from '@/export';
import type { BackupData, Id, IdGenerator, ImportConflict, ImportConflictPolicy } from '@/domain/types';

export interface ImportPlan {
  readonly data: BackupData;
  readonly replace: readonly { readonly entity: 'tournament' | 'match'; readonly id: Id }[];
  readonly libraryConflict: 'keep_local' | 'update_local';
  readonly skipped: { readonly [entity: string]: number };
}

const LIBRARY_ENTITIES: readonly BackupEntity[] = ['teams', 'players', 'venues'];

function aggregateIds(conflicts: readonly ImportConflict[], entity: 'tournament' | 'match'): ReadonlySet<Id> {
  return new Set(conflicts.filter((conflict) => conflict.entity === entity).map((conflict) => conflict.id));
}

function withoutExistingLibrary(data: BackupData, conflicts: readonly ImportConflict[]): BackupData {
  const existing = (entity: ImportConflict['entity']) => new Set(conflicts.filter((conflict) => conflict.entity === entity).map((conflict) => conflict.id));
  const teams = existing('team');
  const players = existing('player');
  const venues = existing('venue');
  const templates = existing('template');
  const presets = existing('preset');
  return {
    ...data,
    teams: data.teams.filter((row) => !teams.has(row.id)),
    players: data.players.filter((row) => !players.has(row.id)),
    venues: data.venues.filter((row) => !venues.has(row.id)),
    templates: data.templates.filter((row) => !templates.has(row.id)),
    formatPresets: data.formatPresets.filter((row) => !presets.has(row.id)),
  };
}

function withoutGlobalAudit(data: BackupData, conflicts: readonly ImportConflict[]): BackupData {
  if (conflicts.length === 0) {
    return data;
  }
  return { ...data, auditEvents: data.auditEvents.filter((event) => event.tournamentId !== null || event.matchId !== null) };
}

function skippedCounts(original: BackupData, kept: BackupData): { readonly [entity: string]: number } {
  const after: Readonly<Record<string, number>> = backupCounts(kept);
  return Object.fromEntries(Object.entries(backupCounts(original)).map(([key, count]) => [key, Math.max(0, count - (after[key] ?? 0))]));
}

function copyIds(data: BackupData, ids: IdGenerator): (entity: BackupEntity, oldId: Id) => Id {
  const rows: Readonly<Partial<Record<BackupEntity, ReadonlySet<Id>>>> = {
    teams: new Set(data.teams.map((row) => row.id)),
    players: new Set(data.players.map((row) => row.id)),
    venues: new Set(data.venues.map((row) => row.id)),
  };
  return (entity, oldId) => {
    if (LIBRARY_ENTITIES.includes(entity) && rows[entity]?.has(oldId) !== true) {
      return oldId;
    }
    return ids();
  };
}

export function planImport(data: BackupData, conflicts: readonly ImportConflict[], policy: ImportConflictPolicy, ids: IdGenerator): ImportPlan {
  const base: BackupData = { ...data, settings: null };
  const tournaments = aggregateIds(conflicts, 'tournament');
  const matches = aggregateIds(conflicts, 'match');
  switch (policy) {
    case 'skip_existing': {
      const kept = withoutExistingLibrary(withoutGlobalAudit(withoutAggregates(base, { tournamentIds: tournaments, matchIds: matches }), conflicts), conflicts);
      return { data: kept, replace: [], libraryConflict: 'keep_local', skipped: skippedCounts(data, kept) };
    }
    case 'import_as_copy': {
      const copied = remapBackupIds(markAsCopies(base, { tournamentIds: tournaments, matchIds: matches }), copyIds(base, ids));
      return { data: copied, replace: [], libraryConflict: 'keep_local', skipped: skippedCounts(data, copied) };
    }
    case 'replace_existing': {
      const kept = withoutGlobalAudit(base, conflicts);
      return {
        data: kept,
        replace: [
          ...[...matches].map((id) => ({ entity: 'match' as const, id })),
          ...[...tournaments].map((id) => ({ entity: 'tournament' as const, id })),
        ],
        libraryConflict: 'update_local',
        skipped: skippedCounts(data, kept),
      };
    }
    default: {
      const unreachable: never = policy;
      return unreachable;
    }
  }
}

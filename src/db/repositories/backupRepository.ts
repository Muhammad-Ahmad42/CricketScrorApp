import type { ImportAggregateKind } from '@/domain/types';
import type { SqlExecutor } from '../types';
import { exportBackupData } from './backupExport';
import { importBackupData } from './backupImport';
import type { BackupRepository } from './contracts';
import { IN_JSON_LIST, jsonList } from './sql';

const AGGREGATE_TABLES: Readonly<Record<ImportAggregateKind, string>> = {
  tournament: 'tournaments',
  match: 'matches',
  team: 'teams',
  player: 'players',
  venue: 'venues',
  template: 'tournament_templates',
  preset: 'match_format_presets',
};

async function aggregateMatchIds(db: SqlExecutor, entity: 'tournament' | 'match', id: string): Promise<string[]> {
  const sql =
    entity === 'tournament'
      ? 'SELECT id FROM matches WHERE tournament_id = ? ORDER BY created_at, rowid'
      : 'SELECT id FROM matches WHERE id = ?';
  const rows = await db.getAllAsync<{ readonly id: string }>(sql, [id]);
  return rows.map((row) => row.id);
}

async function deleteMatchAggregate(db: SqlExecutor, matchId: string): Promise<void> {
  await db.runAsync('DELETE FROM audit_events WHERE match_id = ?', [matchId]);
  await db.runAsync('DELETE FROM matches WHERE id = ?', [matchId]);
}

export function createBackupRepository(db: SqlExecutor): BackupRepository {
  return {
    exportData(scope) {
      return exportBackupData(db, scope);
    },
    importData(data, mode) {
      return importBackupData(db, data, mode.libraryConflict);
    },
    async deleteAggregate(entity, id) {
      for (const matchId of await aggregateMatchIds(db, entity, id)) {
        await deleteMatchAggregate(db, matchId);
      }
      if (entity === 'tournament') {
        await db.runAsync('DELETE FROM tournaments WHERE id = ?', [id]);
      }
    },
    async aggregateFootprint(entity, id) {
      const matchIds = await aggregateMatchIds(db, entity, id);
      const row = await db.getFirstAsync<{ readonly n: number }>(
        `SELECT count(*) AS n FROM match_events WHERE match_id ${IN_JSON_LIST}`,
        [jsonList(matchIds)],
      );
      return { matchIds, events: row?.n ?? 0 };
    },
    async existingIds(entity, ids) {
      if (ids.length === 0) {
        return new Set<string>();
      }
      const rows = await db.getAllAsync<{ readonly id: string }>(
        `SELECT id FROM ${AGGREGATE_TABLES[entity]} WHERE id ${IN_JSON_LIST}`,
        [jsonList(ids)],
      );
      return new Set(rows.map((row) => row.id));
    },
  };
}

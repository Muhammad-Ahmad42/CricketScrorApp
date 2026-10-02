import { AUDIT_COLUMNS, auditFromRow, auditToRecord, type AuditRow } from '../mappers/audit';
import {
  PRESET_COLUMNS,
  TEMPLATE_COLUMNS,
  presetFromRow,
  presetToRecord,
  settingsFromRows,
  templateFromRow,
  templateToRecord,
  type PresetRow,
  type TemplateRow,
} from '../mappers/config';
import { toJson } from '../mappers/values';
import type { SqlExecutor, SqlValue } from '../types';
import type { AuditRepository, FormatPresetRepository, SettingsRepository, TemplateRepository } from './contracts';
import { insertRow } from './sql';

export function createAuditRepository(db: SqlExecutor): AuditRepository {
  return {
    async append(event) {
      await insertRow(db, 'audit_events', auditToRecord(event));
    },
    async list(query) {
      const clauses: string[] = [];
      const params: SqlValue[] = [];
      if (query.tournamentId !== undefined) {
        clauses.push('tournament_id = ?');
        params.push(query.tournamentId);
      }
      if (query.matchId !== undefined) {
        clauses.push('match_id = ?');
        params.push(query.matchId);
      }
      if (query.before !== undefined) {
        clauses.push('created_at < ?');
        params.push(query.before);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.getAllAsync<AuditRow>(
        `SELECT ${AUDIT_COLUMNS} FROM audit_events ${where} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        [...params, query.limit],
      );
      return rows.map(auditFromRow);
    },
  };
}

export function createSettingsRepository(db: SqlExecutor): SettingsRepository {
  return {
    async getAll() {
      const rows = await db.getAllAsync<{ readonly key: string; readonly value_json: string }>(
        'SELECT key, value_json FROM app_settings ORDER BY key',
      );
      return settingsFromRows(rows);
    },
    async set(key, value, at) {
      await insertRow(
        db,
        'app_settings',
        { key, value_json: toJson(value), updated_at: at },
        { kind: 'update', target: 'key' },
      );
    },
  };
}

export function createTemplateRepository(db: SqlExecutor): TemplateRepository {
  return {
    async list() {
      const rows = await db.getAllAsync<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM tournament_templates ORDER BY name COLLATE NOCASE, id`,
      );
      return rows.map(templateFromRow);
    },
    async get(id) {
      const row = await db.getFirstAsync<TemplateRow>(`SELECT ${TEMPLATE_COLUMNS} FROM tournament_templates WHERE id = ?`, [id]);
      return row === null ? null : templateFromRow(row);
    },
    async upsert(template) {
      await insertRow(db, 'tournament_templates', templateToRecord(template), {
        kind: 'update',
        target: 'id',
        keep: ['created_at'],
      });
    },
    async delete(id) {
      await db.runAsync('DELETE FROM tournament_templates WHERE id = ?', [id]);
    },
  };
}

export function createFormatPresetRepository(db: SqlExecutor): FormatPresetRepository {
  return {
    async list() {
      const rows = await db.getAllAsync<PresetRow>(
        `SELECT ${PRESET_COLUMNS} FROM match_format_presets ORDER BY name COLLATE NOCASE, id`,
      );
      return rows.map(presetFromRow);
    },
    async upsert(preset, at) {
      await insertRow(db, 'match_format_presets', presetToRecord(preset, at, at), {
        kind: 'update',
        target: 'id',
        keep: ['created_at'],
      });
    },
    async delete(id) {
      await db.runAsync('DELETE FROM match_format_presets WHERE id = ?', [id]);
    },
  };
}

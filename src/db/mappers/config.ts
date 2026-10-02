import type { AppSettings, FormatPreset, MatchRules, TournamentTemplate } from '@/domain/types';
import { parseJson, toJson, type SqlRecord } from './values';

export const APP_SETTINGS_KEYS = [
  'theme',
  'hapticsEnabled',
  'soundEnabled',
  'reducedMotion',
  'reduceTransparency',
  'defaultFormatId',
  'scoring',
] as const satisfies readonly (keyof AppSettings)[];

export const OPTIONAL_SETTINGS_KEYS = ['reduceTransparency'] as const satisfies readonly (keyof AppSettings)[];

type MissingSettingsKey = Exclude<keyof AppSettings, (typeof APP_SETTINGS_KEYS)[number]>;
const SETTINGS_KEYS_EXHAUSTIVE: [MissingSettingsKey] extends [never] ? true : false = true;
void SETTINGS_KEYS_EXHAUSTIVE;

export type MutablePartialSettings = { -readonly [K in keyof AppSettings]?: AppSettings[K] };

export function isSettingsKey(key: string): key is keyof AppSettings {
  return (APP_SETTINGS_KEYS as readonly string[]).includes(key);
}

export function settingsFromRows(rows: readonly { readonly key: string; readonly value_json: string }[]): Partial<AppSettings> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    if (isSettingsKey(row.key)) {
      result[row.key] = parseJson<unknown>(row.value_json);
    }
  }
  return result as MutablePartialSettings;
}

export function completeSettings(settings: Partial<AppSettings>): AppSettings | null {
  const optional: readonly string[] = OPTIONAL_SETTINGS_KEYS;
  const complete = APP_SETTINGS_KEYS.every((key) => optional.includes(key) || settings[key] !== undefined);
  return complete ? (settings as AppSettings) : null;
}

export interface TemplateRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly team_count: number | null;
  readonly structure_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

type TemplateStructure = Omit<TournamentTemplate, 'id' | 'createdAt' | 'updatedAt'>;

export const TEMPLATE_COLUMNS = 'id, name, description, team_count, structure_json, created_at, updated_at';

export function templateFromRow(row: TemplateRow): TournamentTemplate {
  const structure = parseJson<TemplateStructure>(row.structure_json);
  return {
    ...structure,
    id: row.id,
    name: row.name,
    description: row.description,
    teamCount: row.team_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function templateToRecord(template: TournamentTemplate): SqlRecord {
  const { id, createdAt, updatedAt, ...structure } = template;
  return {
    id,
    name: template.name,
    description: template.description,
    team_count: template.teamCount,
    structure_json: toJson(structure),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export interface PresetRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rules_json: string;
}

export const PRESET_COLUMNS = 'id, name, description, rules_json';

export function presetFromRow(row: PresetRow): FormatPreset {
  return {
    id: row.id,
    label: row.name,
    description: row.description,
    builtin: false,
    rules: parseJson<MatchRules>(row.rules_json),
  };
}

export function presetToRecord(preset: FormatPreset, createdAt: string, updatedAt: string): SqlRecord {
  return {
    id: preset.id,
    name: preset.label,
    description: preset.description,
    rules_json: toJson(preset.rules),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

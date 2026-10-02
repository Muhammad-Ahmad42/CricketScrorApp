import { BUILTIN_FORMAT_PRESETS, SCORING_PROJECTION_VERSION } from '@/domain/scoring';
import { BACKUP_FORMAT_VERSION, type FormatPreset } from '@/domain/types';
import type { EngineVersions } from './selectors/diagnostics';

export const FORMAT_PRESETS: readonly FormatPreset[] = BUILTIN_FORMAT_PRESETS;

export const ENGINE_VERSIONS: EngineVersions = {
  scoringProjection: SCORING_PROJECTION_VERSION,
  backupFormat: BACKUP_FORMAT_VERSION,
};

export const SOUND_EFFECTS_AVAILABLE = false;

export const SETTINGS_ROUTES = {
  backup: '/settings/backup',
  presets: '/settings/presets',
  diagnostics: '/settings/diagnostics',
  about: '/settings/about',
  teams: '/teams',
} as const;

export type SettingsRoute = keyof typeof SETTINGS_ROUTES;

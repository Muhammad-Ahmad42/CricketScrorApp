import type { CreateRepositories, Repositories } from './contracts';
import { createBackupRepository } from './backupRepository';
import {
  createAuditRepository,
  createFormatPresetRepository,
  createSettingsRepository,
  createTemplateRepository,
} from './configRepositories';
import { createEventRepository } from './eventRepository';
import { createPlayerRepository, createTeamRepository, createVenueRepository } from './libraryRepositories';
import { createMatchRepository } from './matchRepository';
import { createTournamentRepository } from './tournamentRepository';

export { readMatchProjection } from './matchProjection';

export const createRepositories: CreateRepositories = (db): Repositories => ({
  teams: createTeamRepository(db),
  players: createPlayerRepository(db),
  venues: createVenueRepository(db),
  matches: createMatchRepository(db),
  events: createEventRepository(db),
  tournaments: createTournamentRepository(db),
  audit: createAuditRepository(db),
  settings: createSettingsRepository(db),
  templates: createTemplateRepository(db),
  presets: createFormatPresetRepository(db),
  backup: createBackupRepository(db),
});

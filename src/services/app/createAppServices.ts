import type { AppServices, ServiceDeps } from '../contracts';
import { createBackupService } from '../backup/backupService';
import { createServiceContext, type ServiceOptions } from '../core/context';
import { MESSAGES } from '../core/errors';
import { attempt } from '../core/transaction';
import { createExportService } from '../export/exportService';
import { createMatchService } from '../match/matchService';
import { createSettingsService } from '../settings/settingsService';
import { createTeamService } from '../team/teamService';
import { createTournamentService } from '../tournament/tournamentService';
import { bootstrapServices, checkIntegrity } from './bootstrap';

export function createAppServices(deps: ServiceDeps, options: ServiceOptions = {}): AppServices {
  const ctx = createServiceContext(deps, options);
  return {
    matches: createMatchService(ctx),
    teams: createTeamService(ctx),
    tournaments: createTournamentService(ctx),
    backup: createBackupService(ctx),
    export: createExportService(ctx),
    settings: createSettingsService(ctx),
    bootstrap: () => attempt(MESSAGES.bootstrap, () => bootstrapServices(ctx)),
    newId: () => ctx.ids(),
    checkIntegrity: () => attempt(MESSAGES.integrity, () => checkIntegrity(ctx)),
  };
}

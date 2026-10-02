import type { BackupData } from '@/domain/types';
import { rows, type Cursor, type IdVisit } from './cursor';
import { visitAuditEvent, visitOverride } from './governance';
import { visitFormatPreset, visitPlayer, visitTeam, visitTemplate, visitVenue } from './library';
import { visitMatch, visitMatchEvent, visitMatchPlayer } from './match';
import {
  visitFixture,
  visitPool,
  visitPoolEntry,
  visitSlot,
  visitStage,
  visitTournament,
  visitTournamentRules,
  visitTournamentTeam,
} from './tournament';

export const BACKUP_ROOT_PATH = 'data';

export function visitBackupIds(data: BackupData, visit: IdVisit): BackupData {
  const root: Cursor = { path: BACKUP_ROOT_PATH, visit };
  return {
    venues: rows(root, 'venues', data.venues, visitVenue),
    teams: rows(root, 'teams', data.teams, visitTeam),
    players: rows(root, 'players', data.players, visitPlayer),
    tournaments: rows(root, 'tournaments', data.tournaments, visitTournament),
    tournamentRules: rows(root, 'tournamentRules', data.tournamentRules, visitTournamentRules),
    tournamentTeams: rows(root, 'tournamentTeams', data.tournamentTeams, visitTournamentTeam),
    stages: rows(root, 'stages', data.stages, visitStage),
    pools: rows(root, 'pools', data.pools, visitPool),
    slots: rows(root, 'slots', data.slots, visitSlot),
    poolEntries: rows(root, 'poolEntries', data.poolEntries, visitPoolEntry),
    fixtures: rows(root, 'fixtures', data.fixtures, visitFixture),
    matches: rows(root, 'matches', data.matches, visitMatch),
    matchPlayers: rows(root, 'matchPlayers', data.matchPlayers, visitMatchPlayer),
    matchEvents: rows(root, 'matchEvents', data.matchEvents, visitMatchEvent),
    overrides: rows(root, 'overrides', data.overrides, visitOverride),
    auditEvents: rows(root, 'auditEvents', data.auditEvents, visitAuditEvent),
    templates: rows(root, 'templates', data.templates, visitTemplate),
    formatPresets: rows(root, 'formatPresets', data.formatPresets, visitFormatPreset),
    settings: data.settings,
  };
}

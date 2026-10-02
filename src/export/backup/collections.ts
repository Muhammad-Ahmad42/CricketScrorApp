import type { BackupData } from '@/domain/types';

export type BackupCollectionKey = Exclude<keyof BackupData, 'settings'>;

export const BACKUP_COLLECTION_KEYS = [
  'venues',
  'teams',
  'players',
  'tournaments',
  'tournamentRules',
  'tournamentTeams',
  'stages',
  'pools',
  'slots',
  'poolEntries',
  'fixtures',
  'matches',
  'matchPlayers',
  'matchEvents',
  'overrides',
  'auditEvents',
  'templates',
  'formatPresets',
] as const satisfies readonly BackupCollectionKey[];

const COLLECTION_KEYS_EXHAUSTIVE: [Exclude<BackupCollectionKey, (typeof BACKUP_COLLECTION_KEYS)[number]>] extends [never]
  ? true
  : false = true;
void COLLECTION_KEYS_EXHAUSTIVE;

export type BackupCounts = { readonly [K in keyof BackupData]: number };

export function backupCounts(data: BackupData): BackupCounts {
  return {
    venues: data.venues.length,
    teams: data.teams.length,
    players: data.players.length,
    tournaments: data.tournaments.length,
    tournamentRules: data.tournamentRules.length,
    tournamentTeams: data.tournamentTeams.length,
    stages: data.stages.length,
    pools: data.pools.length,
    slots: data.slots.length,
    poolEntries: data.poolEntries.length,
    fixtures: data.fixtures.length,
    matches: data.matches.length,
    matchPlayers: data.matchPlayers.length,
    matchEvents: data.matchEvents.length,
    overrides: data.overrides.length,
    auditEvents: data.auditEvents.length,
    templates: data.templates.length,
    formatPresets: data.formatPresets.length,
    settings: data.settings === null ? 0 : 1,
  };
}

export function emptyBackupData(): BackupData {
  return {
    venues: [],
    teams: [],
    players: [],
    tournaments: [],
    tournamentRules: [],
    tournamentTeams: [],
    stages: [],
    pools: [],
    slots: [],
    poolEntries: [],
    fixtures: [],
    matches: [],
    matchPlayers: [],
    matchEvents: [],
    overrides: [],
    auditEvents: [],
    templates: [],
    formatPresets: [],
    settings: null,
  };
}

export const COLLECTION_LABELS: { readonly [K in keyof BackupData]: { readonly one: string; readonly many: string } } = {
  venues: { one: 'venue', many: 'venues' },
  teams: { one: 'team', many: 'teams' },
  players: { one: 'player', many: 'players' },
  tournaments: { one: 'tournament', many: 'tournaments' },
  tournamentRules: { one: 'tournament rule set', many: 'tournament rule sets' },
  tournamentTeams: { one: 'tournament team entry', many: 'tournament team entries' },
  stages: { one: 'stage', many: 'stages' },
  pools: { one: 'pool', many: 'pools' },
  slots: { one: 'qualification slot', many: 'qualification slots' },
  poolEntries: { one: 'pool entry', many: 'pool entries' },
  fixtures: { one: 'fixture', many: 'fixtures' },
  matches: { one: 'match', many: 'matches' },
  matchPlayers: { one: 'squad entry', many: 'squad entries' },
  matchEvents: { one: 'ball-by-ball event', many: 'ball-by-ball events' },
  overrides: { one: 'organizer override', many: 'organizer overrides' },
  auditEvents: { one: 'history entry', many: 'history entries' },
  templates: { one: 'tournament template', many: 'tournament templates' },
  formatPresets: { one: 'format preset', many: 'format presets' },
  settings: { one: 'settings record', many: 'settings records' },
};

export function countLabel(count: number, key: keyof BackupData): string {
  const label = COLLECTION_LABELS[key];
  return `${count} ${count === 1 ? label.one : label.many}`;
}

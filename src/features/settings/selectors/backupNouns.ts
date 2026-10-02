import type { BackupData, BackupScope, ImportAggregateKind } from '@/domain/types';
import { humanizeKey, type Noun } from './text';

export type BackupCollection = keyof BackupData;

export const COLLECTION_NOUNS: { readonly [K in BackupCollection]: Noun } = {
  tournaments: { one: 'tournament', many: 'tournaments' },
  matches: { one: 'match', many: 'matches' },
  teams: { one: 'team', many: 'teams' },
  players: { one: 'player', many: 'players' },
  venues: { one: 'venue', many: 'venues' },
  fixtures: { one: 'fixture', many: 'fixtures' },
  matchEvents: { one: 'scoring event', many: 'scoring events' },
  templates: { one: 'tournament template', many: 'tournament templates' },
  formatPresets: { one: 'format preset', many: 'format presets' },
  overrides: { one: 'manual override', many: 'manual overrides' },
  auditEvents: { one: 'change history entry', many: 'change history entries' },
  stages: { one: 'stage', many: 'stages' },
  pools: { one: 'pool', many: 'pools' },
  slots: { one: 'qualification slot', many: 'qualification slots' },
  poolEntries: { one: 'pool place', many: 'pool places' },
  tournamentTeams: { one: 'tournament entry', many: 'tournament entries' },
  tournamentRules: { one: 'tournament rule set', many: 'tournament rule sets' },
  matchPlayers: { one: 'squad place', many: 'squad places' },
  settings: { one: 'app settings', many: 'app settings' },
};

export const HEADLINE_COLLECTIONS: readonly BackupCollection[] = [
  'tournaments',
  'matches',
  'teams',
  'players',
  'venues',
  'templates',
  'formatPresets',
];

export const CONTENT_COLLECTIONS: readonly BackupCollection[] = [
  'tournaments',
  'fixtures',
  'matches',
  'matchEvents',
  'teams',
  'players',
  'venues',
  'templates',
  'formatPresets',
  'overrides',
  'auditEvents',
];

export const AGGREGATE_NOUNS: { readonly [K in ImportAggregateKind]: Noun } = {
  tournament: { one: 'Tournament', many: 'Tournaments' },
  match: { one: 'Match', many: 'Matches' },
  team: { one: 'Team', many: 'Teams' },
  player: { one: 'Player', many: 'Players' },
  venue: { one: 'Venue', many: 'Venues' },
  template: { one: 'Template', many: 'Templates' },
  preset: { one: 'Format preset', many: 'Format presets' },
};

const AGGREGATE_TO_COLLECTION: { readonly [K in ImportAggregateKind]: BackupCollection } = {
  tournament: 'tournaments',
  match: 'matches',
  team: 'teams',
  player: 'players',
  venue: 'venues',
  template: 'templates',
  preset: 'formatPresets',
};

function isCollection(key: string): key is BackupCollection {
  return Object.prototype.hasOwnProperty.call(COLLECTION_NOUNS, key);
}

function isAggregate(key: string): key is ImportAggregateKind {
  return Object.prototype.hasOwnProperty.call(AGGREGATE_TO_COLLECTION, key);
}

export function collectionForKey(key: string): BackupCollection | null {
  if (isCollection(key)) {
    return key;
  }
  if (isAggregate(key)) {
    return AGGREGATE_TO_COLLECTION[key];
  }
  return null;
}

export function nounForKey(key: string): Noun {
  const collection = collectionForKey(key);
  if (collection) {
    return COLLECTION_NOUNS[collection];
  }
  const label = humanizeKey(key);
  return { one: label, many: label };
}

export function scopeLabel(scope: BackupScope): string {
  switch (scope.kind) {
    case 'full':
      return 'Full backup';
    case 'tournament':
      return 'Tournament backup';
    case 'match':
      return 'Match backup';
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

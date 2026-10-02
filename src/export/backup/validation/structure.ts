import type { AppSettings, BackupData, Id } from '@/domain/types';
import { BACKUP_COLLECTION_KEYS, COLLECTION_LABELS, type BackupCollectionKey, type BackupCounts } from '../collections';
import type { BackupEntity } from '../remap';
import { isRecord, type Guard } from './guards';
import { errorIssue, warningIssue, type IssueSink } from './issues';
import { auditShape, overrideShape } from './shapes/governance';
import { formatPresetShape, playerShape, settingsShape, teamShape, templateShape, venueShape } from './shapes/library';
import { matchPlayerShape, matchShape } from './shapes/match';
import { matchEventShape } from './shapes/events';
import {
  fixtureShape,
  poolEntryShape,
  poolShape,
  slotShape,
  stageShape,
  tournamentRulesShape,
  tournamentShape,
  tournamentTeamShape,
} from './shapes/tournament';

type RowOf<K extends BackupCollectionKey> = BackupData[K][number];

const SHAPES: { readonly [K in BackupCollectionKey]: Guard<RowOf<K>> } = {
  venues: venueShape,
  teams: teamShape,
  players: playerShape,
  tournaments: tournamentShape,
  tournamentRules: tournamentRulesShape,
  tournamentTeams: tournamentTeamShape,
  stages: stageShape,
  pools: poolShape,
  slots: slotShape,
  poolEntries: poolEntryShape,
  fixtures: fixtureShape,
  matches: matchShape,
  matchPlayers: matchPlayerShape,
  matchEvents: matchEventShape,
  overrides: overrideShape,
  auditEvents: auditShape,
  templates: templateShape,
  formatPresets: formatPresetShape,
};

export interface StructuredBackup {
  readonly data: BackupData;
  readonly counts: BackupCounts;
  readonly knownIds: { readonly [K in BackupEntity]: ReadonlySet<Id> };
  readonly taintedMatchIds: ReadonlySet<Id>;
}

interface Collected<T> {
  readonly rows: readonly T[];
  readonly length: number;
}

function stringField(row: unknown, field: string): string | null {
  if (!isRecord(row)) {
    return null;
  }
  const value = row[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readCollection<K extends BackupCollectionKey>(
  key: K,
  raw: Readonly<Record<string, unknown>>,
  sink: IssueSink,
  onInvalid: (row: unknown) => void,
): Collected<RowOf<K>> {
  const value = raw[key];
  const path = `data.${key}`;
  if (!Array.isArray(value)) {
    sink.add(errorIssue('INVALID_VALUE', `Expected a list of ${COLLECTION_LABELS[key].many}.`, path));
    return { rows: [], length: 0 };
  }
  const guard = SHAPES[key];
  const rows: RowOf<K>[] = [];
  value.forEach((row: unknown, index) => {
    if (guard(row, `${path}[${index}]`, sink)) {
      rows.push(row);
    } else {
      onInvalid(row);
    }
  });
  return { rows, length: value.length };
}

function readSettings(raw: Readonly<Record<string, unknown>>, sink: IssueSink): AppSettings | null {
  const value = raw.settings;
  if (value === undefined || value === null) {
    return null;
  }
  return settingsShape(value, 'data.settings', sink) ? value : null;
}

function collectKnownIds(raw: Readonly<Record<string, unknown>>): { readonly [K in BackupEntity]: ReadonlySet<Id> } {
  const idsOf = (key: BackupCollectionKey, field: string): ReadonlySet<Id> => {
    const value = raw[key];
    const ids = new Set<Id>();
    if (Array.isArray(value)) {
      value.forEach((row: unknown) => {
        const id = stringField(row, field);
        if (id !== null) {
          ids.add(id);
        }
      });
    }
    return ids;
  };
  return {
    venues: idsOf('venues', 'id'),
    teams: idsOf('teams', 'id'),
    players: idsOf('players', 'id'),
    tournaments: idsOf('tournaments', 'id'),
    tournamentRules: idsOf('tournamentRules', 'tournamentId'),
    tournamentTeams: idsOf('tournamentTeams', 'id'),
    stages: idsOf('stages', 'id'),
    pools: idsOf('pools', 'id'),
    slots: idsOf('slots', 'id'),
    poolEntries: idsOf('poolEntries', 'id'),
    fixtures: idsOf('fixtures', 'id'),
    matches: idsOf('matches', 'id'),
    matchPlayers: new Set<Id>(),
    matchEvents: idsOf('matchEvents', 'id'),
    overrides: idsOf('overrides', 'id'),
    auditEvents: idsOf('auditEvents', 'id'),
    templates: idsOf('templates', 'id'),
    formatPresets: idsOf('formatPresets', 'id'),
    settings: new Set<Id>(),
  };
}

function checkCounts(claimed: unknown, counts: BackupCounts, sink: IssueSink): void {
  if (!isRecord(claimed)) {
    sink.add(warningIssue('INVALID_VALUE', 'The file does not say how many records it contains.', 'counts'));
    return;
  }
  (Object.keys(counts) as (keyof BackupCounts)[]).forEach((key) => {
    const said = claimed[key];
    if (said !== counts[key]) {
      const label = COLLECTION_LABELS[key].many;
      sink.add(
        warningIssue(
          'INVALID_VALUE',
          typeof said === 'number' ? `The file says it has ${said} ${label} but contains ${counts[key]}.` : `The file does not say how many ${label} it contains.`,
          `counts.${key}`,
        ),
      );
    }
  });
}

function reportUnknownCollections(raw: Readonly<Record<string, unknown>>, sink: IssueSink): void {
  const known = new Set<string>([...BACKUP_COLLECTION_KEYS, 'settings']);
  Object.keys(raw)
    .filter((key) => !known.has(key))
    .forEach((key) => {
      sink.add(warningIssue('INVALID_VALUE', 'This part of the file is not used by this version of Scorebook and will be ignored.', `data.${key}`));
    });
}

export function readBackupStructure(raw: Readonly<Record<string, unknown>>, claimedCounts: unknown, sink: IssueSink): StructuredBackup {
  const tainted = new Set<Id>();
  const taintBy = (field: string) => (row: unknown) => {
    const id = stringField(row, field);
    if (id !== null) {
      tainted.add(id);
    }
  };
  const ignore = () => undefined;
  const venues = readCollection('venues', raw, sink, ignore);
  const teams = readCollection('teams', raw, sink, ignore);
  const players = readCollection('players', raw, sink, ignore);
  const tournaments = readCollection('tournaments', raw, sink, ignore);
  const tournamentRules = readCollection('tournamentRules', raw, sink, ignore);
  const tournamentTeams = readCollection('tournamentTeams', raw, sink, ignore);
  const stages = readCollection('stages', raw, sink, ignore);
  const pools = readCollection('pools', raw, sink, ignore);
  const slots = readCollection('slots', raw, sink, ignore);
  const poolEntries = readCollection('poolEntries', raw, sink, ignore);
  const fixtures = readCollection('fixtures', raw, sink, ignore);
  const matches = readCollection('matches', raw, sink, taintBy('id'));
  const matchPlayers = readCollection('matchPlayers', raw, sink, taintBy('matchId'));
  const matchEvents = readCollection('matchEvents', raw, sink, taintBy('matchId'));
  const overrides = readCollection('overrides', raw, sink, ignore);
  const auditEvents = readCollection('auditEvents', raw, sink, ignore);
  const templates = readCollection('templates', raw, sink, ignore);
  const formatPresets = readCollection('formatPresets', raw, sink, ignore);
  const settings = readSettings(raw, sink);
  reportUnknownCollections(raw, sink);
  const data: BackupData = {
    venues: venues.rows,
    teams: teams.rows,
    players: players.rows,
    tournaments: tournaments.rows,
    tournamentRules: tournamentRules.rows,
    tournamentTeams: tournamentTeams.rows,
    stages: stages.rows,
    pools: pools.rows,
    slots: slots.rows,
    poolEntries: poolEntries.rows,
    fixtures: fixtures.rows,
    matches: matches.rows,
    matchPlayers: matchPlayers.rows,
    matchEvents: matchEvents.rows,
    overrides: overrides.rows,
    auditEvents: auditEvents.rows,
    templates: templates.rows,
    formatPresets: formatPresets.rows,
    settings,
  };
  const counts: BackupCounts = {
    venues: venues.length,
    teams: teams.length,
    players: players.length,
    tournaments: tournaments.length,
    tournamentRules: tournamentRules.length,
    tournamentTeams: tournamentTeams.length,
    stages: stages.length,
    pools: pools.length,
    slots: slots.length,
    poolEntries: poolEntries.length,
    fixtures: fixtures.length,
    matches: matches.length,
    matchPlayers: matchPlayers.length,
    matchEvents: matchEvents.length,
    overrides: overrides.length,
    auditEvents: auditEvents.length,
    templates: templates.length,
    formatPresets: formatPresets.length,
    settings: raw.settings === undefined || raw.settings === null ? 0 : 1,
  };
  checkCounts(claimedCounts, counts, sink);
  return { data, counts, knownIds: collectKnownIds(raw), taintedMatchIds: tainted };
}

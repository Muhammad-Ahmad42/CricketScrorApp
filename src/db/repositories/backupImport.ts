import type { BackupData, FormatPreset } from '@/domain/types';
import { auditToRecord } from '../mappers/audit';
import { templateToRecord } from '../mappers/config';
import { eventToRecord } from '../mappers/event';
import { playerToRecord, teamToRecord, venueToRecord } from '../mappers/library';
import { matchToRecord, squadEntryToRecord } from '../mappers/match';
import { poolEntryToRecord, poolToRecord, slotToRecord, stageToRecord } from '../mappers/structure';
import { rulesToRecord, tournamentTeamToRecord } from '../mappers/tournament';
import { toJson } from '../mappers/values';
import type { SqlExecutor } from '../types';
import { insertRow, type ConflictClause } from './sql';
import { insertFixtures, insertOverride, stageTournamentId } from './structureWrites';
import { insertTournamentRow } from './tournamentRepository';

export type LibraryConflict = 'keep_local' | 'update_local';

function libraryClause(mode: LibraryConflict): ConflictClause {
  return mode === 'keep_local' ? { kind: 'ignore', target: 'id' } : { kind: 'update', target: 'id', keep: ['created_at'] };
}

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

async function insertPreset(db: SqlExecutor, preset: FormatPreset, mode: LibraryConflict): Promise<void> {
  const conflict =
    mode === 'keep_local'
      ? 'ON CONFLICT(id) DO NOTHING'
      : 'ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, ' +
        'rules_json = excluded.rules_json, updated_at = excluded.updated_at';
  await db.runAsync(
    `INSERT INTO match_format_presets (id, name, description, rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ${NOW_SQL}, ${NOW_SQL}) ${conflict}`,
    [preset.id, preset.label, preset.description, toJson(preset.rules)],
  );
}

async function insertPoolEntriesFromBackup(db: SqlExecutor, data: BackupData): Promise<void> {
  const stageOwners = new Map(data.stages.map((stage) => [stage.id, stage.tournamentId]));
  const positions = new Map<string, number>();
  for (const entry of data.poolEntries) {
    const tournamentId = stageOwners.get(entry.stageId) ?? (await stageTournamentId(db, entry.stageId));
    stageOwners.set(entry.stageId, tournamentId);
    const orderIndex = positions.get(entry.poolId) ?? 0;
    positions.set(entry.poolId, orderIndex + 1);
    await insertRow(db, 'pool_teams', poolEntryToRecord(entry, tournamentId, orderIndex));
  }
}

async function insertLibrary(db: SqlExecutor, data: BackupData, mode: LibraryConflict): Promise<void> {
  const clause = libraryClause(mode);
  for (const venue of data.venues) {
    await insertRow(db, 'venues', venueToRecord(venue), clause);
  }
  for (const team of data.teams) {
    await insertRow(db, 'teams', teamToRecord(team), clause);
  }
  for (const player of data.players) {
    await insertRow(db, 'players', playerToRecord(player), clause);
  }
}

async function insertTournamentAggregates(db: SqlExecutor, data: BackupData): Promise<void> {
  for (const tournament of data.tournaments) {
    await insertTournamentRow(db, tournament);
  }
  for (const rules of data.tournamentRules) {
    await insertRow(db, 'tournament_rules', rulesToRecord(rules.tournamentId, rules));
  }
  for (const membership of data.tournamentTeams) {
    await insertRow(db, 'tournament_teams', tournamentTeamToRecord(membership));
  }
  for (const stage of data.stages) {
    await insertRow(db, 'tournament_stages', stageToRecord(stage));
  }
  for (const pool of data.pools) {
    await insertRow(db, 'pools', poolToRecord(pool));
  }
  for (const slot of data.slots) {
    await insertRow(db, 'stage_slots', slotToRecord(slot));
  }
  await insertPoolEntriesFromBackup(db, data);
  await insertFixtures(db, data.fixtures);
}

async function insertMatchAggregates(db: SqlExecutor, data: BackupData): Promise<void> {
  for (const match of data.matches) {
    await insertRow(db, 'matches', matchToRecord(match));
  }
  for (const row of data.matchPlayers) {
    await insertRow(db, 'match_players', squadEntryToRecord(row.matchId, row.teamId, row));
  }
  for (const event of data.matchEvents) {
    await insertRow(db, 'match_events', eventToRecord(event));
  }
}

export async function importBackupData(db: SqlExecutor, data: BackupData, mode: LibraryConflict): Promise<void> {
  await insertLibrary(db, data, mode);
  await insertTournamentAggregates(db, data);
  await insertMatchAggregates(db, data);
  for (const override of data.overrides) {
    await insertOverride(db, override);
  }
  for (const event of data.auditEvents) {
    await insertRow(db, 'audit_events', auditToRecord(event));
  }
  for (const template of data.templates) {
    await insertRow(db, 'tournament_templates', templateToRecord(template), libraryClause(mode));
  }
  for (const preset of data.formatPresets) {
    await insertPreset(db, preset, mode);
  }
}

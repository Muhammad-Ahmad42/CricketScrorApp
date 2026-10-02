import type { BackupData, BackupScope, Fixture, Tournament } from '@/domain/types';
import { AUDIT_COLUMNS, auditFromRow, type AuditRow } from '../mappers/audit';
import {
  PRESET_COLUMNS,
  TEMPLATE_COLUMNS,
  completeSettings,
  presetFromRow,
  settingsFromRows,
  templateFromRow,
  type PresetRow,
  type TemplateRow,
} from '../mappers/config';
import { EVENT_COLUMNS, eventFromRow, type EventRow } from '../mappers/event';
import {
  PLAYER_COLUMNS,
  TEAM_COLUMNS,
  VENUE_COLUMNS,
  playerFromRow,
  teamFromRow,
  venueFromRow,
  type PlayerRow,
  type TeamRow,
  type VenueRow,
} from '../mappers/library';
import { matchColumns, matchFromRow, squadRowFromRow, type MatchPlayerRow, type MatchRow } from '../mappers/match';
import { overrideFromRow, type OverrideRow } from '../mappers/override';
import {
  FIXTURE_COLUMNS,
  POOL_COLUMNS,
  POOL_ENTRY_COLUMNS,
  SLOT_COLUMNS,
  STAGE_COLUMNS,
  fixtureFromRow,
  poolEntryFromRow,
  poolFromRow,
  slotFromRow,
  stageFromRow,
  type FixtureWithSidesRow,
  type PoolEntryRow,
  type PoolRow,
  type SlotRow,
  type StageRow,
} from '../mappers/structure';
import {
  TOURNAMENT_COLUMNS,
  TOURNAMENT_RULES_COLUMNS,
  TOURNAMENT_TEAM_COLUMNS,
  rulesFromRow,
  tournamentFromRow,
  tournamentTeamFromRow,
  type TournamentRow,
  type TournamentRulesRow,
  type TournamentTeamRow,
} from '../mappers/tournament';
import type { SqlExecutor } from '../types';
import { scopeFilters, type RowFilter } from './backupScope';
import { readVenueIds } from './tournamentReads';

function select<T>(db: SqlExecutor, columns: string, table: string, filter: RowFilter, order: string): Promise<T[]> {
  return db.getAllAsync<T>(`SELECT ${columns} FROM ${table} WHERE ${filter.where} ORDER BY ${order}`, filter.params);
}

async function exportTournaments(db: SqlExecutor, filter: RowFilter): Promise<Tournament[]> {
  const rows = await select<TournamentRow>(db, TOURNAMENT_COLUMNS, 'tournaments', filter, 'rowid');
  const tournaments: Tournament[] = [];
  for (const row of rows) {
    tournaments.push(tournamentFromRow(row, await readVenueIds(db, row.id)));
  }
  return tournaments;
}

function fixtureForBackup(row: FixtureWithSidesRow): Fixture {
  return { ...fixtureFromRow(row), matchSides: null };
}

async function exportFixtures(db: SqlExecutor, filter: RowFilter): Promise<Fixture[]> {
  const columns = `${FIXTURE_COLUMNS.join(', ')}, NULL AS match_team_a_id, NULL AS match_team_b_id`;
  const rows = await select<FixtureWithSidesRow>(db, columns, 'fixtures', filter, 'rowid');
  return rows.map(fixtureForBackup);
}

export async function exportBackupData(db: SqlExecutor, scope: BackupScope): Promise<BackupData> {
  const f = await scopeFilters(db, scope);
  const settingsRows = f.includeSettings
    ? await db.getAllAsync<{ readonly key: string; readonly value_json: string }>('SELECT key, value_json FROM app_settings')
    : [];
  return {
    venues: (await select<VenueRow>(db, VENUE_COLUMNS, 'venues', f.venues, 'rowid')).map(venueFromRow),
    teams: (await select<TeamRow>(db, TEAM_COLUMNS, 'teams', f.teams, 'rowid')).map(teamFromRow),
    players: (await select<PlayerRow>(db, PLAYER_COLUMNS, 'players', f.players, 'rowid')).map(playerFromRow),
    tournaments: await exportTournaments(db, f.tournaments),
    tournamentRules: (
      await select<TournamentRulesRow>(db, TOURNAMENT_RULES_COLUMNS, 'tournament_rules', f.tournamentChildren, 'rowid')
    ).map(rulesFromRow),
    tournamentTeams: (
      await select<TournamentTeamRow>(db, TOURNAMENT_TEAM_COLUMNS, 'tournament_teams', f.tournamentChildren, 'rowid')
    ).map(tournamentTeamFromRow),
    stages: (await select<StageRow>(db, STAGE_COLUMNS, 'tournament_stages', f.tournamentChildren, 'rowid')).map(stageFromRow),
    pools: (await select<PoolRow>(db, POOL_COLUMNS, 'pools', f.stageChildren, 'rowid')).map(poolFromRow),
    slots: (await select<SlotRow>(db, SLOT_COLUMNS, 'stage_slots', f.stageChildren, 'rowid')).map(slotFromRow),
    poolEntries: (
      await select<PoolEntryRow>(db, POOL_ENTRY_COLUMNS, 'pool_teams', f.tournamentChildren, 'pool_id, order_index, rowid')
    ).map(poolEntryFromRow),
    fixtures: await exportFixtures(db, f.tournamentChildren),
    matches: (await select<MatchRow>(db, matchColumns('matches'), 'matches', f.matches, 'rowid')).map(matchFromRow),
    matchPlayers: (
      await select<MatchPlayerRow>(
        db,
        'match_id, player_id, team_id, batting_order, is_captain, is_wicket_keeper, is_substitute',
        'match_players',
        f.matchChildren,
        'match_id, team_id, batting_order IS NULL, batting_order, player_id',
      )
    ).map(squadRowFromRow),
    matchEvents: (await select<EventRow>(db, EVENT_COLUMNS, 'match_events', f.matchChildren, 'match_id, seq')).map(eventFromRow),
    overrides: (
      await select<OverrideRow>(db, 'payload_json, revoked_at, revoke_reason', 'tournament_overrides', f.tournamentChildren, 'rowid')
    ).map(overrideFromRow),
    auditEvents: (await select<AuditRow>(db, AUDIT_COLUMNS, 'audit_events', f.auditEvents, 'rowid')).map(auditFromRow),
    templates: (await select<TemplateRow>(db, TEMPLATE_COLUMNS, 'tournament_templates', f.configuration, 'rowid')).map(
      templateFromRow,
    ),
    formatPresets: (await select<PresetRow>(db, PRESET_COLUMNS, 'match_format_presets', f.configuration, 'rowid')).map(
      presetFromRow,
    ),
    settings: f.includeSettings ? completeSettings(settingsFromRows(settingsRows)) : null,
  };
}

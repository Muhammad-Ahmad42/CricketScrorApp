import {
  PLAYER_COLUMNS,
  TEAM_COLUMNS,
  VENUE_COLUMNS,
  playerFromRow,
  playerToRecord,
  teamFromRow,
  teamToRecord,
  venueFromRow,
  venueToRecord,
  type PlayerRow,
  type TeamRow,
  type VenueRow,
} from '../mappers/library';
import type { SqlExecutor } from '../types';
import type { PlayerRepository, TeamRepository, VenueRepository } from './contracts';
import { textMatcher } from './search';
import { IN_JSON_LIST, execute, insertRow, jsonList, updateStatement, withoutColumns } from './sql';

const IMMUTABLE = ['id', 'created_at'] as const;

export function createTeamRepository(db: SqlExecutor): TeamRepository {
  return {
    async list(opts = {}) {
      const clause = opts.includeArchived ? '' : 'WHERE archived_at IS NULL';
      const rows = await db.getAllAsync<TeamRow>(`SELECT ${TEAM_COLUMNS} FROM teams ${clause} ORDER BY name COLLATE NOCASE, id`);
      const matcher = textMatcher(opts.search);
      const found = matcher === null ? rows : rows.filter((row) => matcher([row.name, row.short_name]));
      return found.map(teamFromRow);
    },
    async get(id) {
      const row = await db.getFirstAsync<TeamRow>(`SELECT ${TEAM_COLUMNS} FROM teams WHERE id = ?`, [id]);
      return row === null ? null : teamFromRow(row);
    },
    async insert(team) {
      await insertRow(db, 'teams', teamToRecord(team));
    },
    async update(team) {
      await execute(db, updateStatement('teams', withoutColumns(teamToRecord(team), IMMUTABLE), 'id = ?', [team.id]));
    },
    async delete(id) {
      await db.runAsync('DELETE FROM teams WHERE id = ?', [id]);
    },
  };
}

export function createPlayerRepository(db: SqlExecutor): PlayerRepository {
  return {
    async listByTeam(teamId, opts = {}) {
      const archived = opts.includeArchived ? '' : 'AND archived_at IS NULL';
      const rows = await db.getAllAsync<PlayerRow>(
        `SELECT ${PLAYER_COLUMNS} FROM players WHERE team_id = ? ${archived} ORDER BY created_at, rowid`,
        [teamId],
      );
      return rows.map(playerFromRow);
    },
    async countActiveByTeam() {
      const rows = await db.getAllAsync<{ readonly team_id: string; readonly n: number }>(
        'SELECT team_id, count(*) AS n FROM players WHERE archived_at IS NULL GROUP BY team_id',
      );
      return Object.fromEntries(rows.map((row) => [row.team_id, Number(row.n)]));
    },
    async getMany(ids) {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db.getAllAsync<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id ${IN_JSON_LIST}`, [
        jsonList(ids),
      ]);
      const byId = new Map(rows.map((row) => [row.id, playerFromRow(row)]));
      return ids.flatMap((id) => {
        const player = byId.get(id);
        return player === undefined ? [] : [player];
      });
    },
    async insert(player) {
      await insertRow(db, 'players', playerToRecord(player));
    },
    async update(player) {
      await execute(db, updateStatement('players', withoutColumns(playerToRecord(player), IMMUTABLE), 'id = ?', [player.id]));
    },
    async delete(id) {
      await db.runAsync('DELETE FROM players WHERE id = ?', [id]);
    },
  };
}

export function createVenueRepository(db: SqlExecutor): VenueRepository {
  return {
    async list(opts = {}) {
      const archived = opts.includeArchived ? '' : 'WHERE archived_at IS NULL';
      const rows = await db.getAllAsync<VenueRow>(
        `SELECT ${VENUE_COLUMNS} FROM venues ${archived} ORDER BY name COLLATE NOCASE, id`,
      );
      return rows.map(venueFromRow);
    },
    async get(id) {
      const row = await db.getFirstAsync<VenueRow>(`SELECT ${VENUE_COLUMNS} FROM venues WHERE id = ?`, [id]);
      return row === null ? null : venueFromRow(row);
    },
    async insert(venue) {
      await insertRow(db, 'venues', venueToRecord(venue));
    },
    async update(venue) {
      await execute(db, updateStatement('venues', withoutColumns(venueToRecord(venue), IMMUTABLE), 'id = ?', [venue.id]));
    },
    async archive(id, at) {
      await db.runAsync('UPDATE venues SET archived_at = ?, updated_at = ? WHERE id = ?', [at, at, id]);
    },
    async delete(id) {
      await db.runAsync('DELETE FROM venues WHERE id = ?', [id]);
    },
  };
}

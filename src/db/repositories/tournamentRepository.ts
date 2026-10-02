import type { Tournament } from '@/domain/types';
import { NotFoundError } from '../errors';
import { rulesToRecord, tournamentInfoRecord, tournamentToRecord } from '../mappers/tournament';
import type { SqlExecutor } from '../types';
import type { TournamentRepository } from './contracts';
import { applyPlanRows, updateTournamentRules } from './planRows';
import { execute, insertRow, updateStatement } from './sql';
import {
  deleteById,
  insertFixtures,
  insertOverride,
  replacePoolEntries,
  revokeOverride,
  updateFixture,
  upsertPools,
  upsertSlots,
  upsertStages,
  upsertTournamentTeams,
} from './structureWrites';
import { listTournaments, readSnapshot } from './tournamentReads';

async function insertVenueLinks(db: SqlExecutor, tournament: Tournament): Promise<void> {
  for (const [orderIndex, venueId] of tournament.venueIds.entries()) {
    await insertRow(db, 'tournament_venues', { tournament_id: tournament.id, venue_id: venueId, order_index: orderIndex });
  }
}

async function replaceVenueLinks(db: SqlExecutor, tournament: Tournament): Promise<void> {
  await db.runAsync('DELETE FROM tournament_venues WHERE tournament_id = ?', [tournament.id]);
  await insertVenueLinks(db, tournament);
}

export async function insertTournamentRow(db: SqlExecutor, tournament: Tournament): Promise<void> {
  await insertRow(db, 'tournaments', tournamentToRecord(tournament));
  await insertVenueLinks(db, tournament);
}

interface FootprintRow {
  readonly matches: number;
  readonly completed: number;
  readonly events: number;
}

export function createTournamentRepository(db: SqlExecutor): TournamentRepository {
  return {
    list(opts = {}) {
      return listTournaments(db, opts);
    },
    getSnapshot(id, projectionVersion) {
      return readSnapshot(db, id, projectionVersion);
    },
    async insert(tournament, rules) {
      await insertTournamentRow(db, tournament);
      await insertRow(db, 'tournament_rules', rulesToRecord(tournament.id, rules));
    },
    async update(tournament) {
      const result = await execute(db, updateStatement('tournaments', tournamentInfoRecord(tournament), 'id = ?', [tournament.id]));
      if (result.changes === 0) {
        throw new NotFoundError('tournament', tournament.id);
      }
      await replaceVenueLinks(db, tournament);
    },
    updateRules(rules) {
      return updateTournamentRules(db, rules);
    },
    async bumpRevision(id) {
      const result = await db.runAsync('UPDATE tournaments SET revision = revision + 1 WHERE id = ?', [id]);
      if (result.changes === 0) {
        throw new NotFoundError('tournament', id);
      }
      const row = await db.getFirstAsync<{ readonly revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [id]);
      return row?.revision ?? 0;
    },
    async writeChampion(id, teamIds) {
      const result = await db.runAsync('UPDATE tournaments SET champion_json = ? WHERE id = ?', [
        teamIds === null ? null : JSON.stringify(teamIds),
        id,
      ]);
      if (result.changes === 0) {
        throw new NotFoundError('tournament', id);
      }
    },
    async deletionFootprint(id) {
      const row = await db.getFirstAsync<FootprintRow>(
        "SELECT count(*) AS matches, coalesce(sum(status IN ('completed', 'abandoned')), 0) AS completed, " +
          '(SELECT count(*) FROM match_events e JOIN matches mm ON mm.id = e.match_id WHERE mm.tournament_id = ?) AS events ' +
          'FROM matches WHERE tournament_id = ?',
        [id, id],
      );
      return { matches: row?.matches ?? 0, completedMatches: row?.completed ?? 0, events: row?.events ?? 0 };
    },
    async listMatchIds(id) {
      const rows = await db.getAllAsync<{ readonly id: string }>(
        'SELECT id FROM matches WHERE tournament_id = ? ORDER BY created_at, rowid',
        [id],
      );
      return rows.map((row) => row.id);
    },
    async delete(id) {
      await deleteById(db, 'tournaments', id);
    },
    applyPlanRows(tournamentId, plan, at) {
      return applyPlanRows(db, tournamentId, plan, at);
    },
    upsertTournamentTeams(rows) {
      return upsertTournamentTeams(db, rows);
    },
    deleteTournamentTeam(id) {
      return deleteById(db, 'tournament_teams', id);
    },
    upsertStages(stages) {
      return upsertStages(db, stages);
    },
    deleteStage(id) {
      return deleteById(db, 'tournament_stages', id);
    },
    upsertPools(pools) {
      return upsertPools(db, pools);
    },
    deletePool(id) {
      return deleteById(db, 'pools', id);
    },
    replacePoolEntries(stageId, entries) {
      return replacePoolEntries(db, stageId, entries);
    },
    upsertSlots(slots) {
      return upsertSlots(db, slots);
    },
    deleteSlot(id) {
      return deleteById(db, 'stage_slots', id);
    },
    insertFixtures(fixtures) {
      return insertFixtures(db, fixtures);
    },
    updateFixture(fixture) {
      return updateFixture(db, fixture);
    },
    deleteFixture(id) {
      return deleteById(db, 'fixtures', id);
    },
    insertOverride(override) {
      return insertOverride(db, override);
    },
    revokeOverride(id, at, reason) {
      return revokeOverride(db, id, at, reason);
    },
  };
}

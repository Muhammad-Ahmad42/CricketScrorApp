import type { Fixture, Pool, PoolEntry, Stage, StageSlot, TournamentOverride, TournamentTeam } from '@/domain/types';
import { InvalidRowsError, NotFoundError } from '../errors';
import { INSERT_OVERRIDE_SQL, overrideInsertParams } from '../mappers/override';
import {
  fixtureMutableRecord,
  fixtureToRecord,
  poolEntryToRecord,
  poolToRecord,
  slotToRecord,
  stageToRecord,
} from '../mappers/structure';
import { tournamentTeamToRecord } from '../mappers/tournament';
import type { SqlRecord } from '../mappers/values';
import type { SqlExecutor } from '../types';
import { IN_JSON_LIST, execute, insertRow, jsonList, updateStatement } from './sql';

export const INDEX_SHIFT = 1_000_000;

interface TwoPhaseSpec {
  readonly table: string;
  readonly indexColumn: string;
  readonly parking: string;
  readonly keep: readonly string[];
}

async function twoPhaseUpsert(db: SqlExecutor, spec: TwoPhaseSpec, ids: readonly string[], records: readonly SqlRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }
  await db.runAsync(
    `UPDATE ${spec.table} SET ${spec.indexColumn} = ${spec.indexColumn} + ${INDEX_SHIFT}${spec.parking} WHERE id ${IN_JSON_LIST}`,
    [jsonList(ids)],
  );
  for (const record of records) {
    await insertRow(db, spec.table, record, { kind: 'update', target: 'id', keep: spec.keep });
  }
}

const STAGE_SPEC: TwoPhaseSpec = {
  table: 'tournament_stages',
  indexColumn: 'order_index',
  parking: '',
  keep: ['tournament_id', 'created_at'],
};

const POOL_SPEC: TwoPhaseSpec = {
  table: 'pools',
  indexColumn: 'order_index',
  parking: ", name = 'parked ' || id",
  keep: ['stage_id'],
};

const SLOT_SPEC: TwoPhaseSpec = {
  table: 'stage_slots',
  indexColumn: 'slot_index',
  parking: '',
  keep: ['stage_id'],
};

export async function upsertTournamentTeams(db: SqlExecutor, rows: readonly TournamentTeam[]): Promise<void> {
  for (const row of rows) {
    await insertRow(db, 'tournament_teams', tournamentTeamToRecord(row), {
      kind: 'update',
      target: 'id',
      keep: ['tournament_id', 'team_id', 'joined_at'],
    });
  }
}

export function upsertStages(db: SqlExecutor, stages: readonly Stage[]): Promise<void> {
  return twoPhaseUpsert(
    db,
    STAGE_SPEC,
    stages.map((stage) => stage.id),
    stages.map(stageToRecord),
  );
}

export function upsertPools(db: SqlExecutor, pools: readonly Pool[]): Promise<void> {
  return twoPhaseUpsert(
    db,
    POOL_SPEC,
    pools.map((pool) => pool.id),
    pools.map(poolToRecord),
  );
}

export function upsertSlots(db: SqlExecutor, slots: readonly StageSlot[]): Promise<void> {
  return twoPhaseUpsert(
    db,
    SLOT_SPEC,
    slots.map((slot) => slot.id),
    slots.map(slotToRecord),
  );
}

export async function stageTournamentId(db: SqlExecutor, stageId: string): Promise<string> {
  const row = await db.getFirstAsync<{ readonly tournament_id: string }>(
    'SELECT tournament_id FROM tournament_stages WHERE id = ?',
    [stageId],
  );
  if (row === null) {
    throw new NotFoundError('stage', stageId);
  }
  return row.tournament_id;
}

export async function insertPoolEntries(db: SqlExecutor, tournamentId: string, entries: readonly PoolEntry[]): Promise<void> {
  const positions = new Map<string, number>();
  for (const entry of entries) {
    const orderIndex = positions.get(entry.poolId) ?? 0;
    positions.set(entry.poolId, orderIndex + 1);
    await insertRow(db, 'pool_teams', poolEntryToRecord(entry, tournamentId, orderIndex));
  }
}

export async function replacePoolEntries(db: SqlExecutor, stageId: string, entries: readonly PoolEntry[]): Promise<void> {
  const foreign = entries.find((entry) => entry.stageId !== stageId);
  if (foreign !== undefined) {
    throw new InvalidRowsError(`Pool entry ${foreign.id} belongs to stage ${foreign.stageId}, not ${stageId}.`);
  }
  const tournamentId = await stageTournamentId(db, stageId);
  await db.runAsync('DELETE FROM pool_teams WHERE stage_id = ?', [stageId]);
  await insertPoolEntries(db, tournamentId, entries);
}

export async function insertFixtures(db: SqlExecutor, fixtures: readonly Fixture[]): Promise<void> {
  for (const fixture of fixtures) {
    await insertRow(db, 'fixtures', fixtureToRecord(fixture));
  }
}

export async function updateFixture(db: SqlExecutor, fixture: Fixture): Promise<void> {
  const result = await execute(db, updateStatement('fixtures', fixtureMutableRecord(fixture), 'id = ?', [fixture.id]));
  if (result.changes === 0) {
    throw new NotFoundError('fixture', fixture.id);
  }
}

export async function insertOverride(db: SqlExecutor, override: TournamentOverride): Promise<void> {
  await db.runAsync(INSERT_OVERRIDE_SQL, overrideInsertParams(override));
}

export async function revokeOverride(db: SqlExecutor, id: string, at: string, reason: string | null): Promise<void> {
  const result = await db.runAsync('UPDATE tournament_overrides SET revoked_at = ?, revoke_reason = ? WHERE id = ?', [
    at,
    reason,
    id,
  ]);
  if (result.changes === 0) {
    throw new NotFoundError('override', id);
  }
}

export async function deleteById(db: SqlExecutor, table: string, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

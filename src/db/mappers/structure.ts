import type {
  BracketPosition,
  Fixture,
  FixtureSide,
  FixtureStatus,
  MatchRules,
  Pool,
  PoolEntry,
  SlotSource,
  Stage,
  StageConfig,
  StageSlot,
  StageStatus,
  StageType,
} from '@/domain/types';
import { InvalidRowsError } from '../errors';
import { fromFlag, parseJson, parseJsonOrNull, toFlag, toJson, toJsonOrNull, type SqlRecord } from './values';

export interface StageRow {
  readonly id: string;
  readonly tournament_id: string;
  readonly name: string;
  readonly type: StageType;
  readonly order_index: number;
  readonly status: StageStatus;
  readonly config_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export const STAGE_COLUMNS = 'id, tournament_id, name, type, order_index, status, config_json, created_at, updated_at';

export function stageFromRow(row: StageRow): Stage {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    type: row.type,
    orderIndex: row.order_index,
    status: row.status,
    config: parseJson<StageConfig>(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function stageToRecord(stage: Stage): SqlRecord {
  return {
    id: stage.id,
    tournament_id: stage.tournamentId,
    name: stage.name,
    type: stage.type,
    order_index: stage.orderIndex,
    status: stage.status,
    config_json: toJson(stage.config),
    created_at: stage.createdAt,
    updated_at: stage.updatedAt,
  };
}

export interface PoolRow {
  readonly id: string;
  readonly stage_id: string;
  readonly name: string;
  readonly order_index: number;
  readonly legs: number | null;
}

export const POOL_COLUMNS = 'id, stage_id, name, order_index, legs';

export function poolFromRow(row: PoolRow): Pool {
  return { id: row.id, stageId: row.stage_id, name: row.name, orderIndex: row.order_index, legs: row.legs };
}

export function poolToRecord(pool: Pool): SqlRecord {
  return { id: pool.id, stage_id: pool.stageId, name: pool.name, order_index: pool.orderIndex, legs: pool.legs };
}

export interface SlotRow {
  readonly id: string;
  readonly stage_id: string;
  readonly slot_index: number;
  readonly role: StageSlot['role'];
  readonly label: string;
  readonly seed: number | null;
  readonly source_json: string;
}

export const SLOT_COLUMNS = 'id, stage_id, slot_index, role, label, seed, source_json';

export function slotFromRow(row: SlotRow): StageSlot {
  return {
    id: row.id,
    stageId: row.stage_id,
    index: row.slot_index,
    role: row.role,
    label: row.label,
    source: parseJson<SlotSource>(row.source_json),
    seed: row.seed,
  };
}

export function slotToRecord(slot: StageSlot): SqlRecord {
  return {
    id: slot.id,
    stage_id: slot.stageId,
    slot_index: slot.index,
    role: slot.role,
    label: slot.label,
    seed: slot.seed,
    source_kind: slot.source.kind,
    source_json: toJson(slot.source),
  };
}

function sideFromColumns(teamId: string | null, slotId: string | null, column: string): FixtureSide {
  if (teamId !== null) {
    return { kind: 'team', teamId };
  }
  if (slotId !== null) {
    return { kind: 'slot', slotId };
  }
  throw new InvalidRowsError(`${column} has neither a team nor a slot.`);
}

function sideColumns(side: FixtureSide): { readonly team: string | null; readonly slot: string | null } {
  return side.kind === 'team' ? { team: side.teamId, slot: null } : { team: null, slot: side.slotId };
}

export interface PoolEntryRow {
  readonly id: string;
  readonly pool_id: string;
  readonly stage_id: string;
  readonly team_id: string | null;
  readonly slot_id: string | null;
  readonly seed: number | null;
}

export const POOL_ENTRY_COLUMNS = 'id, pool_id, stage_id, team_id, slot_id, seed';

export function poolEntryFromRow(row: PoolEntryRow): PoolEntry {
  return {
    id: row.id,
    poolId: row.pool_id,
    stageId: row.stage_id,
    side: sideFromColumns(row.team_id, row.slot_id, 'pool_teams'),
    seed: row.seed,
  };
}

export function poolEntryToRecord(entry: PoolEntry, tournamentId: string, orderIndex: number): SqlRecord {
  const side = sideColumns(entry.side);
  return {
    id: entry.id,
    pool_id: entry.poolId,
    stage_id: entry.stageId,
    tournament_id: tournamentId,
    team_id: side.team,
    slot_id: side.slot,
    seed: entry.seed,
    order_index: orderIndex,
  };
}

export interface FixtureRow {
  readonly id: string;
  readonly tournament_id: string;
  readonly stage_id: string;
  readonly pool_id: string | null;
  readonly match_number: number;
  readonly label: string | null;
  readonly round: number | null;
  readonly leg: number | null;
  readonly bracket_kind: BracketPosition['kind'] | null;
  readonly bracket_round: number | null;
  readonly bracket_position: number | null;
  readonly bracket_round_name: string | null;
  readonly is_final: number;
  readonly side_a_team_id: string | null;
  readonly side_a_slot_id: string | null;
  readonly side_b_team_id: string | null;
  readonly side_b_slot_id: string | null;
  readonly scheduled_date: string | null;
  readonly scheduled_time: string | null;
  readonly venue_id: string | null;
  readonly status: FixtureStatus;
  readonly match_id: string | null;
  readonly format_id: string | null;
  readonly match_rules_json: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FixtureWithSidesRow extends FixtureRow {
  readonly match_team_a_id: string | null;
  readonly match_team_b_id: string | null;
}

export const FIXTURE_COLUMNS = [
  'id',
  'tournament_id',
  'stage_id',
  'pool_id',
  'match_number',
  'label',
  'round',
  'leg',
  'bracket_kind',
  'bracket_round',
  'bracket_position',
  'bracket_round_name',
  'is_final',
  'side_a_team_id',
  'side_a_slot_id',
  'side_b_team_id',
  'side_b_slot_id',
  'scheduled_date',
  'scheduled_time',
  'venue_id',
  'status',
  'match_id',
  'format_id',
  'match_rules_json',
  'notes',
  'created_at',
  'updated_at',
] as const;

export function fixtureColumns(alias: string): string {
  return FIXTURE_COLUMNS.map((column) => `${alias}.${column}`).join(', ');
}

function bracketFromRow(row: FixtureRow): BracketPosition | null {
  if (row.bracket_kind === null || row.bracket_round === null || row.bracket_position === null) {
    return null;
  }
  return {
    kind: row.bracket_kind,
    round: row.bracket_round,
    position: row.bracket_position,
    roundName: row.bracket_round_name ?? '',
  };
}

function matchSidesFromRow(row: FixtureWithSidesRow): Fixture['matchSides'] {
  if (row.match_team_a_id === null || row.match_team_b_id === null) {
    return null;
  }
  return { teamAId: row.match_team_a_id, teamBId: row.match_team_b_id };
}

export function fixtureFromRow(row: FixtureWithSidesRow): Fixture {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    stageId: row.stage_id,
    poolId: row.pool_id,
    matchNumber: row.match_number,
    label: row.label,
    round: row.round,
    leg: row.leg,
    bracket: bracketFromRow(row),
    isFinal: fromFlag(row.is_final),
    sideA: sideFromColumns(row.side_a_team_id, row.side_a_slot_id, 'fixtures.side_a'),
    sideB: sideFromColumns(row.side_b_team_id, row.side_b_slot_id, 'fixtures.side_b'),
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    venueId: row.venue_id,
    status: row.status,
    matchId: row.match_id,
    matchSides: matchSidesFromRow(row),
    formatId: row.format_id,
    matchRules: parseJsonOrNull<MatchRules>(row.match_rules_json),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fixtureMutableRecord(fixture: Fixture): SqlRecord {
  const sideA = sideColumns(fixture.sideA);
  const sideB = sideColumns(fixture.sideB);
  return {
    stage_id: fixture.stageId,
    pool_id: fixture.poolId,
    match_number: fixture.matchNumber,
    label: fixture.label,
    round: fixture.round,
    leg: fixture.leg,
    bracket_kind: fixture.bracket?.kind ?? null,
    bracket_round: fixture.bracket?.round ?? null,
    bracket_position: fixture.bracket?.position ?? null,
    bracket_round_name: fixture.bracket?.roundName ?? null,
    is_final: toFlag(fixture.isFinal),
    side_a_team_id: sideA.team,
    side_a_slot_id: sideA.slot,
    side_b_team_id: sideB.team,
    side_b_slot_id: sideB.slot,
    scheduled_date: fixture.scheduledDate,
    scheduled_time: fixture.scheduledTime,
    venue_id: fixture.venueId,
    status: fixture.status,
    match_id: fixture.matchId,
    format_id: fixture.formatId,
    match_rules_json: toJsonOrNull(fixture.matchRules),
    notes: fixture.notes,
    updated_at: fixture.updatedAt,
  };
}

export function fixtureToRecord(fixture: Fixture): SqlRecord {
  return {
    id: fixture.id,
    tournament_id: fixture.tournamentId,
    ...fixtureMutableRecord(fixture),
    created_at: fixture.createdAt,
  };
}

import type { ChangePlan, Fixture, FixtureDraft, TournamentRules } from '@/domain/types';
import { InvalidRowsError, NotFoundError } from '../errors';
import { rulesToRecord } from '../mappers/tournament';
import type { SqlExecutor } from '../types';
import { execute, updateStatement, withoutColumns } from './sql';
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

export async function updateTournamentRules(db: SqlExecutor, rules: TournamentRules): Promise<void> {
  const record = withoutColumns(rulesToRecord(rules.tournamentId, rules), ['tournament_id']);
  const result = await execute(db, updateStatement('tournament_rules', record, 'tournament_id = ?', [rules.tournamentId]));
  if (result.changes === 0) {
    throw new NotFoundError('tournament rules', rules.tournamentId);
  }
}

function fixtureFromDraft(draft: FixtureDraft, at: string): Fixture {
  return { ...draft, matchId: null, matchSides: null, createdAt: at, updatedAt: at };
}

function assertOwnedBy(tournamentId: string, plan: ChangePlan): void {
  const owners = [
    ...plan.tournamentTeams.upsert.map((row) => ({ what: `tournament team ${row.id}`, owner: row.tournamentId })),
    ...plan.stages.upsert.map((row) => ({ what: `stage ${row.id}`, owner: row.tournamentId })),
    ...plan.fixtures.insert.map((row) => ({ what: `fixture ${row.id}`, owner: row.tournamentId })),
    ...plan.fixtures.update.map((row) => ({ what: `fixture ${row.id}`, owner: row.tournamentId })),
    ...plan.overrides.insert.map((row) => ({ what: `override ${row.id}`, owner: row.tournamentId })),
    ...(plan.rules === null ? [] : [{ what: 'rules', owner: plan.rules.tournamentId }]),
  ];
  const foreign = owners.find((entry) => entry.owner !== tournamentId);
  if (foreign !== undefined) {
    throw new InvalidRowsError(`The change plan for tournament ${tournamentId} contains ${foreign.what} of ${foreign.owner}.`);
  }
}

export async function applyPlanRows(db: SqlExecutor, tournamentId: string, plan: ChangePlan, at: string): Promise<void> {
  assertOwnedBy(tournamentId, plan);
  await upsertTournamentTeams(db, plan.tournamentTeams.upsert);
  if (plan.rules !== null) {
    await updateTournamentRules(db, plan.rules);
  }
  for (const id of plan.stages.delete) {
    await deleteById(db, 'tournament_stages', id);
  }
  await upsertStages(db, plan.stages.upsert);
  for (const id of plan.pools.delete) {
    await deleteById(db, 'pools', id);
  }
  await upsertPools(db, plan.pools.upsert);
  for (const id of plan.slots.delete) {
    await deleteById(db, 'stage_slots', id);
  }
  await upsertSlots(db, plan.slots.upsert);
  for (const group of plan.poolEntries) {
    await replacePoolEntries(db, group.stageId, group.entries);
  }
  for (const id of plan.fixtures.delete) {
    await deleteById(db, 'fixtures', id);
  }
  for (const fixture of plan.fixtures.update) {
    await updateFixture(db, fixture);
  }
  await insertFixtures(
    db,
    plan.fixtures.insert.map((draft) => fixtureFromDraft(draft, at)),
  );
  for (const override of plan.overrides.insert) {
    await insertOverride(db, override);
  }
  for (const revocation of plan.overrides.revoke) {
    await revokeOverride(db, revocation.overrideId, revocation.at, revocation.reason);
  }
}

/** @jest-environment node */
import type { Fixture, Stage, StageSlot, TournamentOverride, TournamentTeam } from '@/domain/types';
import { NotFoundError, InvalidRowsError, sqliteErrorKind } from '../errors';
import { runMigrations } from '../migrate';
import { createRepositories } from '../repositories';
import type { Repositories } from '../repositories/contracts';
import { buildMatch, buildTeamSeed, buildTournament, buildTournamentRules, buildVenue, isoAt, squadsFor } from '../testing/builders';
import { createFaultInjectingDatabase } from '../testing/faultInjectingDatabase';
import { countRows, openTestRepositories } from '../testing/harness';
import {
  buildFixture,
  buildMembership,
  buildPointsOverride,
  buildPool,
  buildPoolEntry,
  buildSlot,
  buildStage,
  seedBareTournament,
  slotSide,
  teamSide,
} from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario, stageConfig, type TournamentScenario } from '../testing/tournamentScenario';
import type { SqlDatabase } from '../types';

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
const eagles = buildTeamSeed('eag', 'Eagles', 'EAG');
const hawks = buildTeamSeed('haw', 'Hawks', 'HAW');

interface Context {
  readonly db: SqlDatabase;
  readonly repos: Repositories;
}

async function withScenario(): Promise<Context & { readonly scenario: TournamentScenario }> {
  const { db, repos } = await openTestRepositories();
  const scenario = buildTournamentScenario('cup', 1);
  await seedTournamentScenario(db, scenario);
  return { db, repos, scenario };
}

async function withLibrary(): Promise<Context> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, [lions, tigers, eagles, hawks], [buildVenue('v1', 'Gaddafi Stadium'), buildVenue('v2', 'National Stadium')]);
  return { db, repos };
}

function expectedFixtures(scenario: TournamentScenario): Fixture[] {
  return scenario.fixtures.map((fixture, index) => ({
    ...fixture,
    matchSides: { teamAId: scenario.matches[index].match.teamAId, teamBId: scenario.matches[index].match.teamBId },
  }));
}

async function rejectsInTransaction(db: SqlDatabase, work: (repos: Repositories) => Promise<void>): Promise<unknown> {
  return db.withTransactionAsync(async (tx) => work(createRepositories(tx))).then(
    () => new Error('expected the transaction to fail'),
    (error: unknown) => error,
  );
}

describe('TournamentRepository snapshot (IT-DB-03, getSnapshot)', () => {
  it('stores a knockout tournament with completed matches and reads it back deep-equal in one snapshot', async () => {
    const { repos, scenario } = await withScenario();
    const snapshot = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.version).toBe('1');
    expect(snapshot?.tournament).toEqual(scenario.tournament);
    expect(snapshot?.rules).toEqual(scenario.rules);
    expect(snapshot?.teams).toEqual(scenario.teams.map((seed, index) => ({ membership: scenario.tournamentTeams[index], team: seed.team })));
    expect(snapshot?.stages).toEqual(scenario.stages);
    expect(snapshot?.pools).toEqual(scenario.pools);
    expect(snapshot?.poolEntries).toEqual(scenario.poolEntries);
    expect(snapshot?.slots).toEqual(scenario.slots);
    expect(snapshot?.fixtures).toEqual(expectedFixtures(scenario));
    expect(snapshot?.summaries).toEqual(Object.fromEntries(scenario.matches.map((entry) => [entry.match.id, entry.projection.summary])));
    expect(snapshot?.staleSummaryMatchIds).toEqual([]);
    expect(snapshot?.overrides).toEqual(scenario.overrides);
    for (const entry of scenario.matches) {
      expect(await repos.matches.get(entry.match.id)).toEqual(entry.match);
    }
    expect(await repos.tournaments.getSnapshot('nope', 1)).toBeNull();
  });

  it('freezes fixture sides to the current match teams and ignores matchSides on write', async () => {
    const { db, repos, scenario } = await withScenario();
    const final = await repos.tournaments.getSnapshot('cup', 1).then((s) => s?.fixtures.find((f) => f.id === 'cup-final'));
    expect(final?.sideA).toEqual(slotSide('cup-slot-4'));
    expect(final?.matchSides).toEqual({ teamAId: 'cup-haw', teamBId: 'cup-tig' });
    const extra = buildFixture({
      id: 'cup-extra',
      tournamentId: 'cup',
      stageId: 'cup-groups',
      poolId: 'cup-pool-a',
      matchNumber: 6,
      sideA: teamSide('cup-lio'),
      sideB: teamSide('cup-tig'),
      matchSides: { teamAId: 'cup-eag', teamBId: 'cup-haw' },
    });
    await repos.tournaments.insertFixtures([extra]);
    await repos.tournaments.updateFixture({ ...scenario.fixtures[0], notes: 'Moved', matchSides: { teamAId: 'cup-eag', teamBId: 'cup-haw' } });
    const fixtures = (await repos.tournaments.getSnapshot('cup', 1))?.fixtures ?? [];
    expect(fixtures.find((f) => f.id === 'cup-extra')).toEqual({ ...extra, matchSides: null });
    expect(fixtures.find((f) => f.id === 'cup-g1')?.matchSides).toEqual({ teamAId: 'cup-tig', teamBId: 'cup-lio' });
    const columns = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM pragma_table_info('fixtures')");
    expect(columns.map((c) => c.name)).not.toContain('match_sides');
  });

  it('excludes summaries of stale projections and lists them as staleSummaryMatchIds', async () => {
    const { db, repos, scenario } = await withScenario();
    const stale = await repos.tournaments.getSnapshot('cup', 2);
    expect(stale?.summaries).toEqual({});
    expect(stale?.staleSummaryMatchIds).toEqual(scenario.matches.map((entry) => entry.match.id));
    await repos.matches.writeProjection({ ...scenario.matches[1].projection, projectionVersion: 2 });
    const partly = await repos.tournaments.getSnapshot('cup', 2);
    expect(Object.keys(partly?.summaries ?? {})).toEqual(['cup-m-g2']);
    expect(partly?.staleSummaryMatchIds).toEqual(['cup-m-g1', 'cup-m-sf1', 'cup-m-sf2', 'cup-m-final']);
    await db.runAsync("UPDATE matches SET projection_version = 0 WHERE id = 'cup-m-sf1'");
    const one = await repos.tournaments.getSnapshot('cup', 1);
    expect(one?.staleSummaryMatchIds).toEqual(['cup-m-sf1']);
    expect(one?.summaries['cup-m-sf1']).toBeUndefined();
    expect(Object.keys(one?.summaries ?? {})).toHaveLength(4);
  });

  it('only includes summaries of current terminal matches', async () => {
    const { repos, scenario } = await withScenario();
    await repos.tournaments.updateFixture({ ...scenario.fixtures[1], status: 'rescheduled', matchId: null });
    const snapshot = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot?.summaries['cup-m-g2']).toBeUndefined();
    expect(snapshot?.fixtures.find((f) => f.id === 'cup-g2')).toMatchObject({ matchId: null, matchSides: null, status: 'rescheduled' });
    expect((await repos.matches.get('cup-m-g2'))?.fixtureId).toBe('cup-g2');
  });
});

describe('TournamentRepository writes', () => {
  it('round-trips tournament info, venues and rules through update and updateRules', async () => {
    const { repos } = await withLibrary();
    const tournament = buildTournament({ id: 't1', venueIds: ['v2', 'v1'], season: null, description: 'Night league', endDate: null });
    const rules = buildTournamentRules('t1', {
      pointsSystem: {
        win: 4,
        tie: 2,
        noResult: 2,
        loss: 0,
        abandoned: 1,
        walkoverWin: 4,
        walkoverLoss: -1,
        superOverDecidedTie: 'tie',
        bonus: { kind: 'run_rate_ratio', ratio: 1.25, points: 1 },
      },
      nrr: { mode: 'actual_overs', includeNoResult: true, includeAbandoned: false, walkover: { kind: 'notional', winnerRuns: 120, winnerBalls: 120, loserRuns: 0, loserBalls: 120 }, awarded: 'use_played_innings', revisedTarget: 'actual' },
    });
    await repos.tournaments.insert(tournament, rules);
    const snapshot = await repos.tournaments.getSnapshot('t1', 1);
    expect(snapshot?.tournament).toEqual(tournament);
    expect(snapshot?.rules).toEqual(rules);
    expect(snapshot?.version).toBe('0');
    const renamed = { ...tournament, name: 'Night Cup', venueIds: ['v1'], status: 'registration' as const, updatedAt: isoAt(99) };
    await repos.tournaments.update(renamed);
    const nextRules = { ...rules, tieBreakers: ['points', 'wins'] as const, updatedAt: isoAt(99) };
    await repos.tournaments.updateRules(nextRules);
    const after = await repos.tournaments.getSnapshot('t1', 1);
    expect(after?.tournament).toEqual(renamed);
    expect(after?.rules).toEqual(nextRules);
    await expect(repos.tournaments.update({ ...renamed, id: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(repos.tournaments.updateRules({ ...nextRules, tournamentId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(repos.tournaments.update({ ...renamed, startDate: '2026-06-01', endDate: '2026-05-01' })).rejects.toThrow(/CHECK/);
  });

  it('upserts memberships in place, including replacement links checked at commit', async () => {
    const { db, repos } = await withLibrary();
    await seedBareTournament(db, 't1', ['lio', 'tig', 'eag']);
    const replaced: TournamentTeam = { ...buildMembership('t1', 'eag', 3), status: 'replaced', replacedByTeamId: 'haw' };
    const incoming: TournamentTeam = { ...buildMembership('t1', 'haw', 3), inheritsFromTeamId: 'eag', joinedAt: isoAt(90) };
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.upsertTournamentTeams([replaced, incoming]);
    });
    const views = (await repos.tournaments.getSnapshot('t1', 1))?.teams ?? [];
    expect(views.map((view) => view.membership)).toEqual([
      buildMembership('t1', 'lio', 1),
      buildMembership('t1', 'tig', 2),
      replaced,
      incoming,
    ]);
    expect(views[3].team).toEqual(hawks.team);
    const dangling = await rejectsInTransaction(db, (r) =>
      r.tournaments.upsertTournamentTeams([{ ...buildMembership('t1', 'tig', 2), status: 'replaced', replacedByTeamId: 'eag-x' }]),
    );
    expect(sqliteErrorKind(dangling)).toBe('foreign_key');
    await expect(repos.tournaments.upsertTournamentTeams([{ ...buildMembership('t1', 'lio', 1), status: 'replaced' }])).rejects.toThrow(/CHECK/);
    expect(sqliteErrorKind(await repos.tournaments.deleteTournamentTeam('t1-tt-lio').catch((e: unknown) => e))).toBe('foreign_key');
    await seedLibrary(db, [buildTeamSeed('spare', 'Spare', 'SPR', 1)]);
    await repos.tournaments.upsertTournamentTeams([buildMembership('t1', 'spare')]);
    await repos.tournaments.deleteTournamentTeam('t1-tt-spare');
    expect(await countRows(db, 'tournament_teams', 'tournament_id = ?', ['t1'])).toBe(4);
  });

  it('swaps pool order indexes and names, slot indexes and stage orders with two-phase upserts (IT-DB-07)', async () => {
    const { db, repos } = await withScenario();
    await expect(db.runAsync("UPDATE pools SET order_index = 1 WHERE id = 'cup-pool-a'")).rejects.toThrow(/UNIQUE/);
    const pools = (await repos.tournaments.getSnapshot('cup', 1))?.pools ?? [];
    const swappedPools = [
      { ...pools[0], orderIndex: 1, name: 'Pool B' },
      { ...pools[1], orderIndex: 0, name: 'Pool A' },
    ];
    await repos.tournaments.upsertPools(swappedPools);
    expect((await repos.tournaments.getSnapshot('cup', 1))?.pools).toEqual([swappedPools[1], swappedPools[0]]);
    const slots = (await repos.tournaments.getSnapshot('cup', 1))?.slots ?? [];
    const swappedSlots: StageSlot[] = [
      { ...slots[0], index: 3, label: 'B2' },
      { ...slots[3], index: 0, label: 'A1', seed: 1 },
    ];
    await repos.tournaments.upsertSlots(swappedSlots);
    const afterSlots = (await repos.tournaments.getSnapshot('cup', 1))?.slots ?? [];
    expect(afterSlots.map((slot) => [slot.id, slot.index, slot.label])).toEqual([
      ['cup-slot-3', 0, 'A1'],
      ['cup-slot-1', 1, 'B1'],
      ['cup-slot-2', 2, 'A2'],
      ['cup-slot-0', 3, 'B2'],
      ['cup-slot-4', 4, 'Winner SF1'],
      ['cup-slot-5', 5, 'Winner SF2'],
    ]);
    const stages = (await repos.tournaments.getSnapshot('cup', 1))?.stages ?? [];
    const plate: Stage = buildStage({ id: 'cup-plate', tournamentId: 'cup', name: 'Plate', type: 'knockout', orderIndex: 1 });
    await repos.tournaments.upsertStages([{ ...stages[1], orderIndex: 2 }, plate]);
    expect((await repos.tournaments.getSnapshot('cup', 1))?.stages.map((stage) => [stage.id, stage.orderIndex])).toEqual([
      ['cup-groups', 0],
      ['cup-plate', 1],
      ['cup-ko', 2],
    ]);
    await expect(repos.tournaments.upsertPools([{ ...swappedPools[0], orderIndex: 0 }])).rejects.toThrow(/UNIQUE/);
  });

  it('replaces the pool entries of one stage only, with team or slot members', async () => {
    const { db, repos } = await withScenario();
    await repos.tournaments.upsertStages([buildStage({ id: 'cup-super', tournamentId: 'cup', name: 'Super 4', orderIndex: 2 })]);
    await repos.tournaments.upsertPools([buildPool({ id: 'cup-super-1', stageId: 'cup-super', name: 'Group 1' })]);
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 'cup-s1', stageId: 'cup-super', index: 0, label: 'A1', source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-a', position: 1 } }),
      buildSlot({ id: 'cup-s2', stageId: 'cup-super', index: 1, label: 'B1', source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-b', position: 1 } }),
    ]);
    const entries = [
      buildPoolEntry({ id: 'cup-se-2', poolId: 'cup-super-1', stageId: 'cup-super', side: slotSide('cup-s2') }),
      buildPoolEntry({ id: 'cup-se-1', poolId: 'cup-super-1', stageId: 'cup-super', side: slotSide('cup-s1'), seed: 1 }),
    ];
    await repos.tournaments.replacePoolEntries('cup-super', entries);
    const snapshot = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot?.poolEntries.filter((entry) => entry.stageId === 'cup-super')).toEqual(entries);
    expect(snapshot?.poolEntries.filter((entry) => entry.stageId === 'cup-groups')).toHaveLength(4);
    const regroup = [
      buildPoolEntry({ id: 'cup-pe-9', poolId: 'cup-pool-a', stageId: 'cup-groups', side: teamSide('cup-haw') }),
      buildPoolEntry({ id: 'cup-pe-10', poolId: 'cup-pool-a', stageId: 'cup-groups', side: teamSide('cup-lio') }),
      buildPoolEntry({ id: 'cup-pe-11', poolId: 'cup-pool-b', stageId: 'cup-groups', side: teamSide('cup-tig') }),
      buildPoolEntry({ id: 'cup-pe-12', poolId: 'cup-pool-b', stageId: 'cup-groups', side: teamSide('cup-eag') }),
    ];
    await repos.tournaments.replacePoolEntries('cup-groups', regroup);
    const rows = await db.getAllAsync<{ readonly id: string; readonly tournament_id: string; readonly order_index: number }>(
      "SELECT id, tournament_id, order_index FROM pool_teams WHERE stage_id = 'cup-groups' ORDER BY pool_id, order_index",
    );
    expect(rows).toEqual([
      { id: 'cup-pe-9', tournament_id: 'cup', order_index: 0 },
      { id: 'cup-pe-10', tournament_id: 'cup', order_index: 1 },
      { id: 'cup-pe-11', tournament_id: 'cup', order_index: 0 },
      { id: 'cup-pe-12', tournament_id: 'cup', order_index: 1 },
    ]);
    await expect(repos.tournaments.replacePoolEntries('cup-super', regroup)).rejects.toBeInstanceOf(InvalidRowsError);
    await expect(repos.tournaments.replacePoolEntries('nope', [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates and deletes fixtures, slots, pools and stages', async () => {
    const { db, repos } = await withLibrary();
    const t = await seedBareTournament(db, 't1', ['lio', 'tig', 'eag', 'haw']);
    const fixture = buildFixture({ id: 'f1', tournamentId: 't1', stageId: t.groupStageId, poolId: t.poolId, sideA: teamSide('lio'), sideB: teamSide('tig'), round: 1, leg: 1 });
    await repos.tournaments.insertFixtures([fixture]);
    const moved: Fixture = {
      ...fixture,
      scheduledDate: '2026-05-09',
      scheduledTime: '18:30',
      venueId: 'v1',
      status: 'postponed',
      formatId: 'custom',
      matchRules: buildTournamentRules('t1').defaultMatchRules,
      notes: 'Floodlights',
      label: 'Opener',
      updatedAt: isoAt(700),
    };
    await repos.tournaments.updateFixture(moved);
    expect((await repos.tournaments.getSnapshot('t1', 1))?.fixtures).toEqual([moved]);
    await expect(repos.tournaments.updateFixture({ ...moved, id: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(repos.tournaments.updateFixture({ ...moved, status: 'completed' })).rejects.toThrow(/CHECK/);
    await expect(repos.tournaments.updateFixture({ ...moved, scheduledDate: '09/05/2026' })).rejects.toThrow(/CHECK/);
    await repos.tournaments.deleteFixture('f1');
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 's1', stageId: t.knockoutStageId, index: 0, source: { kind: 'pool_position', stageId: t.groupStageId, poolId: t.poolId, position: 1 } }),
    ]);
    await repos.tournaments.deleteSlot('s1');
    await repos.tournaments.deletePool(t.poolId);
    expect(await countRows(db, 'pool_teams', 'tournament_id = ?', ['t1'])).toBe(0);
    await repos.tournaments.deleteStage(t.knockoutStageId);
    const snapshot = await repos.tournaments.getSnapshot('t1', 1);
    expect(snapshot?.stages.map((stage) => stage.id)).toEqual([t.groupStageId]);
    expect(snapshot?.pools).toEqual([]);
    expect(snapshot?.slots).toEqual([]);
    expect(snapshot?.fixtures).toEqual([]);
  });

  it('stores every override kind with its indexed references and revokes without deleting', async () => {
    const { db, repos } = await withScenario();
    const base = { tournamentId: 'cup', reason: 'Organizer decision', createdAt: isoAt(30000), revokedAt: null, revokeReason: null };
    const overrides: TournamentOverride[] = [
      { ...base, id: 'o1', kind: 'qualification', stageId: 'cup-ko', teamId: 'cup-eag', action: 'reassign', slotId: 'cup-slot-2', poolId: 'cup-pool-a' },
      { ...base, id: 'o2', kind: 'points_adjustment', stageId: 'cup-groups', poolId: null, teamId: 'cup-lio', points: 2, createdAt: isoAt(30001) },
      { ...base, id: 'o3', kind: 'tie_resolution', stageId: 'cup-groups', poolId: 'cup-pool-b', orderedTeamIds: ['cup-haw', 'cup-eag'], method: 'draw_lots', seed: 847291, createdAt: isoAt(30002) },
      { ...base, id: 'o4', kind: 'slot_assignment', slotId: 'cup-slot-6', teamId: 'cup-tig', createdAt: isoAt(30003) },
      { ...base, id: 'o5', kind: 'expunge_results', stageId: null, teamId: 'cup-haw', createdAt: isoAt(30004) },
      { ...base, id: 'o6', kind: 'champion', teamIds: ['cup-tig', 'cup-lio'], createdAt: isoAt(30005) },
    ];
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 'cup-slot-6', stageId: 'cup-ko', index: 6, role: 'progression', label: 'Loser SF1', source: { kind: 'bracket_loser', stageId: 'cup-ko', round: 1, position: 0 } }),
    ]);
    for (const override of overrides) {
      await repos.tournaments.insertOverride(override);
    }
    expect((await repos.tournaments.getSnapshot('cup', 1))?.overrides).toEqual([...scenario().overrides, ...overrides]);
    const refs = await db.getAllAsync("SELECT id, kind, stage_id, pool_id, slot_id, team_id FROM tournament_overrides WHERE id LIKE 'o%' ORDER BY id");
    expect(refs).toEqual([
      { id: 'o1', kind: 'qualification', stage_id: 'cup-ko', pool_id: 'cup-pool-a', slot_id: 'cup-slot-2', team_id: 'cup-eag' },
      { id: 'o2', kind: 'points_adjustment', stage_id: 'cup-groups', pool_id: null, slot_id: null, team_id: 'cup-lio' },
      { id: 'o3', kind: 'tie_resolution', stage_id: 'cup-groups', pool_id: 'cup-pool-b', slot_id: null, team_id: null },
      { id: 'o4', kind: 'slot_assignment', stage_id: null, pool_id: null, slot_id: 'cup-slot-6', team_id: 'cup-tig' },
      { id: 'o5', kind: 'expunge_results', stage_id: null, pool_id: null, slot_id: null, team_id: 'cup-haw' },
      { id: 'o6', kind: 'champion', stage_id: null, pool_id: null, slot_id: null, team_id: null },
    ]);
    await repos.tournaments.revokeOverride('o2', isoAt(30100), 'Appeal upheld');
    await expect(repos.tournaments.revokeOverride('nope', isoAt(30100), null)).rejects.toBeInstanceOf(NotFoundError);
    expect(sqliteErrorKind(await repos.tournaments.deleteSlot('cup-slot-5').catch((e: unknown) => e))).toBe('foreign_key');
    await repos.tournaments.deleteSlot('cup-slot-6');
    const slotRef = await db.getFirstAsync<{ readonly slot_id: string | null }>("SELECT slot_id FROM tournament_overrides WHERE id = 'o4'");
    expect(slotRef).toEqual({ slot_id: null });
    const stored = (await repos.tournaments.getSnapshot('cup', 1))?.overrides ?? [];
    expect(stored.find((o) => o.id === 'o4')).toEqual(overrides[3]);
    expect(stored.find((o) => o.id === 'o2')).toEqual({ ...overrides[1], revokedAt: isoAt(30100), revokeReason: 'Appeal upheld' });
    await repos.tournaments.insertOverride(buildPointsOverride({ id: 'o7', tournamentId: 'cup', stageId: 'cup-gone', teamId: 'cup-lio' }));
    expect(await db.getFirstAsync("SELECT stage_id FROM tournament_overrides WHERE id = 'o7'")).toEqual({ stage_id: null });
    await expect(repos.tournaments.insertOverride({ ...overrides[1], id: 'o8', reason: '  ' })).rejects.toThrow(/CHECK/);
  });
});

function scenario(): TournamentScenario {
  return buildTournamentScenario('cup', 1);
}

describe('TournamentRepository revision, champion and lists', () => {
  it('bumps the revision monotonically and reports it as the snapshot version', async () => {
    const { repos } = await withLibrary();
    await repos.tournaments.insert(buildTournament({ id: 't1' }), buildTournamentRules('t1'));
    expect(await repos.tournaments.bumpRevision('t1')).toBe(1);
    expect(await repos.tournaments.bumpRevision('t1')).toBe(2);
    expect(await repos.tournaments.bumpRevision('t1')).toBe(3);
    expect((await repos.tournaments.getSnapshot('t1', 1))?.version).toBe('3');
    await expect(repos.tournaments.bumpRevision('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes the champion projection and joins champion names, SQL fixture counts and team counts into the list', async () => {
    const { db, repos } = await withScenario();
    await seedLibrary(db, [lions, tigers, eagles, hawks]);
    const t = await seedBareTournament(db, 'spring', ['lio', 'tig', 'eag', 'haw']);
    await db.withTransactionAsync(async (tx) => {
      const scoped = createRepositories(tx);
      await scoped.tournaments.upsertTournamentTeams([
        { ...buildMembership('spring', 'haw', 4), status: 'replaced', replacedByTeamId: 'eag' },
      ]);
      await scoped.tournaments.insertFixtures(
        (['scheduled', 'cancelled', 'postponed', 'rescheduled'] as const).map((status, index) =>
          buildFixture({ id: `sf-${index}`, tournamentId: 'spring', stageId: t.groupStageId, poolId: t.poolId, matchNumber: index + 1, status, sideA: teamSide('lio'), sideB: teamSide(index % 2 === 0 ? 'tig' : 'eag') }),
        ),
      );
      await scoped.tournaments.update({ ...buildTournament({ id: 'spring', name: 'Cup spring' }), status: 'active', updatedAt: isoAt(90000) });
    });
    await repos.tournaments.insert(buildTournament({ id: 'draft', name: 'Winter Shield', status: 'draft', updatedAt: isoAt(50) }), buildTournamentRules('draft'));
    await repos.tournaments.writeChampion('spring', ['lio', 'tig']);
    const list = await repos.tournaments.list();
    expect(list).toEqual([
      {
        id: 'spring',
        name: 'Cup spring',
        season: '2026',
        status: 'active',
        teamCount: 3,
        fixturesDone: 1,
        fixturesTotal: 4,
        championName: 'Lions & Tigers',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        updatedAt: isoAt(90000),
      },
      {
        id: 'draft',
        name: 'Winter Shield',
        season: '2026',
        status: 'draft',
        teamCount: 0,
        fixturesDone: 0,
        fixturesTotal: 0,
        championName: null,
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        updatedAt: isoAt(50),
      },
      {
        id: 'cup',
        name: 'Scorebook Cup',
        season: '2026',
        status: 'completed',
        teamCount: 4,
        fixturesDone: 5,
        fixturesTotal: 5,
        championName: 'Tigers',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        updatedAt: buildTournament({ id: 'cup' }).updatedAt,
      },
    ]);
    const ids = async (opts: Parameters<Repositories['tournaments']['list']>[0]): Promise<string[]> =>
      (await repos.tournaments.list(opts)).map((item) => item.id);
    expect(await ids({ statuses: ['completed', 'draft'] })).toEqual(['draft', 'cup']);
    expect(await ids({ statuses: [] })).toEqual([]);
    expect(await ids({ search: 'CUP' })).toEqual(['spring', 'cup']);
    expect(await ids({ search: 'shield' })).toEqual(['draft']);
    expect(await ids({ search: '_' })).toEqual([]);
    await repos.tournaments.writeChampion('cup', null);
    expect((await repos.tournaments.list({ search: 'Scorebook' }))[0].championName).toBeNull();
    await expect(repos.tournaments.writeChampion('nope', ['lio'])).rejects.toBeInstanceOf(NotFoundError);
    const stored = await db.getFirstAsync<{ readonly champion_json: string }>("SELECT champion_json FROM tournaments WHERE id = 'spring'");
    expect(JSON.parse(stored?.champion_json ?? 'null')).toEqual(['lio', 'tig']);
  });

  it('searches tournament names case-insensitively beyond ASCII and combines search with status filters', async () => {
    const { repos } = await openTestRepositories();
    const entries = [
      buildTournament({ id: 'coupe', name: 'Coupe Élan 2026', status: 'active', updatedAt: isoAt(3) }),
      buildTournament({ id: 'kubok', name: 'Кубок Одессы', status: 'draft', updatedAt: isoAt(2) }),
      buildTournament({ id: 'elan', name: 'Elan Shield', status: 'active', updatedAt: isoAt(1) }),
    ];
    for (const tournament of entries) {
      await repos.tournaments.insert(tournament, buildTournamentRules(tournament.id));
    }
    const ids = async (opts: Parameters<Repositories['tournaments']['list']>[0]): Promise<string[]> =>
      (await repos.tournaments.list(opts)).map((item) => item.id);
    expect(await ids({ search: 'élan' })).toEqual(['coupe']);
    expect(await ids({ search: 'COUPE ÉLAN' })).toEqual(['coupe']);
    expect(await ids({ search: 'кубок' })).toEqual(['kubok']);
    expect(await ids({ search: 'кубок', statuses: ['active'] })).toEqual([]);
    expect(await ids({ search: 'elan' })).toEqual(['elan']);
    expect(await ids({ search: ' ' })).toEqual(['coupe', 'kubok', 'elan']);
  });

  it('reports the deletion footprint, refuses to delete a tournament with matches and cascades once they are gone', async () => {
    const { db, repos, scenario: s } = await withScenario();
    expect(await repos.tournaments.deletionFootprint('cup')).toEqual({ matches: 5, completedMatches: 5, events: 5 * 43 });
    expect(await repos.tournaments.deletionFootprint('nope')).toEqual({ matches: 0, completedMatches: 0, events: 0 });
    expect(await repos.tournaments.listMatchIds('cup')).toEqual(s.matches.map((entry) => entry.match.id));
    const error = await repos.tournaments.delete('cup').catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('foreign_key');
    expect(await countRows(db, 'tournaments')).toBe(1);
    const single = await repos.matches.delete('cup-m-g1').catch((e: unknown) => e);
    expect(sqliteErrorKind(single)).toBe('foreign_key');
    await db.withTransactionAsync(async (tx) => {
      const scoped = createRepositories(tx);
      for (const matchId of await scoped.tournaments.listMatchIds('cup')) {
        await scoped.matches.delete(matchId);
      }
      await scoped.tournaments.delete('cup');
    });
    const tables = [
      'tournaments',
      'tournament_rules',
      'tournament_teams',
      'tournament_venues',
      'tournament_stages',
      'pools',
      'stage_slots',
      'pool_teams',
      'fixtures',
      'matches',
      'match_players',
      'match_events',
      'innings',
      'partnerships',
      'tournament_overrides',
    ];
    for (const table of tables) {
      expect([table, await countRows(db, table)]).toEqual([table, 0]);
    }
    expect(await countRows(db, 'audit_events')).toBe(0);
    expect(await countRows(db, 'teams')).toBe(4);
    expect(await countRows(db, 'players')).toBe(48);
    expect(await countRows(db, 'venues')).toBe(2);
  });
});

describe('generated columns (IT-DB-03)', () => {
  it('never writes a generated column and derives them from the JSON the repositories store', async () => {
    const db = await createFaultInjectingDatabase({ captureDurableImages: false });
    await runMigrations(db, { now: () => isoAt(0) });
    db.clearLog();
    await seedTournamentScenario(db, buildTournamentScenario('cup', 1));
    const tables = await db.getAllAsync<{ readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    const generated = new Set<string>();
    for (const table of tables) {
      const columns = await db.getAllAsync<{ readonly name: string; readonly hidden: number }>(`PRAGMA table_xinfo('${table.name}')`);
      for (const column of columns.filter((c) => c.hidden === 2 || c.hidden === 3)) {
        generated.add(column.name);
      }
    }
    expect([...generated].sort()).toEqual(
      [
        'overs_per_innings',
        'p_bowler_id',
        'p_fielder1_id',
        'p_fielder2_id',
        'p_non_striker_id',
        'p_player_id',
        'p_striker_id',
        'p_team_id',
        'result_type',
        'source_fixture_id',
        'source_pool_id',
        'source_stage_id',
        'source_team_id',
      ].sort(),
    );
    const writes = db.statementLog.map((entry) => entry.sql).filter((sql) => /^\s*(INSERT|UPDATE)/i.test(sql));
    expect(writes.length).toBeGreaterThan(100);
    for (const sql of writes) {
      const written = sql.match(/\b[a-z_0-9]+\b/g) ?? [];
      expect([sql, written.filter((word) => generated.has(word))]).toEqual([sql, []]);
    }
    const slot = await db.getFirstAsync("SELECT source_kind, source_stage_id, source_fixture_id FROM stage_slots WHERE id = 'cup-slot-4'");
    expect(slot).toEqual({ source_kind: 'fixture_winner', source_stage_id: null, source_fixture_id: 'cup-sf1' });
    const match = await db.getFirstAsync("SELECT overs_per_innings, result_type FROM matches WHERE id = 'cup-m-g1'");
    expect(match).toEqual({ overs_per_innings: 3, result_type: 'win' });
  });
});

describe('schema guards: DATABASE.md negative cases (IT-DB-05)', () => {
  async function twoTournaments(): Promise<Context & { readonly cup: string; readonly other: string }> {
    const context = await withLibrary();
    await seedBareTournament(context.db, 'cup', ['lio', 'tig', 'eag']);
    await seedBareTournament(context.db, 'other', ['lio', 'tig', 'haw']);
    await context.repos.tournaments.insertFixtures([
      buildFixture({ id: 'other-f1', tournamentId: 'other', stageId: 'other-groups', poolId: 'other-pool', sideA: teamSide('lio'), sideB: teamSide('haw') }),
    ]);
    return { ...context, cup: 'cup', other: 'other' };
  }

  it('refuses a tournament match whose fixture belongs to another tournament', async () => {
    const { db } = await twoTournaments();
    const error = await rejectsInTransaction(db, (repos) =>
      repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', tournamentId: 'cup', fixtureId: 'other-f1' }), []),
    );
    expect(sqliteErrorKind(error)).toBe('foreign_key');
    expect(await countRows(db, 'matches')).toBe(0);
  });

  it('refuses a fixture whose stage or pool belongs to another tournament or stage', async () => {
    const { db } = await twoTournaments();
    const crossStage = await rejectsInTransaction(db, (repos) =>
      repos.tournaments.insertFixtures([buildFixture({ id: 'x1', tournamentId: 'cup', stageId: 'other-groups', sideA: teamSide('lio'), sideB: teamSide('tig') })]),
    );
    expect(sqliteErrorKind(crossStage)).toBe('foreign_key');
    const crossPool = await rejectsInTransaction(db, (repos) =>
      repos.tournaments.insertFixtures([buildFixture({ id: 'x2', tournamentId: 'cup', stageId: 'cup-ko', poolId: 'cup-pool', sideA: teamSide('lio'), sideB: teamSide('tig') })]),
    );
    expect(sqliteErrorKind(crossPool)).toBe('foreign_key');
    expect(await countRows(db, 'fixtures', "id LIKE 'x%'")).toBe(0);
  });

  it('refuses pool entries, fixture sides and tournament match teams of non-members', async () => {
    const { db } = await twoTournaments();
    const pool = await rejectsInTransaction(db, (repos) =>
      repos.tournaments.replacePoolEntries('cup-groups', [buildPoolEntry({ id: 'pe-h', poolId: 'cup-pool', stageId: 'cup-groups', side: teamSide('haw') })]),
    );
    expect(sqliteErrorKind(pool)).toBe('foreign_key');
    const fixture = await rejectsInTransaction(db, (repos) =>
      repos.tournaments.insertFixtures([buildFixture({ id: 'x3', tournamentId: 'cup', stageId: 'cup-groups', sideA: teamSide('lio'), sideB: teamSide('haw') })]),
    );
    expect(sqliteErrorKind(fixture)).toBe('foreign_key');
    const match = await rejectsInTransaction(db, (repos) =>
      repos.matches.insert(buildMatch({ id: 'm2', teamAId: 'lio', teamBId: 'haw', tournamentId: 'cup' }), []),
    );
    expect(sqliteErrorKind(match)).toBe('foreign_key');
    expect(await countRows(db, 'pool_teams', "stage_id = 'cup-groups'")).toBe(3);
  });

  it('refuses a squad row of a third team', async () => {
    const { repos } = await twoTournaments();
    await repos.matches.insert(buildMatch({ id: 'm3', teamAId: 'lio', teamBId: 'tig' }), squadsFor(lions, tigers));
    const error = await repos.matches
      .addSquadPlayer('m3', 'eag', { playerId: eagles.players[0].id, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: false })
      .catch((e: unknown) => e);
    expect(sqliteErrorKind(error)).toBe('trigger');
  });

  it('refuses progression slots with pool sources or seeds, and bracket sources of another stage', async () => {
    const { repos } = await twoTournaments();
    const poolSourced = repos.tournaments.upsertSlots([
      buildSlot({ id: 'p1', stageId: 'cup-ko', index: 4, role: 'progression', source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool', position: 1 } }),
    ]);
    await expect(poolSourced).rejects.toThrow(/CHECK/);
    const seeded = repos.tournaments.upsertSlots([
      buildSlot({ id: 'p2', stageId: 'cup-ko', index: 4, role: 'progression', seed: 1, source: { kind: 'bracket_winner', stageId: 'cup-ko', round: 1, position: 0 } }),
    ]);
    await expect(seeded).rejects.toThrow(/CHECK/);
    const foreign = repos.tournaments.upsertSlots([
      buildSlot({ id: 'p3', stageId: 'cup-ko', index: 4, role: 'progression', source: { kind: 'bracket_winner', stageId: 'cup-groups', round: 1, position: 0 } }),
    ]);
    await expect(foreign).rejects.toThrow(/CHECK/);
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 'p4', stageId: 'cup-ko', index: 4, role: 'progression', source: { kind: 'bracket_winner', stageId: 'cup-ko', round: 1, position: 0 } }),
    ]);
  });

  it('refuses a second final in a stage and a duplicate bracket position', async () => {
    const { repos } = await twoTournaments();
    const ko = (id: string, round: number, position: number, isFinal: boolean): Fixture =>
      buildFixture({
        id,
        tournamentId: 'cup',
        stageId: 'cup-ko',
        matchNumber: 10 + round + position,
        bracket: { kind: 'main', round, position, roundName: isFinal ? 'Final' : 'Semifinal' },
        isFinal,
        sideA: teamSide('lio'),
        sideB: teamSide('tig'),
      });
    await repos.tournaments.insertFixtures([ko('sf1', 1, 0, false), ko('final', 2, 0, true)]);
    await expect(repos.tournaments.insertFixtures([{ ...ko('final2', 3, 0, true) }])).rejects.toThrow(/UNIQUE/);
    await expect(repos.tournaments.insertFixtures([ko('sf1b', 1, 0, false)])).rejects.toThrow(/UNIQUE/);
    await repos.tournaments.insertFixtures([{ ...ko('third', 2, 0, false), bracket: { kind: 'third_place', round: 2, position: 0, roundName: 'Third place' } }]);
  });

  it('refuses slot sides of another stage and a fixture slot source that does not exist', async () => {
    const { db, repos } = await twoTournaments();
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 'e1', stageId: 'cup-ko', index: 0, source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool', position: 1 } }),
    ]);
    const crossStage = await rejectsInTransaction(db, (r) =>
      r.tournaments.insertFixtures([buildFixture({ id: 'x4', tournamentId: 'cup', stageId: 'cup-groups', sideA: slotSide('e1'), sideB: teamSide('tig') })]),
    );
    expect(sqliteErrorKind(crossStage)).toBe('foreign_key');
    const dangling = await rejectsInTransaction(db, (r) =>
      r.tournaments.upsertSlots([buildSlot({ id: 'e2', stageId: 'cup-ko', index: 1, role: 'progression', source: { kind: 'fixture_winner', fixtureId: 'ghost' } })]),
    );
    expect(sqliteErrorKind(dangling)).toBe('foreign_key');
  });

  it('refuses deleting a tournament with matches, a venue in use and a fixture that feeds a slot', async () => {
    const { db, repos } = await twoTournaments();
    await repos.tournaments.update({ ...buildTournament({ id: 'cup', name: 'Cup cup' }), venueIds: ['v2'] });
    await repos.matches.insert(buildMatch({ id: 'm4', teamAId: 'lio', teamBId: 'tig', tournamentId: 'cup', venueId: 'v1' }), []);
    expect(sqliteErrorKind(await repos.tournaments.delete('cup').catch((e: unknown) => e))).toBe('foreign_key');
    expect(sqliteErrorKind(await repos.venues.delete('v1').catch((e: unknown) => e))).toBe('foreign_key');
    expect(sqliteErrorKind(await repos.venues.delete('v2').catch((e: unknown) => e))).toBe('foreign_key');
    await repos.tournaments.upsertSlots([
      buildSlot({ id: 'w1', stageId: 'other-ko', index: 0, role: 'entry', source: { kind: 'fixture_winner', fixtureId: 'other-f1' } }),
    ]);
    const feeding = await rejectsInTransaction(db, (r) => r.tournaments.deleteFixture('other-f1'));
    expect(sqliteErrorKind(feeding)).toBe('foreign_key');
    expect(await countRows(db, 'fixtures', "id = 'other-f1'")).toBe(1);
  });

  it('refuses invalid stage configuration JSON and structure enums through CHECK constraints', async () => {
    const { db, repos } = await twoTournaments();
    await expect(db.runAsync("UPDATE tournament_stages SET config_json = '{oops' WHERE id = 'cup-groups'")).rejects.toThrow(/CHECK|JSON/i);
    await expect(repos.tournaments.upsertStages([buildStage({ id: 'bad', tournamentId: 'cup', orderIndex: 5, config: stageConfig(), status: 'pending', type: 'group', name: ' ' })])).rejects.toThrow(/CHECK/);
    await expect(db.runAsync("UPDATE fixtures SET bracket_kind = 'main' WHERE id = 'other-f1'")).rejects.toThrow(/CHECK/);
  });
});

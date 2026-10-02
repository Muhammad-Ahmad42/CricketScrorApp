/** @jest-environment node */
import type { ChangePlan, Fixture, FixtureDraft, Pool, PoolEntry, Stage, StageSlot, TournamentOverride, TournamentRules } from '@/domain/types';
import { InvalidRowsError } from '../errors';
import { createRepositories } from '../repositories';
import type { Repositories } from '../repositories/contracts';
import { TEST_MATCH_RULES, buildTeamSeed, isoAt } from '../testing/builders';
import { countRows, openTestRepositories } from '../testing/harness';
import {
  buildFixture,
  buildMembership,
  buildPool,
  buildPoolEntry,
  buildSlot,
  buildStage,
  slotSide,
  teamSide,
  toDraft,
} from '../testing/structureBuilders';
import { buildTournamentScenario, seedLibrary, seedTournamentScenario, type TournamentScenario } from '../testing/tournamentScenario';
import type { SqlDatabase } from '../types';

const PLAN_AT = isoAt(40000);

const EMPTY_PLAN: ChangePlan = {
  tournamentTeams: { upsert: [] },
  rules: null,
  stages: { upsert: [], delete: [] },
  pools: { upsert: [], delete: [] },
  slots: { upsert: [], delete: [] },
  poolEntries: [],
  fixtures: { insert: [], update: [], delete: [] },
  overrides: { insert: [], revoke: [] },
  matchesToCreate: [],
  summaryChanges: [],
};

interface Seeded {
  readonly db: SqlDatabase;
  readonly repos: Repositories;
  readonly scenario: TournamentScenario;
}

async function seeded(): Promise<Seeded> {
  const { db, repos } = await openTestRepositories();
  const scenario = buildTournamentScenario('cup', 1);
  await seedTournamentScenario(db, scenario);
  await seedLibrary(db, [buildTeamSeed('cup-bul', 'Bulls', 'BUL')]);
  await db.withTransactionAsync(async (tx) => {
    const scoped = createRepositories(tx);
    await scoped.tournaments.upsertStages([buildStage({ id: 'cup-old', tournamentId: 'cup', name: 'Old plate', orderIndex: 2 })]);
    await scoped.tournaments.upsertPools([
      buildPool({ id: 'cup-old-pool', stageId: 'cup-old', name: 'Old pool' }),
      buildPool({ id: 'cup-pool-c', stageId: 'cup-groups', name: 'Pool C', orderIndex: 2 }),
    ]);
    await scoped.tournaments.upsertSlots([
      buildSlot({ id: 'cup-slot-9', stageId: 'cup-ko', index: 9, role: 'progression', label: 'Loser SF2', source: { kind: 'bracket_loser', stageId: 'cup-ko', round: 1, position: 1 } }),
    ]);
    await scoped.tournaments.insertFixtures([
      buildFixture({ id: 'cup-g3', tournamentId: 'cup', stageId: 'cup-groups', poolId: 'cup-pool-a', matchNumber: 6, sideA: teamSide('cup-lio'), sideB: teamSide('cup-tig'), round: 2, leg: 1 }),
      buildFixture({ id: 'cup-g5', tournamentId: 'cup', stageId: 'cup-groups', poolId: 'cup-pool-b', matchNumber: 9, sideA: teamSide('cup-eag'), sideB: teamSide('cup-haw'), round: 2, leg: 1 }),
    ]);
  });
  return { db, repos, scenario };
}

function fullPlan(scenario: TournamentScenario): {
  readonly plan: ChangePlan;
  readonly expected: {
    readonly rules: TournamentRules;
    readonly stages: readonly Stage[];
    readonly pools: readonly Pool[];
    readonly slots: readonly StageSlot[];
    readonly groupEntries: readonly PoolEntry[];
    readonly plateEntries: readonly PoolEntry[];
    readonly newFixtures: readonly FixtureDraft[];
    readonly rescheduled: Fixture;
    readonly override: TournamentOverride;
  };
} {
  const [groups, ko] = scenario.stages;
  const [poolA, poolB] = scenario.pools;
  const eagles = scenario.tournamentTeams[2];
  const rules: TournamentRules = {
    ...scenario.rules,
    pointsSystem: { ...scenario.rules.pointsSystem, win: 3 },
    tieBreakers: ['points', 'wins', 'nrr'],
    updatedAt: PLAN_AT,
  };
  const renamedKo: Stage = { ...ko, name: 'Finals', updatedAt: PLAN_AT };
  const plate: Stage = buildStage({ id: 'cup-plate', tournamentId: 'cup', name: 'Plate', type: 'custom', orderIndex: 2, createdAt: PLAN_AT, updatedAt: PLAN_AT });
  const swappedA: Pool = { ...poolA, orderIndex: 1, name: 'Pool B' };
  const swappedB: Pool = { ...poolB, orderIndex: 0, name: 'Pool A' };
  const platePool: Pool = buildPool({ id: 'cup-plate-pool', stageId: 'cup-plate', name: 'Plate pool', legs: 2 });
  const koSlots = scenario.slots;
  const movedSlots: StageSlot[] = [
    { ...koSlots[0], index: 3, label: 'B2', seed: 4 },
    { ...koSlots[3], index: 0, label: 'A1', seed: 1 },
  ];
  const plateSlots: StageSlot[] = [
    buildSlot({ id: 'cup-plate-s0', stageId: 'cup-plate', index: 0, label: 'A3', source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-a', position: 2 } }),
    buildSlot({ id: 'cup-plate-s1', stageId: 'cup-plate', index: 1, label: 'B3', source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-b', position: 2 } }),
    buildSlot({ id: 'cup-plate-s2', stageId: 'cup-plate', index: 2, role: 'progression', label: 'Plate winner', source: { kind: 'fixture_winner', fixtureId: 'cup-plate-f1' } }),
  ];
  const groupEntries: PoolEntry[] = [
    buildPoolEntry({ id: 'cup-pe-20', poolId: poolA.id, stageId: groups.id, side: teamSide('cup-bul'), seed: 5 }),
    buildPoolEntry({ id: 'cup-pe-21', poolId: poolA.id, stageId: groups.id, side: teamSide('cup-lio'), seed: 1 }),
    buildPoolEntry({ id: 'cup-pe-22', poolId: poolA.id, stageId: groups.id, side: teamSide('cup-tig'), seed: 2 }),
    buildPoolEntry({ id: 'cup-pe-23', poolId: poolB.id, stageId: groups.id, side: teamSide('cup-eag'), seed: 9 }),
    buildPoolEntry({ id: 'cup-pe-24', poolId: poolB.id, stageId: groups.id, side: teamSide('cup-haw'), seed: 4 }),
  ];
  const plateEntries: PoolEntry[] = [
    buildPoolEntry({ id: 'cup-pl-1', poolId: platePool.id, stageId: plate.id, side: slotSide('cup-plate-s0') }),
    buildPoolEntry({ id: 'cup-pl-2', poolId: platePool.id, stageId: plate.id, side: slotSide('cup-plate-s1') }),
  ];
  const newFixtures: FixtureDraft[] = [
    toDraft(buildFixture({ id: 'cup-g4', tournamentId: 'cup', stageId: groups.id, poolId: poolA.id, matchNumber: 7, round: 3, leg: 1, sideA: teamSide('cup-bul'), sideB: teamSide('cup-lio'), scheduledDate: '2026-05-20', scheduledTime: '14:00', venueId: 'cup-venue-2' })),
    toDraft(
      buildFixture({
        id: 'cup-plate-f1',
        tournamentId: 'cup',
        stageId: plate.id,
        poolId: platePool.id,
        matchNumber: 8,
        label: 'Plate final',
        isFinal: true,
        sideA: slotSide('cup-plate-s0'),
        sideB: slotSide('cup-plate-s1'),
        formatId: 'custom',
        matchRules: { ...TEST_MATCH_RULES, oversPerInnings: 5 },
      }),
    ),
  ];
  const g3 = buildFixture({ id: 'cup-g3', tournamentId: 'cup', stageId: 'cup-groups', poolId: 'cup-pool-a', matchNumber: 6, sideA: teamSide('cup-lio'), sideB: teamSide('cup-tig'), round: 2, leg: 1 });
  const rescheduled: Fixture = { ...g3, status: 'rescheduled', scheduledDate: '2026-05-25', scheduledTime: '09:30', notes: 'Rain', updatedAt: PLAN_AT };
  const override: TournamentOverride = {
    id: 'cup-ovr-3',
    tournamentId: 'cup',
    kind: 'qualification',
    stageId: plate.id,
    teamId: 'cup-bul',
    action: 'qualify',
    slotId: 'cup-plate-s1',
    poolId: null,
    reason: 'Invitation',
    createdAt: PLAN_AT,
    revokedAt: null,
    revokeReason: null,
  };
  const plan: ChangePlan = {
    tournamentTeams: { upsert: [{ ...eagles, seed: 9 }, { ...buildMembership('cup', 'cup-bul', 5), joinedAt: PLAN_AT }] },
    rules,
    stages: { upsert: [renamedKo, plate], delete: ['cup-old'] },
    pools: { upsert: [swappedA, swappedB, platePool], delete: ['cup-pool-c'] },
    slots: { upsert: [...movedSlots, ...plateSlots], delete: ['cup-slot-9'] },
    poolEntries: [
      { stageId: groups.id, entries: groupEntries },
      { stageId: plate.id, entries: plateEntries },
    ],
    fixtures: { insert: newFixtures, update: [rescheduled], delete: ['cup-g5'] },
    overrides: {
      insert: [override],
      revoke: [{ overrideId: 'cup-ovr-1', at: PLAN_AT, reason: 'Penalty rescinded' }],
    },
    matchesToCreate: [
      {
        matchId: 'walkover-match',
        fixtureId: 'cup-g4',
        match: {
          title: 'Bulls v Lions',
          teamAId: 'cup-bul',
          teamBId: 'cup-lio',
          venueId: null,
          scheduledDate: null,
          scheduledTime: null,
          formatId: 'custom',
          rules: TEST_MATCH_RULES,
          squads: [],
          toss: null,
          tournamentId: 'cup',
          fixtureId: 'cup-g4',
          teamAPlayers: null,
          teamBPlayers: null,
        },
        events: [{ kind: 'match_ended', outcome: { type: 'walkover', winnerTeamId: 'cup-lio', reason: 'Bulls withdrew' } }],
      },
    ],
    summaryChanges: [{ matchId: 'cup-m-g1', summary: null }],
  };
  const sortedKoSlots = [movedSlots[1], koSlots[1], koSlots[2], movedSlots[0], koSlots[4], koSlots[5]];
  return {
    plan,
    expected: {
      rules,
      stages: [groups, renamedKo, plate],
      pools: [swappedB, swappedA, platePool],
      slots: [...sortedKoSlots, ...plateSlots],
      groupEntries,
      plateEntries,
      newFixtures,
      rescheduled,
      override,
    },
  };
}

describe('TournamentRepository.applyPlanRows', () => {
  it('executes every section of a change plan in one transaction and the snapshot reflects exactly that plan', async () => {
    const { db, repos, scenario } = await seeded();
    const { plan, expected } = fullPlan(scenario);
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.applyPlanRows('cup', plan, PLAN_AT);
    });
    const snapshot = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot?.teams.map((view) => view.membership)).toEqual([
      scenario.tournamentTeams[0],
      scenario.tournamentTeams[1],
      { ...scenario.tournamentTeams[2], seed: 9 },
      scenario.tournamentTeams[3],
      { ...buildMembership('cup', 'cup-bul', 5), joinedAt: PLAN_AT },
    ]);
    expect(snapshot?.rules).toEqual(expected.rules);
    expect(snapshot?.stages).toEqual(expected.stages);
    expect(snapshot?.pools).toEqual(expected.pools);
    expect(snapshot?.slots).toEqual(expected.slots);
    expect(snapshot?.poolEntries).toEqual([
      ...expected.groupEntries.filter((entry) => entry.poolId === 'cup-pool-b'),
      ...expected.groupEntries.filter((entry) => entry.poolId === 'cup-pool-a'),
      ...expected.plateEntries,
    ]);
    const fixtures = snapshot?.fixtures ?? [];
    expect(fixtures.map((fixture) => fixture.id)).toEqual(['cup-g1', 'cup-g2', 'cup-sf1', 'cup-sf2', 'cup-final', 'cup-g3', 'cup-g4', 'cup-plate-f1']);
    expect(fixtures.find((fixture) => fixture.id === 'cup-g3')).toEqual(expected.rescheduled);
    for (const created of expected.newFixtures) {
      expect(fixtures.find((fixture) => fixture.id === created.id)).toEqual({
        ...created,
        matchId: null,
        matchSides: null,
        createdAt: PLAN_AT,
        updatedAt: PLAN_AT,
      });
    }
    expect(snapshot?.overrides).toEqual([
      { ...scenario.overrides[0], revokedAt: PLAN_AT, revokeReason: 'Penalty rescinded' },
      scenario.overrides[1],
      expected.override,
    ]);
    expect(await countRows(db, 'tournament_stages', "id = 'cup-old'")).toBe(0);
    expect(await countRows(db, 'pools', "id IN ('cup-old-pool', 'cup-pool-c')")).toBe(0);
    expect(await countRows(db, 'matches', "id = 'walkover-match'")).toBe(0);
    expect(await countRows(db, 'matches')).toBe(5);
    expect(await countRows(db, 'matches', "id = 'cup-m-g1' AND summary_json IS NOT NULL")).toBe(1);
  });

  it('accepts an empty plan without writing anything', async () => {
    const { db, repos } = await seeded();
    const before = await repos.tournaments.getSnapshot('cup', 1);
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.applyPlanRows('cup', EMPTY_PLAN, PLAN_AT);
    });
    expect(await repos.tournaments.getSnapshot('cup', 1)).toEqual(before);
  });

  it('refuses a plan containing rows of another tournament before writing anything', async () => {
    const { db, repos, scenario } = await seeded();
    const before = await repos.tournaments.getSnapshot('cup', 1);
    const { plan } = fullPlan(scenario);
    const foreignFixture = { ...plan.fixtures.insert[0], tournamentId: 'elsewhere' };
    const variants: ChangePlan[] = [
      { ...plan, fixtures: { ...plan.fixtures, insert: [foreignFixture] } },
      { ...EMPTY_PLAN, stages: { upsert: [{ ...scenario.stages[0], tournamentId: 'elsewhere' }], delete: [] } },
      { ...EMPTY_PLAN, rules: { ...scenario.rules, tournamentId: 'elsewhere' } },
      { ...EMPTY_PLAN, tournamentTeams: { upsert: [buildMembership('elsewhere', 'cup-lio')] } },
      { ...EMPTY_PLAN, overrides: { insert: [{ ...scenario.overrides[0], id: 'x', tournamentId: 'elsewhere' }], revoke: [] } },
      { ...EMPTY_PLAN, fixtures: { insert: [], update: [{ ...scenario.fixtures[0], tournamentId: 'elsewhere' }], delete: [] } },
    ];
    for (const variant of variants) {
      const error = await db
        .withTransactionAsync(async (tx) => createRepositories(tx).tournaments.applyPlanRows('cup', variant, PLAN_AT))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidRowsError);
    }
    expect(await repos.tournaments.getSnapshot('cup', 1)).toEqual(before);
  });

  it('rolls the whole plan back when a late section violates a constraint', async () => {
    const { db, repos, scenario } = await seeded();
    const before = await repos.tournaments.getSnapshot('cup', 1);
    const { plan } = fullPlan(scenario);
    const clash: ChangePlan = {
      ...plan,
      fixtures: { ...plan.fixtures, insert: [...plan.fixtures.insert, { ...plan.fixtures.insert[0], id: 'cup-dup', isFinal: false, poolId: null, stageId: 'cup-ko', bracket: { kind: 'main', round: 1, position: 0, roundName: 'Semifinal' } }] },
    };
    const error = await db
      .withTransactionAsync(async (tx) => createRepositories(tx).tournaments.applyPlanRows('cup', clash, PLAN_AT))
      .catch((e: unknown) => e);
    expect(String(error)).toMatch(/UNIQUE/);
    expect(await repos.tournaments.getSnapshot('cup', 1)).toEqual(before);
  });

  it('applies a knockout re-draw whose progression slots reference fixtures created later in the same plan', async () => {
    const { db, repos } = await seeded();
    const redraw: ChangePlan = {
      ...EMPTY_PLAN,
      stages: { upsert: [buildStage({ id: 'cup-bowl', tournamentId: 'cup', name: 'Bowl', type: 'knockout', orderIndex: 3 })], delete: [] },
      slots: {
        upsert: [
          buildSlot({ id: 'bowl-e0', stageId: 'cup-bowl', index: 0, label: 'A2', seed: 1, source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-a', position: 2 } }),
          buildSlot({ id: 'bowl-e1', stageId: 'cup-bowl', index: 1, label: 'B2', seed: 2, source: { kind: 'pool_position', stageId: 'cup-groups', poolId: 'cup-pool-b', position: 2 } }),
          buildSlot({ id: 'bowl-w', stageId: 'cup-bowl', index: 2, role: 'progression', label: 'Bowl winner', source: { kind: 'fixture_winner', fixtureId: 'bowl-f1' } }),
        ],
        delete: [],
      },
      fixtures: {
        insert: [
          toDraft(
            buildFixture({
              id: 'bowl-f1',
              tournamentId: 'cup',
              stageId: 'cup-bowl',
              matchNumber: 20,
              isFinal: true,
              bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' },
              sideA: slotSide('bowl-e0'),
              sideB: slotSide('bowl-e1'),
            }),
          ),
        ],
        update: [],
        delete: [],
      },
    };
    await db.withTransactionAsync(async (tx) => {
      await createRepositories(tx).tournaments.applyPlanRows('cup', redraw, PLAN_AT);
    });
    const snapshot = await repos.tournaments.getSnapshot('cup', 1);
    expect(snapshot?.slots.filter((slot) => slot.stageId === 'cup-bowl').map((slot) => slot.id)).toEqual(['bowl-e0', 'bowl-e1', 'bowl-w']);
    expect(snapshot?.fixtures.find((fixture) => fixture.id === 'bowl-f1')?.isFinal).toBe(true);
  });
});

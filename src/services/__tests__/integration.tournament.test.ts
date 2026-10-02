/** @jest-environment node */
import { BASE_MATCH_RULES, rulesForOvers, type HistoryEditOp } from '@/domain/scoring';
import { builtinTemplates, instantiateTemplate, poolWarnings, resolveFixtureTeams, stageEntrants } from '@/domain/tournament';
import { foreignKeyCheck } from '@/db';
import type {
  DeliveryPayload,
  Fixture,
  Match,
  MatchEvent,
  Stage,
  StandingRow,
  StandingsTable,
  TeamQualification,
  TournamentEvaluation,
  TournamentSnapshot,
} from '@/domain/types';
import type { ChangePreview } from '../contracts';
import { coldRestart, expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';
import { live } from './support/scoring';
import { createSide, sixNames, type Side } from './support/sides';
import { fixtureBetween, playFixture, squadsFor, type FixturePlay } from './support/tournament';

jest.setTimeout(60000);

const RULES = rulesForOvers(2, { ...BASE_MATCH_RULES, playersPerSide: 6 });
const TEMPLATE_ID = 'builtin:8-team-t20';

let harness: Harness;
let tournamentId: string;
let group: Stage;
let knockouts: Stage;
const sides: Record<string, Side> = {};
const revisions: number[] = [];
let swapPreview: ChangePreview;
let evaluationBeforeRestart: TournamentEvaluation;
const NAMES = ['Lions', 'Tigers', 'Eagles', 'Hawks', 'Bulls', 'Bears', 'Cobras', 'Wolves'];

async function revision(): Promise<number> {
  const row = await harness.db.getFirstAsync<{ revision: number }>('SELECT revision FROM tournaments WHERE id = ?', [tournamentId]);
  return row?.revision ?? -1;
}

async function recordRevision(): Promise<void> {
  revisions.push(await revision());
}

async function evaluate(): Promise<{ snapshot: TournamentSnapshot; evaluation: TournamentEvaluation }> {
  return expectOk(await harness.app.tournaments.evaluate(tournamentId));
}

function poolStandings(evaluation: TournamentEvaluation, snapshot: TournamentSnapshot, poolName: string): StandingsTable {
  const pool = snapshot.pools.find((entry) => entry.name === poolName);
  const table = evaluation.stages.find((stage) => stage.stageId === group.id)?.tables.find((entry) => entry.poolId === pool?.id);
  if (table === undefined) {
    throw new Error(`No table for ${poolName}`);
  }
  return table;
}

function poolTable(evaluation: TournamentEvaluation, snapshot: TournamentSnapshot, poolName: string): readonly StandingRow[] {
  return poolStandings(evaluation, snapshot, poolName).rows;
}

function row(rows: readonly StandingRow[], name: string): StandingRow {
  const found = rows.find((entry) => entry.teamId === sides[name].team.id);
  if (found === undefined) {
    throw new Error(`No row for ${name}`);
  }
  return found;
}

function order(rows: readonly StandingRow[]): readonly string[] {
  return rows.map((entry) => NAMES.find((name) => sides[name].team.id === entry.teamId) ?? '?');
}

function qualification(evaluation: TournamentEvaluation, name: string): TeamQualification {
  const found = evaluation.stages.find((stage) => stage.stageId === group.id)?.qualification.find((entry) => entry.teamId === sides[name].team.id);
  if (found === undefined) {
    throw new Error(`No qualification for ${name}`);
  }
  return found;
}

function slot(evaluation: TournamentEvaluation, snapshot: TournamentSnapshot, label: string) {
  const stageSlot = snapshot.slots.find((entry) => entry.stageId === knockouts.id && entry.label === label);
  const resolution = evaluation.stages.flatMap((stage) => stage.slots).find((entry) => entry.slotId === stageSlot?.id);
  return { teamId: resolution?.teamId ?? null, status: resolution?.status ?? null, slot: stageSlot };
}

function knockoutFixture(snapshot: TournamentSnapshot, round: number, position: number): Fixture {
  const found = snapshot.fixtures.find((fixture) => fixture.stageId === knockouts.id && fixture.bracket?.round === round && fixture.bracket.position === position && fixture.bracket.kind === 'main');
  if (found === undefined) {
    throw new Error(`No knockout fixture ${round}/${position}`);
  }
  return found;
}

function play(battingFirst: string, fieldingFirst: string, first: FixturePlay['first'], second: FixturePlay['second']): FixturePlay {
  return { battingFirst: sides[battingFirst], fieldingFirst: sides[fieldingFirst], first, second };
}

function fixtureSides(fixture: Fixture): readonly [Side, Side] {
  const sideA = Object.values(sides).find((side) => fixture.sideA.kind === 'team' && fixture.sideA.teamId === side.team.id);
  const sideB = Object.values(sides).find((side) => fixture.sideB.kind === 'team' && fixture.sideB.teamId === side.team.id);
  if (sideA === undefined || sideB === undefined) {
    throw new Error('Fixture sides missing');
  }
  return [sideA, sideB];
}

async function playGroupMatch(a: string, b: string, spec: FixturePlay, existing: Match | null = null): Promise<string> {
  const { snapshot } = await evaluate();
  const fixture = fixtureBetween(snapshot, sides[a], sides[b]);
  const [sideA, sideB] = fixtureSides(fixture);
  const revisionBefore = await revision();
  const recordedBefore = await rowCount(harness.db, 'audit_events', "action = 'result_recorded'");
  const played = await playFixture(harness.app, fixture, spec, sideA, sideB, existing);
  const after = await evaluate();
  const stored = after.snapshot.fixtures.find((entry) => entry.id === fixture.id);
  expect(stored?.status).toBe('completed');
  expect(stored?.matchId).toBe(played.match.id);
  expect(stored?.matchSides).toEqual({ teamAId: sideA.team.id, teamBId: sideB.team.id });
  expect(after.snapshot.summaries[played.match.id]).toBeDefined();
  expect(await revision()).toBeGreaterThan(revisionBefore);
  expect(await rowCount(harness.db, 'audit_events', "action = 'result_recorded'")).toBe(recordedBefore + 1);
  await recordRevision();
  return played.match.id;
}

const line = (runs: number, wickets: number, balls: number) => ({ line: { runs, wickets, balls } });

let match6Id: string;
let firstMatch: Match;

describe('IT-T tournament lifecycle, 8 teams to a champion (§91, §92)', () => {
  it('IT-T-01 creates eight teams', async () => {
    harness = await openHarness();
    for (const name of NAMES) {
      sides[name] = await createSide(harness.app, name, name.slice(0, 3).toUpperCase(), sixNames(name));
    }
    expect(await rowCount(harness.db, 'teams')).toBe(8);
    expect(await rowCount(harness.db, 'players')).toBe(48);
  });

  it('IT-T-02 creates the tournament from the 8-team template', async () => {
    const tournament = expectOk(
      await harness.app.tournaments.create({
        name: 'Scorebook Cup',
        season: '2026',
        description: null,
        organizer: 'Harris',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        venueIds: [],
        structureKind: 'groups_knockout',
        templateId: TEMPLATE_ID,
      }),
    );
    tournamentId = tournament.id;
    expect(tournament.status).toBe('draft');
    expect(await revision()).toBeGreaterThanOrEqual(0);
    const rules = await harness.db.getFirstAsync<{ points_win: number; points_tie: number; points_no_result: number; points_loss: number; nrr_mode: string }>(
      'SELECT points_win, points_tie, points_no_result, points_loss, nrr_mode FROM tournament_rules WHERE tournament_id = ?',
      [tournamentId],
    );
    expect(rules).toEqual({ points_win: 2, points_tie: 1, points_no_result: 1, points_loss: 0, nrr_mode: 'icc' });
    expect(await rowCount(harness.db, 'audit_events', "action = 'tournament_created'")).toBe(1);
    await recordRevision();
  });

  it('IT-T-03 adds the teams with seeds and opens registration', async () => {
    expectOk(await harness.app.tournaments.addTeams(tournamentId, NAMES.map((name, index) => ({ teamId: sides[name].team.id, seed: index + 1 }))));
    expectOk(await harness.app.tournaments.setStatus(tournamentId, 'registration', null));
    expect(await rowCount(harness.db, 'tournament_teams', "status = 'active'")).toBe(8);
    expect(await revision()).toBeGreaterThan(revisions[revisions.length - 1]);
    await recordRevision();
  });

  it('IT-T-04 saves the template structure with 2-over, 6-a-side rules', async () => {
    const template = builtinTemplates().find((entry) => entry.id === TEMPLATE_ID);
    if (template === undefined) {
      throw new Error('template missing');
    }
    const structure = instantiateTemplate(template, { tournamentId, now: '2026-05-01T09:00:00.000Z', ids: harness.app.newId });
    const snapshot = expectOk(
      await harness.app.tournaments.saveStructure(tournamentId, {
        rules: { ...structure.rules, defaultMatchRules: RULES },
        stages: structure.stages,
        pools: structure.pools,
        slots: structure.slots,
        poolEntries: structure.poolEntries,
      }),
    );
    expectOk(await harness.app.tournaments.setStatus(tournamentId, 'structure_configured', null));
    [group, knockouts] = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(snapshot.stages.map((stage) => stage.orderIndex)).toEqual([0, 1]);
    expect(knockouts.config.decidesChampion).toBe(true);
    expect(snapshot.pools).toHaveLength(2);
    const entrySlots = snapshot.slots.filter((entry) => entry.stageId === knockouts.id).sort((a, b) => a.index - b.index);
    expect(entrySlots.map((entry) => [entry.label, entry.index, entry.role])).toEqual([
      ['A1', 0, 'entry'],
      ['B1', 1, 'entry'],
      ['A2', 2, 'entry'],
      ['B2', 3, 'entry'],
    ]);
    await recordRevision();
  });

  it('IT-T-05 previews a reproducible random pool draw without writing it', async () => {
    const first = expectOk(await harness.app.tournaments.previewPoolAssignment(group.id, { kind: 'random', seed: 847291 }));
    const second = expectOk(await harness.app.tournaments.previewPoolAssignment(group.id, { kind: 'random', seed: 847291 }));
    expect(first).toEqual(second);
    expect(first.seed).toBe(847291);
    expect(await rowCount(harness.db, 'pool_teams')).toBe(0);
  });

  it('IT-T-06 stores a manual pool arrangement', async () => {
    const { snapshot } = await evaluate();
    const pools = snapshot.pools.filter((pool) => pool.stageId === group.id).sort((a, b) => a.orderIndex - b.orderIndex);
    const member = (name: string) => ({ kind: 'team' as const, teamId: sides[name].team.id });
    const assignment = expectOk(
      await harness.app.tournaments.previewPoolAssignment(group.id, {
        kind: 'manual',
        assignment: {
          seed: null,
          pools: [
            { poolId: pools[0].id, name: pools[0].name, members: ['Lions', 'Tigers', 'Eagles', 'Hawks'].map(member) },
            { poolId: pools[1].id, name: pools[1].name, members: ['Bulls', 'Bears', 'Cobras', 'Wolves'].map(member) },
          ],
        },
      }),
    );
    expect(poolWarnings(assignment, stageEntrants(snapshot, group.id))).toEqual([]);
    const poolEntries = assignment.pools.flatMap((pool) =>
      pool.members.map((side, index) => ({ id: harness.app.newId(), poolId: pool.poolId, stageId: group.id, side, seed: index + 1 })),
    );
    expectOk(
      await harness.app.tournaments.saveStructure(tournamentId, {
        rules: snapshot.rules,
        stages: snapshot.stages,
        pools: snapshot.pools,
        slots: snapshot.slots,
        poolEntries: [...snapshot.poolEntries, ...poolEntries],
      }),
    );
    expectOk(await harness.app.tournaments.setStatus(tournamentId, 'pools_configured', null));
    expect(await rowCount(harness.db, 'pool_teams')).toBe(8);
    await recordRevision();
  });

  it('IT-T-07 generates the group fixtures as a preview only', async () => {
    const plan = expectOk(await harness.app.tournaments.generateFixtures(group.id));
    expect(plan.fixtures).toHaveLength(12);
    const byPool = new Map<string | null, number>();
    plan.fixtures.forEach((fixture) => byPool.set(fixture.poolId, (byPool.get(fixture.poolId) ?? 0) + 1));
    expect([...byPool.values()]).toEqual([6, 6]);
    expect(new Set(plan.fixtures.filter((fixture) => fixture.poolId === plan.fixtures[0].poolId).map((fixture) => fixture.round)).size).toBe(3);
    const pairs = plan.fixtures.map((fixture) =>
      [fixture.sideA, fixture.sideB]
        .map((side) => (side.kind === 'team' ? side.teamId : side.slotId))
        .sort()
        .join('|'),
    );
    expect(new Set(pairs).size).toBe(12);
    expect(plan.fixtures.map((fixture) => fixture.matchNumber)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(await rowCount(harness.db, 'fixtures')).toBe(0);
  });

  it('IT-T-08 confirms the group fixtures', async () => {
    const before = await revision();
    const plan = expectOk(await harness.app.tournaments.generateFixtures(group.id));
    expectOk(await harness.app.tournaments.confirmFixtures(group.id, plan));
    expect(await rowCount(harness.db, 'fixtures', "status = 'scheduled'")).toBe(12);
    expect(await rowCount(harness.db, 'audit_events', "action = 'fixtures_generated'")).toBe(1);
    expect(await revision()).toBeGreaterThan(before);
    await recordRevision();
  });

  it('IT-T-09 generates the knockout bracket with progression slots', async () => {
    const plan = expectOk(await harness.app.tournaments.generateFixtures(knockouts.id));
    const snapshot = expectOk(await harness.app.tournaments.confirmFixtures(knockouts.id, plan));
    const label = (fixture: Fixture, side: 'sideA' | 'sideB') => {
      const value = fixture[side];
      return value.kind === 'slot' ? snapshot.slots.find((entry) => entry.id === value.slotId)?.label : 'team';
    };
    const sf1 = knockoutFixture(snapshot, 1, 0);
    const sf2 = knockoutFixture(snapshot, 1, 1);
    const final = knockoutFixture(snapshot, 2, 0);
    expect([label(sf1, 'sideA'), label(sf1, 'sideB')]).toEqual(['A1', 'B2']);
    expect([label(sf2, 'sideA'), label(sf2, 'sideB')]).toEqual(['B1', 'A2']);
    expect([label(final, 'sideA'), label(final, 'sideB')]).toEqual(['Winner SF1', 'Winner SF2']);
    expect(final.isFinal).toBe(true);
    const progression = snapshot.slots.filter((entry) => entry.stageId === knockouts.id && entry.role === 'progression').sort((a, b) => a.index - b.index);
    expect(progression.map((entry) => [entry.index, entry.source.kind])).toEqual([
      [4, 'bracket_winner'],
      [5, 'bracket_winner'],
    ]);
    const seeds = snapshot.slots.filter((entry) => entry.stageId === knockouts.id && entry.role === 'entry').sort((a, b) => a.index - b.index);
    expect(seeds.map((entry) => entry.seed)).toEqual([1, 2, 3, 4]);
    expect([sf1, sf2, final].map((fixture) => fixture.matchNumber).sort()).toEqual([13, 14, 15]);
    await recordRevision();
  });

  it('IT-T-10 starts with an empty table', async () => {
    expectOk(await harness.app.tournaments.setStatus(tournamentId, 'fixtures_generated', null));
    const { snapshot, evaluation } = await evaluate();
    const rows = [...poolTable(evaluation, snapshot, 'Pool A'), ...poolTable(evaluation, snapshot, 'Pool B')];
    expect(rows).toHaveLength(8);
    expect(rows.every((entry) => entry.points === 0 && entry.nrr === null)).toBe(true);
    expect(evaluation.stages.find((stage) => stage.stageId === knockouts.id)?.slots.every((entry) => entry.status === 'pending')).toBe(true);
    expect(evaluation.progress).toEqual({ done: 0, total: 15 });
    expect(evaluation.currentStageId).toBe(group.id);
    const [item] = expectOk(await harness.app.tournaments.list());
    expect([item.fixturesDone, item.fixturesTotal]).toEqual([0, 15]);
    await recordRevision();
  });

  it('IT-T-30 refuses a change previewed on an older version', async () => {
    const swap = { kind: 'pool_swap' as const, stageId: group.id, memberA: { kind: 'team' as const, teamId: sides.Hawks.team.id }, memberB: { kind: 'team' as const, teamId: sides.Wolves.team.id } };
    swapPreview = expectOk(await harness.app.tournaments.previewChange(tournamentId, swap));
    const { snapshot } = await evaluate();
    const added = expectOk(
      await harness.app.tournaments.addFixture({
        id: harness.app.newId(),
        tournamentId,
        stageId: group.id,
        poolId: null,
        matchNumber: 99,
        label: 'Exhibition',
        round: null,
        leg: null,
        bracket: null,
        isFinal: false,
        sideA: { kind: 'team', teamId: sides.Lions.team.id },
        sideB: { kind: 'team', teamId: sides.Bulls.team.id },
        scheduledDate: null,
        scheduledTime: null,
        venueId: null,
        status: 'scheduled',
        formatId: null,
        matchRules: null,
        notes: null,
      }),
    );
    expect(added.version).not.toBe(snapshot.version);
    const poolTeamsBefore = await harness.db.getAllAsync('SELECT pool_id, team_id FROM pool_teams ORDER BY pool_id, team_id');
    expectFailure(await harness.app.tournaments.applyChange(tournamentId, swap, null, swapPreview), 'CONFLICT');
    expect(await harness.db.getAllAsync('SELECT pool_id, team_id FROM pool_teams ORDER BY pool_id, team_id')).toEqual(poolTeamsBefore);
    const exhibition = added.fixtures.find((fixture) => fixture.label === 'Exhibition');
    if (exhibition === undefined) {
      throw new Error('exhibition missing');
    }
    expect(exhibition.matchNumber).toBe(99);
    const removal = { kind: 'fixture_delete' as const, fixtureId: exhibition.id };
    const preview = expectOk(await harness.app.tournaments.previewChange(tournamentId, removal));
    expectOk(await harness.app.tournaments.applyChange(tournamentId, removal, null, preview));
    expect(await rowCount(harness.db, 'fixtures')).toBe(15);
    await recordRevision();
  });

  it('IT-T-11 starting the first match activates the tournament and the group stage', async () => {
    const { snapshot } = await evaluate();
    const fixture = fixtureBetween(snapshot, sides.Lions, sides.Tigers);
    const [sideA, sideB] = fixtureSides(fixture);
    const before = await revision();
    const match = expectOk(
      await harness.app.tournaments.startFixtureMatch(fixture.id, { squads: squadsFor(sideA, sideB), toss: { winnerTeamId: sides.Lions.team.id, decision: 'bat' } }),
    );
    firstMatch = match;
    expect(match.tournamentId).toBe(tournamentId);
    expect(match.fixtureId).toBe(fixture.id);
    expect([match.teamAId, match.teamBId]).toEqual([sideA.team.id, sideB.team.id]);
    const after = await evaluate();
    expect(after.snapshot.fixtures.find((entry) => entry.id === fixture.id)?.matchSides).toEqual({ teamAId: match.teamAId, teamBId: match.teamBId });
    expect(after.snapshot.tournament.status).toBe('active');
    expect(after.snapshot.stages.find((stage) => stage.id === group.id)?.status).toBe('active');
    expect(await revision()).toBeGreaterThan(before);
    await recordRevision();
  });

  it('IT-T-12 match 1 updates the Pool A table', async () => {
    await playGroupMatch('Lions', 'Tigers', play('Lions', 'Tigers', line(30, 2, 12), line(20, 4, 12)), firstMatch);
    const { snapshot, evaluation } = await evaluate();
    const rows = poolTable(evaluation, snapshot, 'Pool A');
    expect(row(rows, 'Lions')).toMatchObject({ played: 1, won: 1, points: 2 });
    expect(row(rows, 'Lions').nrr).toBeCloseTo(5, 6);
    expect(row(rows, 'Tigers')).toMatchObject({ played: 1, lost: 1 });
    expect(row(rows, 'Tigers').nrr).toBeCloseTo(-5, 6);
    expect(row(rows, 'Eagles')).toMatchObject({ played: 0, nrr: null });
    expect(row(rows, 'Hawks')).toMatchObject({ played: 0, nrr: null });
    expect(evaluation.progress).toEqual({ done: 1, total: 15 });
  });

  it('IT-T-31 refuses to remove a team that has fixtures', async () => {
    expectFailure(await harness.app.tournaments.removeTeams(tournamentId, [sides.Hawks.team.id]), 'FORBIDDEN_STATE');
  });

  it('IT-T-13 matches 1-4 give mathematical certainty where it exists', async () => {
    await playGroupMatch('Eagles', 'Hawks', play('Eagles', 'Hawks', line(18, 3, 12), line(16, 4, 12)));
    await playGroupMatch('Lions', 'Eagles', play('Lions', 'Eagles', line(26, 1, 12), line(22, 4, 12)));
    await playGroupMatch('Tigers', 'Hawks', play('Tigers', 'Hawks', line(24, 3, 12), line(12, 5, 9)));
    const { snapshot, evaluation } = await evaluate();
    const rows = poolTable(evaluation, snapshot, 'Pool A');
    expect(row(rows, 'Lions')).toMatchObject({ points: 4, played: 2 });
    expect(row(rows, 'Tigers').points).toBe(2);
    expect(row(rows, 'Eagles').points).toBe(2);
    expect(row(rows, 'Hawks').points).toBe(0);
    expect(qualification(evaluation, 'Lions')).toMatchObject({ state: 'qualified', certainty: 'mathematical' });
    expect(qualification(evaluation, 'Hawks')).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    expect(qualification(evaluation, 'Tigers').state).toBe('in_contention');
    expect(qualification(evaluation, 'Eagles').state).toBe('in_contention');
    expect(slot(evaluation, snapshot, 'A1')).toMatchObject({ teamId: sides.Lions.team.id, status: 'provisional' });
  });

  it('IT-T-14 completes Pool A exactly as U-STD-01', async () => {
    await playGroupMatch('Hawks', 'Lions', play('Hawks', 'Lions', line(20, 4, 12), line(21, 1, 10)));
    match6Id = await playGroupMatch(
      'Tigers',
      'Eagles',
      play('Tigers', 'Eagles', { balls: [6, 1, 4, 1, 2, 0, 'W', 4, 1, 'W', 2, 4] }, { balls: [1, 'W', 2, 1, 'W', 4, 2, 'W', 1, 'W', 4, 4] }),
    );
    const { snapshot, evaluation } = await evaluate();
    const rows = poolTable(evaluation, snapshot, 'Pool A');
    expect(order(rows)).toEqual(['Lions', 'Tigers', 'Eagles', 'Hawks']);
    expect(rows.map((entry) => entry.points)).toEqual([6, 4, 2, 0]);
    expect(rows.map((entry) => Number((entry.nrr ?? 0).toFixed(3)))).toEqual([3.255, 1.333, -1.333, -3.118]);
    expect(row(rows, 'Lions')).toMatchObject({ runsScored: 77, ballsFaced: 34, runsConceded: 62, ballsBowled: 36 });
    expect(row(rows, 'Hawks')).toMatchObject({ runsScored: 48, ballsFaced: 36 });
    expect(poolStandings(evaluation, snapshot, 'Pool A').complete).toBe(true);
    expect(slot(evaluation, snapshot, 'A1')).toMatchObject({ teamId: sides.Lions.team.id, status: 'final' });
    expect(slot(evaluation, snapshot, 'A2')).toMatchObject({ teamId: sides.Tigers.team.id, status: 'final' });
    expect(qualification(evaluation, 'Tigers').explanation).toMatch(/^Tigers have mathematically qualified for the Knockouts as Pool A runners-up/);
  });

  it('IT-T-15 completes Pool B with a three-way tie separated by NRR', async () => {
    await playGroupMatch('Bulls', 'Bears', play('Bulls', 'Bears', line(28, 3, 12), line(22, 4, 12)));
    await playGroupMatch('Cobras', 'Wolves', play('Cobras', 'Wolves', line(20, 2, 12), line(14, 4, 12)));
    await playGroupMatch('Bulls', 'Cobras', play('Bulls', 'Cobras', line(24, 2, 12), line(25, 1, 11)));
    await playGroupMatch('Bears', 'Wolves', play('Bears', 'Wolves', line(26, 2, 12), line(18, 5, 10)));
    await playGroupMatch('Wolves', 'Bulls', play('Wolves', 'Bulls', line(15, 3, 12), line(16, 0, 8)));
    await playGroupMatch('Bears', 'Cobras', play('Bears', 'Cobras', line(21, 4, 12), line(20, 3, 12)));
    const { snapshot, evaluation } = await evaluate();
    const rows = poolTable(evaluation, snapshot, 'Pool B');
    expect(order(rows)).toEqual(['Bulls', 'Cobras', 'Bears', 'Wolves']);
    expect(rows.map((entry) => entry.points)).toEqual([4, 4, 4, 0]);
    expect(rows.map((entry) => Number((entry.nrr ?? 0).toFixed(3)))).toEqual([2.121, 1.31, 0.5, -3.792]);
    expect(row(rows, 'Bulls').tieBreak?.separatedBy).toBe('nrr');
    expect(poolStandings(evaluation, snapshot, 'Pool B').unresolvedTies).toEqual([]);
    expect(snapshot.stages.find((stage) => stage.id === group.id)?.status).toBe('completed');
    expect(evaluation.progress).toEqual({ done: 12, total: 15 });
    expect(evaluation.currentStageId).toBe(knockouts.id);
  });

  it('IT-T-16 resolves the knockout sides', async () => {
    const { snapshot, evaluation } = await evaluate();
    expect(slot(evaluation, snapshot, 'B1')).toMatchObject({ teamId: sides.Bulls.team.id, status: 'final' });
    expect(slot(evaluation, snapshot, 'B2')).toMatchObject({ teamId: sides.Cobras.team.id, status: 'final' });
    expect(resolveFixtureTeams(evaluation, knockoutFixture(snapshot, 1, 0))).toEqual({ a: sides.Lions.team.id, b: sides.Cobras.team.id, frozen: false });
    expect(resolveFixtureTeams(evaluation, knockoutFixture(snapshot, 1, 1))).toEqual({ a: sides.Bulls.team.id, b: sides.Tigers.team.id, frozen: false });
    expect(resolveFixtureTeams(evaluation, knockoutFixture(snapshot, 2, 0))).toEqual({ a: null, b: null, frozen: false });
    for (const name of ['Eagles', 'Hawks', 'Bears', 'Wolves']) {
      expect(qualification(evaluation, name)).toMatchObject({ state: 'eliminated', certainty: 'mathematical' });
    }
  });

  it('IT-T-17 semifinal 1 is won by Lions', async () => {
    const { snapshot } = await evaluate();
    const sf1 = knockoutFixture(snapshot, 1, 0);
    const played = await playFixture(harness.app, sf1, play('Lions', 'Cobras', line(32, 2, 12), line(28, 4, 12)), sides.Lions, sides.Cobras);
    expect(played.match.rules.superOver.enabled).toBe(true);
    const after = await evaluate();
    expect(after.snapshot.fixtures.find((fixture) => fixture.id === sf1.id)?.matchSides).toEqual({ teamAId: sides.Lions.team.id, teamBId: sides.Cobras.team.id });
    expect(after.snapshot.stages.find((stage) => stage.id === knockouts.id)?.status).toBe('active');
    expect(played.state.resultText).toBe('Lions won by 4 runs');
    expect(slot(after.evaluation, after.snapshot, 'Winner SF1')).toMatchObject({ teamId: sides.Lions.team.id, status: 'final' });
    await recordRevision();
  });

  it('IT-T-18 semifinal 2 is decided by a super over', async () => {
    const { snapshot } = await evaluate();
    const sf2 = knockoutFixture(snapshot, 1, 1);
    const played = await playFixture(
      harness.app,
      sf2,
      { ...play('Bulls', 'Tigers', line(27, 3, 12), line(27, 4, 12)), superOver: { first: [4, 1, 'W', 1, 2, 0], second: [4, 4, 1] } },
      sides.Bulls,
      sides.Tigers,
    );
    expect(played.state.result).toEqual({ type: 'tie', decider: { method: 'super_over', winnerTeamId: sides.Bulls.team.id, superOverRounds: 1 } });
    expect(played.state.resultText).toBe('Match tied — Bulls won the Super Over');
    const after = await evaluate();
    expect(after.snapshot.summaries[played.match.id].superOvers).toHaveLength(2);
    expect(slot(after.evaluation, after.snapshot, 'Winner SF2')).toMatchObject({ teamId: sides.Bulls.team.id });
    expect(order(poolTable(after.evaluation, after.snapshot, 'Pool A'))).toEqual(['Lions', 'Tigers', 'Eagles', 'Hawks']);
    expect(order(poolTable(after.evaluation, after.snapshot, 'Pool B'))).toEqual(['Bulls', 'Cobras', 'Bears', 'Wolves']);
    await recordRevision();
  });

  let correction: readonly HistoryEditOp[];

  it('IT-T-19 previews a correction of match 6 after the semifinal was played', async () => {
    const loaded = await live(harness.app, match6Id);
    const deliveries = loaded.events.filter((event): event is MatchEvent & DeliveryPayload => event.kind === 'delivery');
    const zero = (event: MatchEvent & DeliveryPayload): DeliveryPayload => ({
      kind: 'delivery',
      strikerId: event.strikerId,
      nonStrikerId: event.nonStrikerId,
      bowlerId: event.bowlerId,
      runsRun: 0,
      shortRuns: 0,
      boundary: 0,
      wicket: null,
      call: 'fair',
      runsTo: 'bat',
    });
    correction = [
      { op: 'replace', seq: deliveries[0].seq, with: [zero(deliveries[0])] },
      { op: 'replace', seq: deliveries[2].seq, with: [zero(deliveries[2])] },
    ];
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(match6Id, correction));
    expect(preview.outcome.after.innings[0]).toMatchObject({ runs: 15, wickets: 2 });
    expect(preview.outcome.after.innings[1]).toMatchObject({ runs: 19, wickets: 4, legalBalls: 12 });
    expect(preview.outcome.after.innings[1].target?.runs).toBe(16);
    expect(preview.outcome.resultChanged).toBe(true);
    expect(preview.requiresReason).toBe(true);
    const impact = preview.impact;
    expect(impact).not.toBeNull();
    const a2 = impact?.slots.find((change) => change.label === 'A2');
    expect(a2).toMatchObject({ beforeTeamId: sides.Tigers.team.id, afterTeamId: sides.Eagles.team.id, playedFixtureIds: [knockoutFixture((await evaluate()).snapshot, 1, 1).id] });
  });

  it('IT-T-20 applies the correction, keeping the played semifinal frozen', async () => {
    const before = await revision();
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(match6Id, correction));
    expectFailure(await harness.app.matches.applyHistoryEdit(match6Id, correction, null, preview.baseFingerprint), 'CONFIRMATION_REQUIRED');
    expectOk(await harness.app.matches.applyHistoryEdit(match6Id, correction, 'Scorer entered a six by mistake', preview.baseFingerprint));
    const audit = await harness.db.getFirstAsync<{ action: string; previous_json: string; new_json: string; impact_json: string; reason: string }>(
      "SELECT action, previous_json, new_json, impact_json, reason FROM audit_events WHERE action = 'result_corrected'",
    );
    expect(audit?.reason).toBe('Scorer entered a six by mistake');
    expect(JSON.parse(audit?.previous_json ?? '[]')).toHaveLength(2);
    expect(JSON.parse(audit?.new_json ?? '[]')).toHaveLength(2);
    expect(JSON.parse(audit?.impact_json ?? 'null')).toEqual(JSON.parse(JSON.stringify(preview.impact)));
    const { snapshot, evaluation } = await evaluate();
    const rows = poolTable(evaluation, snapshot, 'Pool A');
    expect(order(rows)).toEqual(['Lions', 'Eagles', 'Tigers', 'Hawks']);
    expect(row(rows, 'Eagles').points).toBe(4);
    expect(row(rows, 'Tigers').points).toBe(2);
    const sf2 = knockoutFixture(snapshot, 1, 1);
    expect(sf2.matchSides).toEqual({ teamAId: sides.Bulls.team.id, teamBId: sides.Tigers.team.id });
    expect(resolveFixtureTeams(evaluation, sf2).frozen).toBe(true);
    expect(slot(evaluation, snapshot, 'Winner SF2').teamId).toBe(sides.Bulls.team.id);
    expect(await revision()).toBeGreaterThan(before);
    await recordRevision();
  });

  it('IT-T-21 the final decides the champion', async () => {
    const { snapshot, evaluation } = await evaluate();
    const final = knockoutFixture(snapshot, 2, 0);
    expect(resolveFixtureTeams(evaluation, final)).toMatchObject({ a: sides.Lions.team.id, b: sides.Bulls.team.id });
    const played = await playFixture(harness.app, final, play('Bulls', 'Lions', line(30, 3, 12), line(31, 2, 11)), sides.Lions, sides.Bulls);
    expect(played.state.resultText).toBe('Lions won by 3 wickets (1 ball left)');
    const after = await evaluate();
    expect(after.evaluation.champion).toEqual({ teamIds: [sides.Lions.team.id], basis: 'final', fixtureId: final.id });
    const champion = await harness.db.getFirstAsync<{ champion_json: string }>('SELECT champion_json FROM tournaments WHERE id = ?', [tournamentId]);
    expect(JSON.parse(champion?.champion_json ?? 'null')).toEqual([sides.Lions.team.id]);
    expect(after.evaluation.progress).toEqual({ done: 15, total: 15 });
    await recordRevision();
  });

  it('IT-T-32 refuses to delete the played final', async () => {
    const { snapshot } = await evaluate();
    const change = { kind: 'fixture_delete' as const, fixtureId: knockoutFixture(snapshot, 2, 0).id };
    const preview = expectOk(await harness.app.tournaments.previewChange(tournamentId, change));
    expect(preview.impact.blocked).not.toBeNull();
    expect(preview.impact.severity).toBe('destructive');
    expect((await harness.app.tournaments.applyChange(tournamentId, change, 'test', preview)).ok).toBe(false);
  });

  it('IT-T-22 completes the tournament', async () => {
    expectOk(await harness.app.tournaments.setStatus(tournamentId, 'completed', null));
    const [item] = expectOk(await harness.app.tournaments.list());
    expect(item).toMatchObject({ championName: 'Lions', fixturesDone: 15, fixturesTotal: 15, status: 'completed' });
    expect(await rowCount(harness.db, 'audit_events', "action = 'tournament_status_changed' AND new_json LIKE '%completed%'")).toBe(1);
    evaluationBeforeRestart = (await evaluate()).evaluation;
    await recordRevision();
  });

  it('IT-T-23 evaluates identically after a cold restart', async () => {
    const restarted = await coldRestart(harness);
    harness = restarted;
    expect(restarted.report.resumable).toEqual([]);
    const { snapshot, evaluation } = await evaluate();
    expect(evaluation).toEqual(evaluationBeforeRestart);
    expect(snapshot.staleSummaryMatchIds).toEqual([]);
  });

  it('IT-T-24 computes tournament statistics', async () => {
    const stats = expectOk(await harness.app.tournaments.stats(tournamentId));
    expect(stats.totalMatches).toBe(15);
    expect(stats.completedMatches).toBe(15);
    const lionsStats = stats.teams.find((entry) => entry.teamId === sides.Lions.team.id);
    expect(lionsStats).toMatchObject({ points: 6, wins: 5 });
    expect(Number((lionsStats?.nrr ?? 0).toFixed(3))).toBe(3.255);
    expect(stats.players.every((entry) => entry.matches >= 1)).toBe(true);
    const { snapshot } = await evaluate();
    const regularRuns = Object.values(snapshot.summaries).reduce((sum, summary) => sum + summary.innings.reduce((total, innings) => total + innings.runs, 0), 0);
    expect(stats.totalRuns).toBe(regularRuns);
  });

  it('IT-T-25 keeps a complete, paged audit log', async () => {
    const entries = expectOk(await harness.app.tournaments.auditLog(tournamentId, { limit: 500 }));
    const count = (action: string) => entries.filter((entry) => entry.action === action).length;
    expect(count('tournament_created')).toBe(1);
    expect(count('team_added')).toBeGreaterThanOrEqual(1);
    expect(count('stage_created')).toBeGreaterThanOrEqual(1);
    expect(count('pools_generated') + count('pools_replaced')).toBeGreaterThanOrEqual(1);
    expect(count('fixtures_generated')).toBe(2);
    expect(count('match_started')).toBe(15);
    expect(count('result_recorded')).toBe(15);
    expect(count('result_corrected')).toBe(1);
    expect(count('tournament_status_changed')).toBeGreaterThanOrEqual(1);
    const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    expect(entries.map((entry) => entry.createdAt)).toEqual(sorted.map((entry) => entry.createdAt));
    const firstPage = expectOk(await harness.app.tournaments.auditLog(tournamentId, { limit: 5 }));
    const secondPage = expectOk(await harness.app.tournaments.auditLog(tournamentId, { limit: 5, before: firstPage[4].createdAt }));
    expect(secondPage.every((entry) => entry.createdAt < firstPage[4].createdAt)).toBe(true);
  });

  it('IT-T-26 leaves a consistent database with a strictly increasing revision', async () => {
    expect(await foreignKeyCheck(harness.db)).toEqual([]);
    const links = await harness.db.getAllAsync<{ fixture_id: string; match_fixture: string | null }>(
      'SELECT f.id AS fixture_id, m.fixture_id AS match_fixture FROM fixtures f JOIN matches m ON m.id = f.match_id',
    );
    expect(links).toHaveLength(15);
    expect(links.every((link) => link.fixture_id === link.match_fixture)).toBe(true);
    revisions.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(revisions[index]));
  });

  it('IT-T-33 refuses to discard a tournament match', async () => {
    const [first] = expectOk(await harness.app.matches.list({ tournamentId, sort: 'oldest' }));
    expectFailure(await harness.app.matches.discard(first.id), 'FORBIDDEN_STATE');
  });

  it('IT-T-34 protects the tournament from accidental deletion', async () => {
    const footprint = expectOk(await harness.app.tournaments.previewDelete(tournamentId));
    expect(footprint).toMatchObject({ matches: 15, completedMatches: 15 });
    expect(footprint.events).toBeGreaterThan(0);
    expectFailure(await harness.app.tournaments.delete(tournamentId, { typedName: 'Scorebook Cup', deleteCompletedMatches: false }), 'CONFIRMATION_REQUIRED');
    expectFailure(await harness.app.tournaments.delete(tournamentId, { typedName: 'Scorebook', deleteCompletedMatches: true }), 'VALIDATION');
    expect(await rowCount(harness.db, 'matches')).toBe(15);
  });
});

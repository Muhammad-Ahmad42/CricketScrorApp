import '@/ui/testing';
import { DEFAULT_TIE_BREAKERS } from '@/domain/tournament/defaults';
import type { FixtureSide } from '@/domain/types';
import { STRUCTURE_KIND_KEY, isSetupStatus, legsLabel } from '../labels';
import { routeParam, routes } from '../routes';
import { compareDates, formatDate, formatDateRange, formatDateTime, isValidIsoDate, isValidLocalTime } from '../selectors/dates';
import { emptyListText, filterTournaments, tournamentRowVM } from '../selectors/list';
import { letterFor, tournamentIndex } from '../selectors/names';
import { drawRandom, drawSeeded, parseSeed, unassignedMembers, warningsFor } from '../selectors/poolDraw';
import { guardContext, statusActions } from '../selectors/policy';
import { parseTimes } from '../selectors/planPreview';
import { outcomeLabel, parseOvers, scoreFromInput } from '../selectors/whatIf';
import { nextStep, previousStep, stepNumber } from '../wizard/steps';
import { defaultPoolCount, defaultRules, structureFromKind, withPoolCount, removeStage, moveStage } from '../wizard/structure';
import { chainError, infoErrors, rulesErrors, structureError, teamsError } from '../wizard/validation';
import { listItem } from './support/harness';
import { counter, cupSnapshot, evaluated, playToChampion } from './support/tournament';

jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

const AT = '2026-09-01T10:00:00.000Z';

function teams(count: number): readonly FixtureSide[] {
  return Array.from({ length: count }, (_, index) => ({ kind: 'team', teamId: `T${index + 1}` }));
}

describe('dates', () => {
  it('validates and formats dates and times', () => {
    expect(isValidIsoDate('2026-09-14')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidLocalTime('23:59')).toBe(true);
    expect(isValidLocalTime('24:00')).toBe(false);
    expect(formatDate('2026-09-14')).toBe('Mon 14 Sep');
    expect(formatDateTime('2026-09-14', '10:00')).toBe('Mon 14 Sep 10:00');
    expect(formatDateTime(null, null)).toBeNull();
    expect(formatDateRange('2026-09-12', '2026-10-04')).toBe('Sat 12 Sep – Sun 4 Oct');
    expect(compareDates(null, '2026-01-01')).toBe(1);
  });
});

describe('labels and routes', () => {
  it('maps statuses and kinds to organizer words', () => {
    expect(isSetupStatus('pools_configured')).toBe(true);
    expect(isSetupStatus('active')).toBe(false);
    expect(STRUCTURE_KIND_KEY.groups_knockout).toBe('groups-knockout');
    expect(legsLabel(2)).toBe('double round robin');
  });

  it('builds hrefs for the documented routes (ARCHITECTURE §9)', () => {
    expect(routes.wizardStep('pools')).toBe('/tournament/new/pools');
    expect(routes.fixture('t1', 'f1')).toEqual({ pathname: '/tournament/[tournamentId]/fixtures/[fixtureId]', params: { tournamentId: 't1', fixtureId: 'f1' } });
    expect(routes.matchSetup('t1', 'f1')).toEqual({ pathname: '/match/new', params: { tournamentId: 't1', fixtureId: 'f1' } });
    expect(routeParam(['a', 'b'])).toBe('a');
    expect(routeParam(undefined)).toBe('');
  });
});

describe('tournament list', () => {
  it('filters by status group and sorts by recency', () => {
    const items = [
      listItem({ id: 'a', status: 'active', updatedAt: '2026-01-01T00:00:00.000Z' }),
      listItem({ id: 'b', status: 'draft', updatedAt: '2026-03-01T00:00:00.000Z' }),
      listItem({ id: 'c', status: 'archived', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(filterTournaments(items, 'all').map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(filterTournaments(items, 'drafts').map((item) => item.id)).toEqual(['b']);
    expect(filterTournaments(items, 'completed').map((item) => item.id)).toEqual(['c']);
    expect(emptyListText('drafts')).toBe('No drafts.');
  });

  it('describes a row with progress and champion', () => {
    const row = tournamentRowVM(listItem({ championName: 'Tigers', status: 'completed' }));
    expect(row).toMatchObject({ name: 'City Cup 2026', statusLabel: 'Completed', progressText: '24/48 played', champion: 'Tigers', draft: false });
    expect(tournamentRowVM(listItem({ status: 'registration' })).progressText).toBeNull();
  });
});

describe('names index', () => {
  it('letters pools like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27].map(letterFor)).toEqual(['a', 'b', 'z', 'aa', 'ab']);
  });

  it('resolves slot sides and memoises per snapshot and evaluation', () => {
    const data = evaluated(cupSnapshot());
    const index = tournamentIndex(data.snapshot, data.evaluation);
    expect(tournamentIndex(data.snapshot, data.evaluation)).toBe(index);
    const semi = data.snapshot.fixtures.find((fixture) => fixture.bracket?.round === 1);
    expect(semi && index.fixtureSides(semi).a).toMatchObject({ text: 'A1', resolved: false });
    expect(index.poolKey(data.snapshot.pools[0].id)).toBe('a');
  });
});

describe('policy', () => {
  it('derives the guard context and status actions', () => {
    const data = evaluated(playToChampion(cupSnapshot()));
    const index = tournamentIndex(data.snapshot, data.evaluation);
    expect(guardContext(index)).toMatchObject({ activeTeamCount: 8, stageCount: 2, championDecided: true, matchesCompleted: 15 });
    expect(statusActions(index)).toEqual([expect.objectContaining({ to: 'completed', enabled: true, testID: 'tmanage-btn-complete' })]);
  });
});

describe('pool draws (§30–§32)', () => {
  const pools = [
    { poolId: 'pa', name: 'Pool A' },
    { poolId: 'pb', name: 'Pool B' },
    { poolId: 'pc', name: 'Pool C' },
  ];

  it('is reproducible from a seed and keeps pool names', () => {
    const first = drawRandom(teams(10), pools, 847291);
    const second = drawRandom(teams(10), pools, parseSeed('847291') ?? 0);
    expect(second).toEqual(first);
    expect(first.pools.map((pool) => pool.members.length)).toEqual([4, 3, 3]);
    expect(first.pools.map((pool) => pool.name)).toEqual(['Pool A', 'Pool B', 'Pool C']);
    expect(warningsFor(first, teams(10)).map((warning) => warning.code)).toContain('UNEVEN_POOLS');
    expect(parseSeed('   ')).toBeNull();
  });

  it('deals seeded teams in snake order', () => {
    const seeded = drawSeeded(
      Array.from({ length: 6 }, (_, index) => ({ teamId: `T${index + 1}`, seed: index + 1, name: `T${index + 1}` })),
      pools,
    );
    expect(seeded.pools.map((pool) => pool.members.map((side) => (side.kind === 'team' ? side.teamId : '')))).toEqual([
      ['T1', 'T6'],
      ['T2', 'T5'],
      ['T3', 'T4'],
    ]);
  });

  it('lists unassigned entrants', () => {
    const assignment = { seed: null, pools: [{ poolId: 'pa', name: 'Pool A', members: teams(2) }] };
    expect(unassignedMembers(assignment, teams(3))).toEqual([{ kind: 'team', teamId: 'T3' }]);
  });
});

describe('wizard structure (§28, §29)', () => {
  const ctx = { tournamentId: 't1', now: AT, ids: counter('id'), teamCount: 12 };

  it('chooses sensible pool counts', () => {
    expect([4, 6, 8, 10, 12, 16, 128].map(defaultPoolCount)).toEqual([1, 2, 2, 3, 3, 4, 32]);
  });

  it('builds groups + knockout and re-expands slots when the pool count changes', () => {
    const structure = structureFromKind('groups_knockout', defaultRules('t1', AT), ctx);
    expect(structure.stages.map((stage) => stage.type)).toEqual(['group', 'knockout']);
    expect(structure.stages.filter((stage) => stage.config.decidesChampion)).toHaveLength(1);
    expect(structure.slots.map((slot) => slot.label)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
    const two = withPoolCount(structure, structure.stages[0].id, 2, 12, ctx.ids);
    expect(two.pools.filter((pool) => pool.stageId === structure.stages[0].id)).toHaveLength(2);
    expect(two.slots.map((slot) => slot.label)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(two.slots[0].id).toBe(structure.slots[0].id);
  });

  it('moves and removes stages keeping one champion', () => {
    const structure = structureFromKind('groups_knockout', defaultRules('t1', AT), ctx);
    const removed = removeStage(structure, structure.stages[1].id, 12, ctx.ids);
    expect(removed.stages).toHaveLength(1);
    expect(removed.stages[0].config.decidesChampion).toBe(true);
    const moved = moveStage(structure, structure.stages[1].id, -1, 12, ctx.ids);
    expect(moved.stages.find((stage) => stage.id === structure.stages[1].id)?.orderIndex).toBe(0);
  });
});

describe('wizard validation and steps', () => {
  it('validates each step', () => {
    const info = { name: ' ', season: null, description: null, organizer: null, startDate: '2026-09-12', endDate: '2026-09-01', venueIds: [], structureKind: 'league' as const, templateId: null };
    expect(infoErrors(info)).toEqual({ name: 'Enter a tournament name.', startDate: null, endDate: 'The end date is before the start date.' });
    expect(teamsError([{ teamId: 'a', seed: null }])).toBe('Add at least 2 teams');
    expect(teamsError([{ teamId: 'a', seed: 1 }, { teamId: 'b', seed: 1 }])).toBe('Two teams have the same seed.');
    expect(structureError([])).toBe('Choose a template or a structure.');
    expect(chainError(['nrr', 'points'])).toBe('Points must come first.');
    expect(chainError(DEFAULT_TIE_BREAKERS)).toBeNull();
    expect(rulesErrors(defaultRules('t1', AT))).toEqual([]);
  });

  it('walks the seven steps in order', () => {
    expect(stepNumber('pools')).toBe(5);
    expect(nextStep('fixtures')).toBe('review');
    expect(nextStep('review')).toBeNull();
    expect(previousStep('info')).toBeNull();
    expect(previousStep('teams')).toBe('info');
  });
});

describe('what-if inputs (§48)', () => {
  it('parses overs and scores', () => {
    expect(parseOvers('19.3', 6)).toBe(117);
    expect(parseOvers('19.6', 6)).toBeNull();
    expect(parseOvers('20', 6)).toBe(120);
    expect(scoreFromInput({ battingFirst: 'side_b', firstRuns: '150', firstOvers: '20', secondRuns: 'x', secondOvers: '18' }, 6)).toBeNull();
    expect(outcomeLabel('side_a_walkover', { a: { text: 'Lions', teamId: 'LIO', slotLabel: null, meaning: null, resolved: true, provisional: false }, b: { text: 'Tigers', teamId: 'TIG', slotLabel: null, meaning: null, resolved: true, provisional: false } })).toBe(
      'Walkover to Lions',
    );
  });

  it('parses schedule times', () => {
    expect(parseTimes('10:00, 14:30')).toEqual(['10:00', '14:30']);
    expect(parseTimes('10am')).toBeNull();
  });
});

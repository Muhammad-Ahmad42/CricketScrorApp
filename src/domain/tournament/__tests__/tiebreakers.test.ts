import type { TieBreakerKind } from '@/domain/types';
import { TIE_BREAKER_KINDS } from '@/domain/types';
import { describeTieBreakerChain, rankTeams, tieBreakerLabel } from '../tiebreakers';
import type { RankedTeam } from '../tiebreakers';
import { DEFAULT_TIE_BREAKERS } from '../defaults';
import { rankContext, teamRecord, tieResolution } from './standingsKit/records';

const order = (ranked: readonly RankedTeam[]) => ranked.map((team) => team.teamId);
const byId = (ranked: readonly RankedTeam[], id: string) => ranked.find((team) => team.teamId === id)!;

const cycle = [
  { a: 'A', b: 'B', winner: 'A' },
  { a: 'B', b: 'C', winner: 'B' },
  { a: 'C', b: 'A', winner: 'C' },
  { a: 'A', b: 'D', winner: 'A' },
  { a: 'B', b: 'D', winner: 'B' },
  { a: 'C', b: 'D', winner: 'C' },
];

describe('rankTeams', () => {
  it('U-TB-01 head-to-head before NRR', () => {
    const records = [teamRecord('A', { nrr: 1.2 }), teamRecord('B', { nrr: 0.3 })];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext([{ a: 'A', b: 'B', winner: 'B' }]));
    expect(order(ranked)).toEqual(['B', 'A']);
    expect(byId(ranked, 'B')).toMatchObject({ position: 1, separatedBy: 'head_to_head', shared: false });
    expect(byId(ranked, 'B').detail).toBe('Ahead of A on head-to-head (2 pts vs 0 pts among A, B)');
    expect(byId(ranked, 'A')).toMatchObject({ position: 2, separatedBy: null, detail: '' });
  });

  it('U-TB-02 NRR before head-to-head', () => {
    const records = [teamRecord('A', { nrr: 1.2 }), teamRecord('B', { nrr: 0.3 })];
    const ranked = rankTeams(records, ['points', 'nrr', 'head_to_head'], rankContext([{ a: 'A', b: 'B', winner: 'B' }]));
    expect(order(ranked)).toEqual(['A', 'B']);
    expect(byId(ranked, 'A').separatedBy).toBe('nrr');
    expect(byId(ranked, 'A').detail).toBe('Ahead of B on net run rate (+1.200 vs +0.300)');
  });

  it('wave-3 QA: NRR against a team that has no net run rate yet says so instead of "vs –"', () => {
    const records = [teamRecord('EEG', { points: 0, nrr: -1.554 }), teamRecord('SBS', { points: 0, nrr: null })];
    const ranked = rankTeams(records, ['points', 'nrr', 'head_to_head'], rankContext([]));
    const detail = ranked[0].detail;
    expect(detail).not.toContain('vs –');
    expect(detail).toMatch(/^Ahead of (EEG|SBS) on net run rate \(|^Ahead of (EEG|SBS); neither team has a net run rate yet$/);
    const upper = ranked[0].teamId;
    const lower = ranked[1].teamId;
    expect(detail).toBe(
      upper === 'EEG'
        ? `Ahead of ${lower} on net run rate (-1.554; ${lower} have no net run rate yet)`
        : `Ahead of ${lower} on net run rate (no net run rate yet vs -1.554)`,
    );
  });

  it('U-TB-03 three-way cycle leaves the mini-league level and NRR decides', () => {
    const records = [
      teamRecord('A', { nrr: 0.8 }),
      teamRecord('B', { nrr: 0.5 }),
      teamRecord('C', { nrr: 0.2 }),
      teamRecord('D', { points: 0, nrr: -1.5 }),
    ];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(cycle));
    expect(order(ranked)).toEqual(['A', 'B', 'C', 'D']);
    expect(byId(ranked, 'A').separatedBy).toBe('nrr');
    expect(byId(ranked, 'B').separatedBy).toBe('nrr');
    expect(byId(ranked, 'C').separatedBy).toBe('points');
    expect(byId(ranked, 'C').detail).toBe('4 pts, 4 ahead of D');
  });

  it('U-TB-04 head-to-head separates all three and outranks NRR', () => {
    const records = [teamRecord('A', { nrr: 0.1 }), teamRecord('B', { nrr: 0.4 }), teamRecord('C', { nrr: 0.9 })];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'A', b: 'C', winner: 'A' },
      { a: 'B', b: 'C', winner: 'B' },
    ];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(results));
    expect(order(ranked)).toEqual(['A', 'B', 'C']);
    expect(byId(ranked, 'A').separatedBy).toBe('head_to_head');
    expect(byId(ranked, 'B').separatedBy).toBe('head_to_head');
    expect(byId(ranked, 'A').detail).toBe('Ahead of B on head-to-head (4 pts vs 2 pts among A, B, C)');
  });

  it('U-TB-05 the next criterion is recomputed for the level subgroup only', () => {
    const records = [teamRecord('A', { nrr: 0.9 }), teamRecord('B', { nrr: 0.25 }), teamRecord('C', { nrr: 0.25 })];
    const ranked = rankTeams(records, ['points', 'nrr', 'head_to_head'], rankContext(cycle));
    expect(order(ranked)).toEqual(['A', 'B', 'C']);
    expect(byId(ranked, 'A').separatedBy).toBe('nrr');
    expect(byId(ranked, 'B')).toMatchObject({ position: 2, separatedBy: 'head_to_head', shared: false });
    expect(byId(ranked, 'B').detail).toBe('Ahead of C on head-to-head (2 pts vs 0 pts among B, C)');
    expect(byId(ranked, 'C').position).toBe(3);
  });

  it('U-TB-06 no restart: a residual pair stays level when the chain is exhausted', () => {
    const records = [teamRecord('A', { nrr: 0.9 }), teamRecord('C', { nrr: 0.3 }), teamRecord('B', { nrr: 0.3 })];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(cycle));
    expect(order(ranked)).toEqual(['A', 'C', 'B']);
    expect(byId(ranked, 'C')).toMatchObject({ position: 2, shared: true, separatedBy: null, detail: 'Level with B' });
    expect(byId(ranked, 'B')).toMatchObject({ position: 2, shared: true });
  });

  it('repeating head-to-head in the chain re-applies it to the residual pair', () => {
    const records = [teamRecord('A', { nrr: 0 }), teamRecord('B', { nrr: 0.1 }), teamRecord('C', { nrr: 0.8 }), teamRecord('D', { nrr: 0 })];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'B', b: 'A', winner: 'A' },
      { a: 'A', b: 'C', winner: 'A' },
      { a: 'C', b: 'A', winner: 'A' },
      { a: 'A', b: 'D', winner: 'A' },
      { a: 'D', b: 'A', winner: 'A' },
      { a: 'B', b: 'C', winner: 'B' },
      { a: 'C', b: 'B', winner: null },
      { a: 'B', b: 'D', winner: 'B' },
      { a: 'D', b: 'B', winner: 'D' },
      { a: 'C', b: 'D', winner: 'C' },
      { a: 'D', b: 'C', winner: 'C' },
    ];
    const once = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(results));
    expect(order(once)).toEqual(['A', 'C', 'B', 'D']);
    expect(byId(once, 'C').separatedBy).toBe('nrr');
    const twice = rankTeams(records, ['points', 'head_to_head', 'head_to_head', 'nrr'], rankContext(results));
    expect(order(twice)).toEqual(['A', 'B', 'C', 'D']);
    expect(byId(twice, 'B').separatedBy).toBe('head_to_head');
    expect(byId(twice, 'B').detail).toBe('Ahead of C on head-to-head (3 pts vs 1 pt among B, C)');
  });

  it('U-TB-07 an incomplete mini-league is skipped when completeness is required', () => {
    const records = [teamRecord('A', { nrr: 0.1, name: 'Kings' }), teamRecord('B', { nrr: 0.9, name: 'Royals' }), teamRecord('C', { nrr: 0.5, name: 'Titans' })];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'C', b: 'A', winner: 'C' },
    ];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(results, { requireComplete: true }));
    expect(order(ranked)).toEqual(['B', 'C', 'A']);
    expect(byId(ranked, 'B').separatedBy).toBe('nrr');
    expect(byId(ranked, 'B').detail).toBe(
      'Head-to-head not used: Royals v Titans was not completed. Ahead of Titans on net run rate (+0.900 vs +0.500)',
    );
  });

  it('U-TB-08 the same mini-league is used when completeness is not required', () => {
    const records = [teamRecord('A', { nrr: 0.1 }), teamRecord('B', { nrr: 0.9 }), teamRecord('C', { nrr: 0.5 })];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'C', b: 'A', winner: 'C' },
    ];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'nrr'], rankContext(results));
    expect(order(ranked)).toEqual(['C', 'A', 'B']);
    expect(byId(ranked, 'C').separatedBy).toBe('nrr');
    expect(byId(ranked, 'A').separatedBy).toBe('head_to_head');
  });

  it('U-TB-09 head-to-head points versus head-to-head wins', () => {
    const records = [teamRecord('A'), teamRecord('B'), teamRecord('C')];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'B', b: 'C', winner: null },
      { a: 'C', b: 'A', winner: null },
    ];
    const byPoints = rankTeams(records, ['points', 'head_to_head'], rankContext(results));
    expect(order(byPoints)).toEqual(['A', 'C', 'B']);
    const byWins = rankTeams(records, ['points', 'head_to_head_wins'], rankContext(results));
    expect(order(byWins)).toEqual(['A', 'B', 'C']);
    expect(byId(byWins, 'B')).toMatchObject({ position: 2, shared: true });
    expect(byId(byWins, 'C')).toMatchObject({ position: 2, shared: true });
  });

  it('U-TB-10 head-to-head NRR separates a split double round robin', () => {
    const records = [teamRecord('A', { nrr: 0 }), teamRecord('B', { nrr: 0 })];
    const results = [
      { a: 'A', b: 'B', winner: 'A' },
      { a: 'B', b: 'A', winner: 'B' },
    ];
    const ranked = rankTeams(records, ['points', 'head_to_head', 'head_to_head_nrr'], rankContext(results, { headToHeadNrr: { A: 1, B: -1 } }));
    expect(order(ranked)).toEqual(['A', 'B']);
    expect(byId(ranked, 'A').separatedBy).toBe('head_to_head_nrr');
  });

  it('U-TB-11 fully level teams share the position and ask for a decision', () => {
    const records = [teamRecord('A'), teamRecord('B')];
    const ranked = rankTeams(records, ['points', 'nrr', 'organizer_decision'], rankContext([]));
    expect(ranked.map((team) => [team.position, team.shared])).toEqual([
      [1, true],
      [1, true],
    ]);
    expect(byId(ranked, 'A').detail).toBe('Level with B — organizer decision required');
  });

  it('U-TB-12 an organizer decision orders the level set', () => {
    const records = [teamRecord('A'), teamRecord('B')];
    const ranked = rankTeams(
      records,
      ['points', 'nrr', 'organizer_decision'],
      rankContext([], { resolutions: [tieResolution(['B', 'A'], 'organizer_decision')] }),
    );
    expect(order(ranked)).toEqual(['B', 'A']);
    expect(byId(ranked, 'B')).toMatchObject({ position: 1, shared: false, separatedBy: 'organizer_decision' });
    expect(byId(ranked, 'B').detail).toBe("Placed above A by organizer decision (Manual Override: 'Fair play record')");
    expect(byId(ranked, 'A').position).toBe(2);
  });

  it('U-TB-13 a resolution for a different set is not applied', () => {
    const records = [teamRecord('A'), teamRecord('B'), teamRecord('C', { points: 2 })];
    const ranked = rankTeams(
      records,
      ['points', 'nrr', 'organizer_decision'],
      rankContext([], { resolutions: [tieResolution(['C', 'B', 'A'], 'organizer_decision')] }),
    );
    expect(order(ranked)).toEqual(['A', 'B', 'C']);
    expect(byId(ranked, 'A')).toMatchObject({ position: 1, shared: true });
    expect(byId(ranked, 'B')).toMatchObject({ position: 1, shared: true });
  });

  it('U-TB-14 a draw of lots applies its order and carries the seed', () => {
    const records = [teamRecord('A'), teamRecord('B')];
    const ranked = rankTeams(records, ['points', 'nrr', 'organizer_decision'], rankContext([], { resolutions: [tieResolution(['B', 'A'], 'draw_lots')] }));
    expect(order(ranked)).toEqual(['B', 'A']);
    expect(byId(ranked, 'B').separatedBy).toBe('draw_lots');
    expect(byId(ranked, 'B').detail).toBe('Placed above A by draw of lots (seed 847291)');
  });

  it('the most recent of two matching resolutions wins and revoked ones are ignored', () => {
    const records = [teamRecord('A'), teamRecord('B')];
    const older = tieResolution(['A', 'B'], 'organizer_decision', { id: 'old', createdAt: '2026-05-01T10:00:00.000Z' });
    const newer = tieResolution(['B', 'A'], 'organizer_decision', { id: 'new', createdAt: '2026-05-02T10:00:00.000Z' });
    const revoked = tieResolution(['A', 'B'], 'organizer_decision', { id: 'rev', createdAt: '2026-05-03T10:00:00.000Z', revokedAt: '2026-05-04T10:00:00.000Z' });
    const ranked = rankTeams(records, ['points', 'organizer_decision'], rankContext([], { resolutions: [older, newer, revoked] }));
    expect(order(ranked)).toEqual(['B', 'A']);
  });

  it('U-TB-15 seeding: lower seed first, unseeded last', () => {
    const records = [teamRecord('A', { seed: 3 }), teamRecord('B', { seed: 1 }), teamRecord('C', { seed: null })];
    const ranked = rankTeams(records, ['points', 'seed'], rankContext([]));
    expect(order(ranked)).toEqual(['B', 'A', 'C']);
    expect(byId(ranked, 'A').detail).toBe('Ahead of C on seeding (seed 3 vs unseeded)');
  });

  it.each<[TieBreakerKind, Partial<Parameters<typeof teamRecord>[1]>, Partial<Parameters<typeof teamRecord>[1]>]>([
    ['wins', { won: 3 }, { won: 2 }],
    ['fewer_losses', { lost: 0 }, { lost: 1 }],
    ['runs_scored', { runsScored: 320 }, { runsScored: 300 }],
    ['wickets_taken', { wicketsTaken: 25 }, { wicketsTaken: 20 }],
  ])('U-TB-16 %s separates in the documented direction', (kind, better, worse) => {
    const records = [teamRecord('X', worse), teamRecord('Y', better)];
    const ranked = rankTeams(records, ['points', kind], rankContext([]));
    expect(order(ranked)).toEqual(['Y', 'X']);
    expect(byId(ranked, 'Y').separatedBy).toBe(kind);
  });

  it('U-TB-17 NRR values within the epsilon are level', () => {
    const records = [teamRecord('A', { nrr: 1.0, won: 1 }), teamRecord('B', { nrr: 1.0 + 1e-10, won: 2 })];
    const ranked = rankTeams(records, ['points', 'nrr', 'wins'], rankContext([]));
    expect(order(ranked)).toEqual(['B', 'A']);
    expect(byId(ranked, 'B').separatedBy).toBe('wins');
  });

  it('null NRR ranks after any value', () => {
    const records = [teamRecord('A', { nrr: null }), teamRecord('B', { nrr: -3 })];
    expect(order(rankTeams(records, ['points', 'nrr'], rankContext([])))).toEqual(['B', 'A']);
  });

  it('U-TB-20 ordering never uses names and falls back to input order', () => {
    const records = [
      teamRecord('A', { name: 'Zebras', points: 2 }),
      teamRecord('B', { name: 'Ants', points: 6 }),
      teamRecord('C', { name: 'Moles', points: 4 }),
      teamRecord('D', { name: 'Bees', points: 4 }),
    ];
    const renamed = records.map((record) => ({ ...record, name: `${record.name}!` })).reverse();
    expect(order(rankTeams(records, ['points'], rankContext([])))).toEqual(['B', 'C', 'D', 'A']);
    expect(order(rankTeams(renamed, ['points'], rankContext([])))).toEqual(['B', 'D', 'C', 'A']);
  });

  it('handles an empty table and an empty chain', () => {
    expect(rankTeams([], DEFAULT_TIE_BREAKERS, rankContext([]))).toEqual([]);
    const ranked = rankTeams([teamRecord('A'), teamRecord('B')], [], rankContext([]));
    expect(ranked.every((team) => team.position === 1 && team.shared)).toBe(true);
  });
});

describe('labels', () => {
  it('U-TB-18 describes the default chain', () => {
    expect(describeTieBreakerChain(DEFAULT_TIE_BREAKERS)).toBe('Points → NRR → Head-to-Head → Most wins → Organizer decision');
  });

  it('U-TB-19 labels every criterion', () => {
    expect(TIE_BREAKER_KINDS.map(tieBreakerLabel)).toEqual([
      'Points',
      'NRR',
      'Head-to-Head',
      'Head-to-Head wins',
      'Head-to-Head NRR',
      'Most wins',
      'Fewest losses',
      'Runs scored',
      'Wickets taken',
      'Seeding',
      'Organizer decision',
      'Draw of lots',
    ]);
  });
});

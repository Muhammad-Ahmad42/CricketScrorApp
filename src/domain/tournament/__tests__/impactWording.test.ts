import type { ProposedChange, TournamentSnapshot } from '@/domain/types';
import { computeImpact, type ImpactContext } from '../impact';
import { cupSnapshot, KO_SLOTS, koFixtures, TOP_TWO } from './standingsKit/cup';
import { deepFreeze, played, simpleWin } from './standingsKit/summaries';
import { entry, fixture, makeSnapshot, pool, stage, team, withResult } from './standingsKit/tournament';

function ctx(): ImpactContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: '2026-10-02T12:00:00.000Z',
  };
}

const correctedM6 = played('m6', { team: 'TIG', runs: 19, balls: 12, wickets: 4 }, { team: 'EAG', runs: 20, balls: 11, wickets: 2 }, { allotted: 12 });

describe('tournament-match edit preview names the stage and pool (wave-3 bug #15)', () => {
  it('standings lines carry the team, stage and pool names and a ready organizer sentence', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const impact = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(impact.standings.length).toBeGreaterThan(0);
    for (const line of impact.standings) {
      expect(line).toMatchObject({ stageName: 'Group stage', poolName: 'Pool A', where: 'Group stage · Pool A' });
      expect(line.text).not.toContain('Stage ·');
    }
    const eagles = impact.standings.find((line) => line.teamId === 'EAG');
    expect(eagles?.teamName).toBe('Eagles');
    expect(eagles?.text).toMatch(/^Eagles (move from \d(st|nd|rd|th) to \d(st|nd|rd|th)|stay \d(st|nd|rd|th)) in Group stage · Pool A; points \d+ → \d+, net run rate [+-]\d\.\d{3} → [+-]\d\.\d{3}\.$/);
    expect(eagles?.headline).toMatch(/^Eagles(: \d(st|nd|rd|th) → \d(st|nd|rd|th)| stay \d(st|nd|rd|th))$/);
    expect(eagles?.detail).toMatch(/^Group stage · Pool A\. Points \d+ → \d+, NRR [+-]\d\.\d{3} → [+-]\d\.\d{3}\.$/);
  });

  it('a team that keeps its place gets a "stay" sentence with only the figures that change', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const nudged = played('m1', { team: 'LIO', runs: 31, balls: 12, wickets: 2 }, { team: 'TIG', runs: 20, balls: 12, wickets: 4 }, { allotted: 12 });
    const impact = computeImpact({ kind: 'match_result_change', matchId: 'm1', summary: nudged }, snapshot, ctx());
    const lions = impact.standings.find((line) => line.teamId === 'LIO');
    expect(lions?.before?.position).toBe(lions?.after?.position);
    expect(lions?.text).toMatch(/^Lions stay 1st in Group stage · Pool A; net run rate \+\d\.\d{3} → \+\d\.\d{3}\.$/);
    expect(lions?.headline).toBe('Lions stay 1st');
    expect(lions?.detail).toMatch(/^Group stage · Pool A\. NRR \+\d\.\d{3} → \+\d\.\d{3}\.$/);
  });

  it('fixture rows explain the effect in plain words instead of "(has scores)"', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const corrected = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(corrected.fixtures).toEqual([
      {
        fixtureId: 'g-m6',
        label: 'Match 6 · Tigers v Eagles',
        change: 'result_changed',
        hasMatchData: true,
        changeText: 'Result changes',
        note: 'Standings update from the new scores.',
      },
      { fixtureId: 'sf2', label: 'Match 14 · Bulls v Eagles', change: 'teams_changed', hasMatchData: false, changeText: 'Teams change', note: null },
    ]);
    const withdrawn = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: null }, snapshot, ctx());
    expect(withdrawn.fixtures[0]).toMatchObject({
      changeText: 'Result no longer counts',
      note: 'Counts again once the match is finished.',
    });
  });

  it('the summary lines name the fixture whose result changes or stops counting', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const corrected = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(corrected.lines[0]).toBe('The result of Match 6 · Tigers v Eagles changes.');
    const withdrawn = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: null }, snapshot, ctx());
    expect(withdrawn.lines[0]).toBe('The result of Match 6 · Tigers v Eagles no longer counts until the match is finished again.');
    expect(withdrawn.lines).not.toContain('A match result changes.');
    expect(corrected.keyItems?.[0]).toEqual({ headline: 'Match 6 result changes', detail: 'Tigers v Eagles.' });
    expect(withdrawn.keyItems?.[0]).toEqual({ headline: 'Match 6 result no longer counts', detail: 'It counts again once Tigers v Eagles is finished.' });
  });

  it('keyLines carry only what the fixture, standings, qualification and slot sections do not already say', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const corrected = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    expect(corrected.keyLines).toEqual(['The result of Match 6 · Tigers v Eagles changes.']);
    expect(corrected.lines.length).toBeGreaterThan(corrected.keyLines?.length ?? 0);
  });

  it('qualification lines carry names and a sentence', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const impact = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary: correctedM6 }, snapshot, ctx());
    for (const line of impact.qualification) {
      expect(line.stageName).toBe('Knockouts');
      expect(line.teamName).toBeDefined();
      expect(line.text?.endsWith('.')).toBe(true);
      expect(line.headline?.startsWith(line.teamName ?? '?')).toBe(true);
      expect(line.headline?.length ?? 99).toBeLessThanOrEqual(40);
      expect(line.detail).toBe('For the Knockouts.');
    }
  });
});

function cityCup(): TournamentSnapshot {
  const result = simpleWin('a1', 'LIO', 'TIG');
  return makeSnapshot({
    teams: ['LIO', 'TIG', 'EAG', 'HAW', 'BUL', 'WOL'].map((id) => ({ id, name: id === 'BUL' ? 'Bulls' : id === 'WOL' ? 'Wolves' : id })),
    stages: [stage('groups', 'Group Stage', 'group', 0), stage('ko', 'Knockouts', 'knockout', 1, { entryRules: TOP_TWO, decidesChampion: true })],
    pools: [pool('pA', 'groups', 'Pool A', 0), pool('pB', 'groups', 'Pool B', 1)],
    poolEntries: [...['LIO', 'TIG', 'EAG', 'HAW'].map((id) => entry('groups', 'pA', team(id))), ...['BUL', 'WOL'].map((id) => entry('groups', 'pB', team(id)))],
    slots: KO_SLOTS,
    fixtures: [
      withResult(fixture('a1', 'groups', 'pA', 1, team('LIO'), team('TIG')), result),
      fixture('a2', 'groups', 'pA', 2, team('EAG'), team('HAW')),
      fixture('b1', 'groups', 'pB', 3, team('BUL'), team('WOL')),
      ...koFixtures(),
    ],
    summaries: [result],
  });
}

describe('pool moves that starve a qualification slot (wave-3 bug #16)', () => {
  const move: ProposedChange = { kind: 'pool_move', stageId: 'groups', member: team('WOL'), toPoolId: 'pA', removeFixtureIds: ['b1'], addFixtures: [] };

  it('warns that Pool B would be left with one team so B2 can never be filled, and asks for confirmation', () => {
    const impact = computeImpact(move, deepFreeze(cityCup()), ctx());
    const headline = "B2 in Knockouts can't be filled";
    const detail = 'Pool B would have 1 team; “Top 2 from each pool” needs 2. SF1 could not be played.';
    const message = `${headline}. ${detail}`;
    expect(impact.slotShortfalls).toEqual([
      {
        slotId: 'sB2',
        label: 'B2',
        stageId: 'ko',
        stageName: 'Knockouts',
        sourceStageId: 'groups',
        poolId: 'pB',
        poolName: 'Pool B',
        needed: 2,
        available: 1,
        fixtureLabels: ['SF1'],
        message,
        headline,
        detail,
      },
    ]);
    expect(impact.lines[0]).toBe(message);
    expect(impact.keyLines).toEqual([message]);
    expect(impact.keyItems).toEqual([{ headline, detail }]);
    expect(impact.requiresConfirmation).toBe(true);
    expect(['warning', 'destructive']).toContain(impact.severity);
    expect(impact.blocked).toBeNull();
  });

  it('a move that leaves both pools able to fill their slots raises no shortfall', () => {
    const snapshot = deepFreeze(cityCup());
    const harmless: ProposedChange = { kind: 'pool_move', stageId: 'groups', member: team('HAW'), toPoolId: 'pB', removeFixtureIds: ['a2'], addFixtures: [] };
    expect(computeImpact(harmless, snapshot, ctx()).slotShortfalls).toEqual([]);
  });

  it('a slot that was already unfillable before the change is not reported again', () => {
    const base = cityCup();
    const starved: TournamentSnapshot = { ...base, poolEntries: base.poolEntries.filter((candidate) => !(candidate.side.kind === 'team' && candidate.side.teamId === 'WOL')) };
    const impact = computeImpact({ kind: 'team_seeds_change', seeds: [{ teamId: 'LIO', seed: 1 }] }, deepFreeze(starved), ctx());
    expect(impact.slotShortfalls).toEqual([]);
  });
});

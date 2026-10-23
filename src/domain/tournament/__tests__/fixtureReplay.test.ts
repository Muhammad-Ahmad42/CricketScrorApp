import type { Fixture, ProposedChange, StandingRow, TournamentSnapshot } from '@/domain/types';
import { evaluateTournament } from '../evaluate';
import { applyChange, computeImpact, planChange } from '../impact';
import type { ImpactContext } from '../impact';
import {
  countedFixtureSummary,
  fixtureHasMatchHistory,
  fixtureReplayGuard,
  fixtureSupersededMatchIds,
  isFixtureReplay,
  stageAllowsReplay,
  supersedeFixtureMatch,
} from '../fixtureReplay';
import { computeTournamentStats } from '../stats';
import { simulate } from '../whatif';
import { cupSnapshot } from './standingsKit/cup';
import { POOL_A } from './standingsKit/pools';
import { abandoned, deepFreeze } from './standingsKit/summaries';
import { team, withResult } from './standingsKit/tournament';

const NOW = '2026-06-01T12:00:00.000Z';

function ctx(): ImpactContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `new-${next}`;
    },
    now: NOW,
  };
}

const ABANDONED = abandoned('m2', 'EAG', 'HAW');
const POOL_WITH_ABANDONED = [POOL_A[0], ABANDONED, ...POOL_A.slice(2)];
const REPLAY: ProposedChange = { kind: 'fixture_update', fixtureId: 'g-m2', patch: { status: 'rescheduled', scheduledDate: '2026-06-20' } };

function league(replay = true): TournamentSnapshot {
  return deepFreeze(cupSnapshot({ poolA: POOL_WITH_ABANDONED, playedA: 3, groupConfig: replay ? { abandonedMatches: 'replay' } : {} }));
}

function fixtureOf(snapshot: TournamentSnapshot, id: string): Fixture {
  const found = snapshot.fixtures.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
}

function rowOf(snapshot: TournamentSnapshot, teamId: string): StandingRow {
  const found = evaluateTournament(snapshot)
    .stages[0].tables.flatMap((table) => table.rows)
    .find((row) => row.teamId === teamId);
  if (!found) throw new Error(`row ${teamId} missing`);
  return found;
}

function agreement(snapshot: TournamentSnapshot) {
  const evaluation = evaluateTournament(snapshot);
  const groups = evaluation.stages[0];
  const tablePlayed = groups.tables.flatMap((table) => table.rows).reduce((sum, row) => sum + row.played, 0) / 2;
  const counted = snapshot.fixtures.filter((fixture) => fixture.stageId === 'groups' && countedFixtureSummary(snapshot, fixture) !== null).length;
  const stats = computeTournamentStats(snapshot, evaluation);
  return { progress: groups.progress.done, tablePlayed, counted, statsCompleted: stats.completedMatches, overallProgress: evaluation.progress.done };
}

describe('replaying an abandoned fixture (§39, §59, §99)', () => {
  it('previews the replay: the superseded no result stops counting and the impact says so', () => {
    const snapshot = league();
    const impact = computeImpact(REPLAY, snapshot, ctx());
    expect(impact.blocked).toBeNull();
    expect(impact).toMatchObject({ severity: 'destructive', requiresConfirmation: true, requiresReason: true, completedMatchesAffected: 1 });
    expect(impact.fixtures).toEqual([
      {
        fixtureId: 'g-m2',
        label: 'Match 2 · Eagles v Hawks',
        change: 'status_changed',
        hasMatchData: true,
        changeText: 'Status changes',
        note: 'The played match stays in history.',
      },
    ]);
    expect(impact.lines).toEqual(
      expect.arrayContaining([
        'Match 2 · Eagles v Hawks will be replayed as a new match.',
        'The abandoned match stays on record but no longer counts.',
      ]),
    );
    expect(impact.keyItems).toContainEqual({ headline: 'Match 2 will be replayed', detail: 'The abandoned match stays on record but no longer counts.' });
    const eagles = impact.standings.find((line) => line.teamId === 'EAG');
    const hawks = impact.standings.find((line) => line.teamId === 'HAW');
    expect(eagles?.before?.points).toBe((eagles?.after?.points ?? 0) + 1);
    expect(hawks?.before?.points).toBe((hawks?.after?.points ?? 0) + 1);
  });

  it('applies the replay by detaching the match, keeping it on record and counting the fixture as unplayed everywhere', () => {
    const before = league();
    expect(rowOf(before, 'EAG')).toMatchObject({ played: 2, noResult: 1 });
    expect(agreement(before)).toEqual({ progress: 9, tablePlayed: 9, counted: 9, statsCompleted: 9, overallProgress: 9 });
    const after = applyChange(before, REPLAY, ctx());
    expect(fixtureOf(after, 'g-m2')).toMatchObject({ status: 'rescheduled', matchId: null, matchSides: null, scheduledDate: '2026-06-20', updatedAt: NOW });
    expect(after.supersededMatches).toEqual([{ fixtureId: 'g-m2', matchId: 'm2' }]);
    expect(after.summaries.m2).toEqual(ABANDONED);
    expect(fixtureSupersededMatchIds(after, 'g-m2')).toEqual(['m2']);
    expect(fixtureHasMatchHistory(after, fixtureOf(after, 'g-m2'))).toBe(true);
    expect(rowOf(after, 'EAG')).toMatchObject({ played: 1, noResult: 0 });
    expect(rowOf(after, 'HAW')).toMatchObject({ played: 0, noResult: 0, points: 0, nrr: null });
    expect(agreement(after)).toEqual({ progress: 8, tablePlayed: 8, counted: 8, statsCompleted: 8, overallProgress: 8 });
  });

  it('lets the what-if engine simulate the replay and counts the replay result once it is played', () => {
    const after = applyChange(league(), REPLAY, ctx());
    const simulated = simulate(after, [{ fixtureId: 'g-m2', outcome: 'side_a_win', score: null }]);
    expect(simulated.narrative.join(' ')).not.toMatch(/already been played/);
    expect(simulated.after.tables.flatMap((table) => table.rows).find((row) => row.teamId === 'EAG')).toMatchObject({ played: 2, won: 1, noResult: 0 });
    const replayed = abandoned('m2-replay', 'EAG', 'HAW');
    const played: TournamentSnapshot = {
      ...after,
      fixtures: after.fixtures.map((fixture) => (fixture.id === 'g-m2' ? withResult(fixture, replayed) : fixture)),
      summaries: { ...after.summaries, [replayed.matchId]: replayed },
    };
    expect(rowOf(played, 'EAG')).toMatchObject({ played: 2, noResult: 1 });
    expect(agreement(played)).toEqual({ progress: 9, tablePlayed: 9, counted: 9, statsCompleted: 9, overallProgress: 9 });
    const second = applyChange(played, REPLAY, ctx());
    expect(second.supersededMatches).toEqual([
      { fixtureId: 'g-m2', matchId: 'm2' },
      { fixtureId: 'g-m2', matchId: 'm2-replay' },
    ]);
    expect(agreement(second)).toEqual({ progress: 8, tablePlayed: 8, counted: 8, statsCompleted: 8, overallProgress: 8 });
  });

  it('treats a fixture that left the abandoned state but still points at its old match as unplayed in every engine', () => {
    const base = league();
    const stale: TournamentSnapshot = deepFreeze({
      ...base,
      fixtures: base.fixtures.map((fixture) => (fixture.id === 'g-m2' ? { ...fixture, status: 'rescheduled' as const } : fixture)),
    });
    expect(rowOf(stale, 'EAG')).toMatchObject({ played: 1, noResult: 0 });
    expect(agreement(stale)).toEqual({ progress: 8, tablePlayed: 8, counted: 8, statsCompleted: 8, overallProgress: 8 });
    expect(simulate(stale, [{ fixtureId: 'g-m2', outcome: 'side_b_win', score: null }]).narrative.join(' ')).not.toMatch(/already been played/);
  });

  it('blocks the replay preview when the stage keeps abandoned matches as no results, and never replays a completed match', () => {
    const snapshot = league(false);
    expect(stageAllowsReplay(snapshot.stages[0])).toBe(false);
    expect(fixtureReplayGuard(snapshot, fixtureOf(snapshot, 'g-m2'))).toEqual({
      ok: false,
      reason: "This stage doesn't allow replays. The match stays a no result.",
    });
    expect(computeImpact(REPLAY, snapshot, ctx()).blocked).toEqual({
      reason: "This stage doesn't allow replays. The match stays a no result.",
    });
    expect(computeImpact(REPLAY, snapshot, ctx()).keyItems?.[0]).toEqual({ headline: "This stage doesn't allow replays", detail: 'The match stays a no result.' });
    const completed = computeImpact({ kind: 'fixture_update', fixtureId: 'g-m1', patch: { status: 'rescheduled' } }, league(), ctx());
    expect(isFixtureReplay(fixtureOf(league(), 'g-m1'), { status: 'rescheduled' })).toBe(false);
    expect(completed.blocked?.reason).toBe("Match 1 has been played. It can't be rescheduled.");
  });

  it('keeps a replayed fixture and its history: no deletion, kept by regeneration and pool moves, and the tournament still counts as started', () => {
    const after = applyChange(league(), REPLAY, ctx());
    expect(computeImpact({ kind: 'fixture_delete', fixtureId: 'g-m2' }, after, ctx()).blocked).toEqual({
      reason: "Match 2 can't be deleted. It keeps an abandoned match on record.",
    });
    const regenerated = planChange(after, { kind: 'fixtures_replace', stageId: 'groups', poolId: 'pA', fixtures: [], slots: [], seed: null }, ctx());
    expect(regenerated.fixtures.delete).toEqual(['g-m4', 'g-m5', 'g-m6']);
    const move = planChange(
      after,
      { kind: 'pool_move', stageId: 'groups', member: team('EAG'), toPoolId: 'pB', removeFixtureIds: ['g-m2', 'g-m6'], addFixtures: [] },
      ctx(),
    );
    expect(move.fixtures.delete).toEqual(['g-m6']);
    expect(supersedeFixtureMatch(fixtureOf(after, 'g-m2'), NOW)).toMatchObject({ matchId: null, status: 'rescheduled' });
  });
});

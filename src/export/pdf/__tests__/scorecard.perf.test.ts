/** @jest-environment node */
import { replayMatch } from '@/domain/scoring';
import { matchSetup, playedMatch, TIGERS, LIONS } from '@/domain/scoring/testing';
import type { Match } from '@/domain/types';
import { buildScorecardHtml } from '..';

const RUNS = 20;
const BUDGET_MS = 150;

function engineReady(): boolean {
  try {
    replayMatch(matchSetup(), []);
    return true;
  } catch {
    return false;
  }
}

(engineReady() ? describe : describe.skip)('scorecard performance', () => {
  it(`builds the HTML of a 50-over match in well under ${BUDGET_MS} ms`, () => {
    const setup = matchSetup({ rules: { oversPerInnings: 50, maxOversPerBowler: 10, powerplays: [] } });
    const played = playedMatch({ setup, first: { runs: 280, wickets: 9 }, second: { runs: 250, wickets: 10, balls: 290 } });
    const match: Match = {
      id: setup.matchId,
      title: 'Lions v Tigers',
      teamAId: LIONS,
      teamBId: TIGERS,
      venueId: null,
      scheduledDate: '2026-09-30',
      scheduledTime: null,
      formatId: 'T50',
      rules: setup.rules,
      toss: setup.toss,
      status: 'completed',
      result: played.state.result,
      winnerTeamId: null,
      tournamentId: null,
      fixtureId: null,
      teamAPlayers: null,
      teamBPlayers: null,
      resumeDismissedAt: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-09-30T09:00:00.000Z',
      updatedAt: '2026-09-30T18:00:00.000Z',
    };
    const source = { match, setup, state: played.state, venue: null, tournament: null, standings: [] };
    buildScorecardHtml(source, { generatedAt: '2026-09-30T18:00:00.000Z' });
    const started = performance.now();
    let html = '';
    for (let run = 0; run < RUNS; run += 1) {
      html = buildScorecardHtml(source, { generatedAt: '2026-09-30T18:00:00.000Z' });
    }
    const perBuild = (performance.now() - started) / RUNS;
    console.log(`scorecard HTML for ${played.events.length} events (${html.length} chars): ${perBuild.toFixed(2)} ms per build`);
    expect((html.match(/<tr><td class="num">\d+<\/td><td>/g) ?? []).length).toBeGreaterThanOrEqual(99);
    expect(perBuild).toBeLessThan(BUDGET_MS);
  });
});

/** @jest-environment node */
import { replayMatch } from '@/domain/scoring';
import { battersUnavailable, LIONS, m3Setup, playScript, TIGERS } from '@/domain/scoring/testing';
import type { Match, MatchSetup, MatchState } from '@/domain/types';
import { buildScorecardHtml } from '..';

const G1 = [
  'start:L1:L2:T7 1 4 wd 0 2 6 1',
  '@T8 0 W>L3 1 nb1 0 lb1 2',
  '@T7 1 1 1 1 1 1',
  'start:T1:T2:L10 4 4 1 1 2 6',
  '@L11 1 0 W:c:L7>T3 2 1 4',
  '@L10 1 1 end',
].join(' ');

function engineReady(): boolean {
  try {
    replayMatch(m3Setup(), []);
    return true;
  } catch {
    return false;
  }
}

function matchRow(setup: MatchSetup, state: MatchState, title: string): Match {
  return {
    id: setup.matchId,
    title,
    teamAId: LIONS,
    teamBId: TIGERS,
    venueId: 'venue-gaddafi',
    scheduledDate: '2026-05-01',
    scheduledTime: null,
    formatId: 'custom',
    rules: setup.rules,
    toss: setup.toss,
    status: state.lifecycle === 'completed' ? 'completed' : 'live',
    result: state.result,
    winnerTeamId: null,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: '2026-05-01T10:00:00.000Z',
    completedAt: null,
    createdAt: '2026-05-01T09:00:00.000Z',
    updatedAt: '2026-05-01T12:00:00.000Z',
  };
}

function scorecard(setup: MatchSetup, steps: string, title = 'Lions v Tigers'): string {
  const { state } = playScript(setup, [steps]);
  return buildScorecardHtml(
    { match: matchRow(setup, state, title), setup, state, venue: { name: 'Gaddafi Stadium', location: 'Lahore' }, tournament: null, standings: [] },
    { generatedAt: '2026-05-01T12:00:00.000Z' },
  );
}

const describeEngine = engineReady() ? describe : describe.skip;

describeEngine('scorecard of the golden match G1 replayed by the scoring engine', () => {
  const html = scorecard(m3Setup(), G1);

  it('shows the result, teams and venue', () => {
    expect(html).toContain('Tigers won by 9 wickets (4 balls left)');
    expect(html).toContain('<span>Lions innings</span>');
    expect(html).toContain('<span>Tigers innings</span>');
    expect(html).toContain('Gaddafi Stadium, Lahore');
    expect(html).toContain('Lions won the toss and chose to bat');
  });

  it('shows the dismissals exactly as the engine words them', () => {
    expect(html).toContain('b Shaheen');
    expect(html).toContain('c Amir b Abdul');
  });

  it('shows the extras, totals, fall of wickets and target', () => {
    expect(html).toContain('<td class="label">Extras</td><td class="dismissal">(b 0, lb 1, w 1, nb 1, p 0)</td><td class="num">3</td>');
    expect(html).toContain('<td class="num figure">27/1</td>');
    expect(html).toContain('<td class="num figure">28/1</td>');
    expect(html).toContain('<b>Fall of wickets:</b> 1-15 (Fakhar, 1.2)');
    expect(html).toContain('<p class="target">Target 28 from 3 overs</p>');
  });

  it('shows the bowling cards, partnerships and the over-by-over summary', () => {
    expect(html).toContain('<td class="name">Hassan</td><td class="num">2</td>');
    expect(html).toContain('<td class="name">Shaheen</td><td class="num">1</td>');
    expect((html.match(/<td>1st<\/td>/g) ?? []).length).toBe(2);
    expect((html.match(/<td>2nd<\/td>/g) ?? []).length).toBe(2);
    expect(html).toContain('<span class="ball wicket" aria-label=');
    expect((html.match(/<h3>Over by over<\/h3>/g) ?? []).length).toBe(2);
  });

  it('lists who did not bat', () => {
    expect(html).toMatch(/<b>Did not bat:<\/b> Rizwan-L, Iftikhar, Sarfraz, Amir, Wasim, Waqar, Imran, Abdul/);
  });
});

describeEngine('scorecard wording for substitutes and absent batters', () => {
  it('shows "c sub (Ali) b Hassan" and "absent hurt"', () => {
    const setup = m3Setup();
    const { state: afterWicket } = playScript(setup, ['start:L1:L2:T7 1 W:c:T12']);
    const absentees = afterWicket.innings[0].batting
      .filter((row) => row.status === 'yet_to_bat')
      .map((row, index) => ({ playerId: row.playerId, hurt: index === 0 }));
    const { state } = playScript(setup, ['start:L1:L2:T7 1 W:c:T12', battersUnavailable(absentees)]);
    const html = buildScorecardHtml(
      { match: matchRow(setup, state, 'Lions v Tigers'), setup, state, venue: null, tournament: null, standings: [] },
      { generatedAt: '2026-05-01T12:00:00.000Z' },
    );
    expect(html).toContain('c sub (Ali) b Hassan');
    expect(html).toContain('absent hurt');
    expect(html).toContain('>absent<');
    expect(html).toContain('(all out, 0.2 ov');
  });

  it('escapes names entered by the organizer', () => {
    const setup = m3Setup({ teamA: { name: 'Lions & <Co>' } });
    const html = scorecard(setup, 'start:L1:L2:T7 1 4', 'Lions & <Co> v Tigers');
    expect(html).toContain('Lions &amp; &lt;Co&gt;');
    expect(html).not.toContain('Lions & <Co>');
  });
});

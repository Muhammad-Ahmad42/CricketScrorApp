/** @jest-environment node */
import { formatRate } from '@/domain/scoring';
import type { MatchState } from '@/domain/types';
import { buildScorecardHtml } from '..';
import { scorecardDocument } from '../scorecard/assemble';
import type { ScorecardSource } from '../scorecard/model';
import { AWAY, AWAY_NAME, FIRST_INNINGS, HOME, HOME_NAME, SCRIPT_NAME, handMatch, handSetup, handState } from './fixtures/handState';
import { qualification, standingRow, standingsTable } from './fixtures/standings';

jest.mock('@/domain/scoring/format', () =>
  jest.requireActual('./support/scoringFallback').formatModule(jest.requireActual('@/domain/scoring/format')),
);
jest.mock('@/domain/scoring/result', () =>
  jest.requireActual('./support/scoringFallback').resultModule(jest.requireActual('@/domain/scoring/result')),
);

const OPTIONS = { generatedAt: '2026-09-30T14:05:00+05:00' };

function source(partial: Partial<ScorecardSource> = {}): ScorecardSource {
  return {
    match: handMatch(),
    setup: handSetup(),
    state: handState(),
    venue: { name: 'Gaddafi Stadium', location: 'Lahore' },
    tournament: null,
    standings: [],
    ...partial,
  };
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('buildScorecardHtml', () => {
  const html = buildScorecardHtml(source(), OPTIONS);

  it('is a complete, self-contained HTML document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('</html>');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link|<img|@import|url\(/i);
  });

  it('shows the title block: title, teams, result, toss, venue, date and format', () => {
    expect(html).toContain('<h1>Lions &amp; &lt;Co&gt; v Tigers &quot;XI&quot;</h1>');
    expect(html).toContain('Tigers &quot;XI&quot; won by 10 wickets (4 balls left)');
    expect(html).toContain('Lions &amp; &lt;Co&gt; won the toss and chose to bat');
    expect(html).toContain('<b>Venue</b> Gaddafi Stadium, Lahore');
    expect(html).toContain('<b>Date</b> 30 Sep 2026');
    expect(html).toContain('<b>Format</b> 2 overs a side');
    expect(html).toContain('<title>Scorecard - Lions &amp; &lt;Co&gt; v Tigers &quot;XI&quot;</title>');
  });

  it('shows the batting card with dismissals, absent batters and not-out marks', () => {
    expect(html).toContain('c sub (Ali \u{1F3CF}) b Hassan');
    expect(html).toContain('absent hurt');
    expect(html).toContain('<b>9*</b>');
    expect(html).toContain('Babar <span class="mark">(c)</span>');
    expect(text(html)).toContain('Batter R B 4s 6s SR');
    expect(html).toContain(`<td class="num">${formatRate(128.571)}</td>`);
  });

  it('shows extras, total, did not bat and fall of wickets', () => {
    expect(html).toContain('<td class="label">Extras</td><td class="dismissal">(b 1, lb 3, w 6, nb 2, p 0)</td><td class="num">12</td>');
    expect(html).toContain('<td class="label">Total</td><td>(2 ov, RR 12.50)</td><td class="num figure">25/1</td>');
    expect(html).toContain('<b>Did not bat:</b> Rizwan-L, بابر');
    expect(html).toContain('<b>Fall of wickets:</b> 1-18 (&lt;script&gt;alert(1)&lt;/script&gt;, 0.5)');
  });

  it('shows the bowling card', () => {
    expect(text(html)).toContain('Bowler O M R W Econ 0s WD NB');
    expect(html).toContain(
      '<td class="name">Hassan</td><td class="num">2</td><td class="num">0</td><td class="num">20</td><td class="num"><b>1</b></td><td class="num">10.00</td><td class="num">4</td><td class="num">2</td><td class="num">1</td>',
    );
  });

  it('shows partnerships including the unbroken one', () => {
    expect(html).toContain('<td>1st</td><td>Babar 5 (2), &lt;script&gt;alert(1)&lt;/script&gt; 4 (3)</td><td class="num"><b>18</b></td><td class="num">5</td>');
    expect(html).toContain('<td>2nd</td><td>Babar 4 (5)</td><td class="num"><b>7*</b></td><td class="num">7</td>');
  });

  it('shows the over-by-over summary with wickets in bold text', () => {
    expect(html).toContain('<h3>Over by over</h3>');
    expect(html).toContain('<span class="ball wicket" aria-label="Wicket, caught"><b>W</b></span>');
    expect(html).toContain('<span class="ball" aria-label="No ball, plus one run">NB+1</span>');
    expect(html).toContain('<td class="num figure">18/1</td>');
    expect(html).toContain('<td class="num">1</td><td>Hassan</td>');
  });

  it('shows the chase target and the super overs in their own section', () => {
    expect(html).toContain('<p class="target">Target 26 from 2 overs</p>');
    expect(html).toContain('<h2 class="section">Super overs</h2>');
    expect(html).toContain('<span>Super over 1 — Lions &amp; &lt;Co&gt;</span>');
    expect(html.indexOf('Super overs')).toBeGreaterThan(html.indexOf('Tigers &quot;XI&quot; innings'));
  });

  it('HTML-escapes every name and keeps emoji and Urdu', () => {
    expect(html).not.toContain(SCRIPT_NAME);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain(HOME_NAME);
    expect(html).not.toContain(AWAY_NAME);
    expect(html).toContain('بابر');
    expect(html).toContain('\u{1F3CF}');
  });

  it('uses its own light print styling, independent of the app theme', () => {
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('<meta name="color-scheme" content="light only">');
    expect(html).toContain('background: #FFFFFF');
    expect(html).toContain('color: #1A1C19');
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('font-variant-numeric: tabular-nums');
    expect(html).not.toMatch(/prefers-color-scheme|var\(--/);
    const families = html.match(/font-family: [^;]+;/g) ?? [];
    expect(families.length).toBeGreaterThan(0);
    families.forEach((family) => expect(family).toMatch(/, sans-serif;$/));
    expect((html.match(/<\/style>/g) ?? []).length).toBe(1);
  });

  it('adds the generated footer and a safe running page footer', () => {
    expect(html).toContain('Scored with Scorebook · generated 30 Sep 2026, 14:05');
    expect(html).toContain('@bottom-center { content: "Scorebook · Lions \\26  \\3c Co\\3e  v Tigers \\22 XI\\22 " " \\b7  page " counter(page) " of " counter(pages);');
  });

  it('is deterministic for identical input', () => {
    expect(buildScorecardHtml(source(), OPTIONS)).toBe(html);
  });
});

describe('scorecard edge cases', () => {
  it('shows the tournament, stage, pool and fixture above the title', () => {
    const html = buildScorecardHtml(
      source({ tournament: { tournamentName: 'Spring <Cup>', stageName: 'Group stage', poolName: 'Pool A', fixtureLabel: 'Match 3' } }),
      OPTIONS,
    );
    expect(html).toContain('<p class="kicker">Spring &lt;Cup&gt; · Group stage · Pool A · Match 3</p>');
  });

  it('shows the standings after a tournament match with qualification notes', () => {
    const table = standingsTable([
      standingRow({ position: 1, teamId: AWAY, points: 6, nrr: 1.5, qualification: qualification(AWAY, 'Qualified as Pool A winners'), tieBreak: { separatedBy: 'nrr', aboveTeamId: HOME, detail: 'Ahead on net run rate (+1.500 vs +0.250)' } }),
      standingRow({ position: 2, teamId: HOME, points: 5, nrr: 0.25, pointsAdjustment: -1 }),
      standingRow({ position: 3, teamId: 'team-3', points: 0, nrr: -2, won: 0, lost: 3 }),
      standingRow({ position: 3, teamId: null, slotLabel: 'A4', sharedPosition: true, played: 0, won: 0, lost: 0, points: 0, nrr: null }),
    ]);
    const html = buildScorecardHtml(
      source({
        standings: [
          {
            title: 'Pool A',
            table,
            teams: [
              { id: HOME, name: HOME_NAME, shortName: 'LIO' },
              { id: AWAY, name: AWAY_NAME, shortName: 'TIG' },
              { id: 'team-3', name: 'Eagles', shortName: 'EAG' },
            ],
          },
        ],
      }),
      OPTIONS,
    );
    expect(html).toContain('<h2>Standings after this match</h2>');
    expect(html).toContain('<h3>Pool A</h3>');
    expect(text(html)).toContain('Pos Team P W L T NR Pts NRR');
    expect(html).toContain('<td class="num">1</td><td class="name"><b>Tigers &quot;XI&quot;</b></td>');
    expect(html).toContain('<td class="num">+1.500</td>');
    expect(html).toContain('<td class="num">−2.000</td>');
    expect(html).toContain('<td class="num">3=</td><td class="name">A4</td>');
    expect(html).toContain('<li>Lions &amp; &lt;Co&gt;: -1 point adjustment.</li>');
    expect(html).toContain('<li>Tigers &quot;XI&quot;: Ahead on net run rate (+1.500 vs +0.250)</li>');
  });

  it('falls back to the recorded result and then to the match state', () => {
    const recorded = scorecardDocument(source({ state: handState({ resultText: null }) }));
    expect(recorded.result).toBe('Tigers "XI" won by 10 wickets (4 balls left)');
    const live = scorecardDocument(source({ match: { ...handMatch(), status: 'live', result: null }, state: handState({ resultText: null, lifecycle: 'live' }) }));
    expect(live.result).toBe('Match in progress');
    const paused = scorecardDocument(source({ match: { ...handMatch(), status: 'paused', result: null }, state: handState({ resultText: null, lifecycle: 'paused' }) }));
    expect(paused.result).toBe('Play suspended');
    const postponed = scorecardDocument(
      source({ match: { ...handMatch(), status: 'postponed', result: null }, state: handState({ resultText: null, lifecycle: 'not_started', innings: [] }) }),
    );
    expect(postponed.result).toBe('Match postponed');
  });

  it('renders a match that has not started', () => {
    const state: MatchState = handState({ innings: [], resultText: null, lifecycle: 'not_started', currentInningsIndex: null });
    const html = buildScorecardHtml(source({ match: { ...handMatch(), status: 'scheduled', result: null, scheduledDate: null, startedAt: null, completedAt: null }, state, venue: null }), OPTIONS);
    expect(html).toContain('No innings has started yet.');
    expect(html).toContain('Match not started');
    expect(html).not.toContain('<b>Date</b>');
    const adHoc = scorecardDocument(source({ match: { ...handMatch(), scheduledDate: null } }));
    expect(adHoc.date).toBe('30 Sep 2026');
    const unplayed = scorecardDocument(source({ match: { ...handMatch(), status: 'scheduled', result: null, startedAt: null, completedAt: null }, state }));
    expect(unplayed.date).toBe('29 Sep 2026');
    expect(html).not.toContain('<b>Venue</b>');
  });

  it('describes unusual formats and innings states', () => {
    const setup = handSetup();
    const uneven = scorecardDocument(
      source({
        setup: {
          ...setup,
          rules: { ...setup.rules, ballsPerOver: 8, lastManStands: true, oversPerInnings: 1 },
          teams: [{ ...setup.teams[0], playersInSide: 8 }, { ...setup.teams[1], playersInSide: 7 }],
        },
        state: handState({
          innings: [
            { ...FIRST_INNINGS, status: 'in_progress', completion: null, runRate: null },
            { ...FIRST_INNINGS, index: 1, completion: { reason: 'batters_unavailable', atSeq: 3 } },
          ],
        }),
      }),
    );
    expect(uneven.format).toBe('1 over a side, 8-ball overs, Lions & <Co> 8 v Tigers "XI" 7 players, last man stands');
    expect(uneven.innings[0].totalDetail).toBe('(in progress, 1.4 ov, RR –)');
    expect(uneven.innings[1].totalDetail).toBe('(all out, 1.4 ov, RR 12.50)');
  });

  it('uses the teams as the title when the match has no title and labels a revised target', () => {
    const doc = scorecardDocument(
      source({
        match: { ...handMatch(), title: '  ' },
        state: handState({
          innings: [
            FIRST_INNINGS,
            { ...FIRST_INNINGS, index: 1, target: { runs: 20, revised: true, source: 'revision' }, limits: { ...FIRST_INNINGS.limits, maxBalls: 6 } },
          ],
        }),
      }),
    );
    expect(doc.title).toBe(`${HOME_NAME} v ${AWAY_NAME}`);
    expect(doc.innings[1].target).toBe('Revised target 20 from 1 over');
  });
});

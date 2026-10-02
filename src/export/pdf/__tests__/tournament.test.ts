/** @jest-environment node */
import { buildTournamentHtml } from '..';
import { tournamentDocument } from '../tournament/assemble';
import { evaluation, snapshot, TEAM, tournamentSource } from './fixtures/tournament';

jest.mock('@/domain/scoring/format', () =>
  jest.requireActual('./support/scoringFallback').formatModule(jest.requireActual('@/domain/scoring/format')),
);
jest.mock('@/domain/scoring/result', () =>
  jest.requireActual('./support/scoringFallback').resultModule(jest.requireActual('@/domain/scoring/result')),
);

const OPTIONS = { generatedAt: '2026-09-30T14:05:00.000Z' };

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('buildTournamentHtml', () => {
  const html = buildTournamentHtml(tournamentSource(), OPTIONS);

  it('shows the tournament information', () => {
    expect(html).toContain('<h1>Spring &lt;Cup&gt;</h1>');
    expect(html).toContain('<p class="kicker">2026 &quot;Autumn&quot;</p>');
    expect(html).toContain('<b>Dates</b> 1 Sep 2026 – 30 Sep 2026');
    expect(html).toContain('<b>Organizer</b> City &amp; District CA');
    expect(html).toContain('<b>Venues</b> Gaddafi &lt;Stadium&gt;');
    expect(html).toContain('<b>Teams</b> 3');
    expect(html).toContain('<b>Format</b> Groups and knockout');
    expect(html).toContain('<b>Status</b> In progress');
    expect(html).toContain('<b>Matches played</b> 3/5');
    expect(html).not.toContain('<b>Contact</b>');
    expect(html).toContain('<title>Tournament - Spring &lt;Cup&gt;</title>');
  });

  it('shows the standings of every pool with qualification text, in stage order', () => {
    expect(html.indexOf('<span>Group stage</span>')).toBeLessThan(html.indexOf('<span>Knockout</span>'));
    expect(html).toContain('<h3>Pool A</h3>');
    expect(html).toContain('<h3>Pool B</h3>');
    expect(html).toContain('<h3>Group stage · overall</h3>');
    expect(text(html)).toContain('Pos Team P W L T NR Pts NRR Qualification');
    expect(html).toContain('<td class="dismissal">Qualified for the knockout as Pool A winners</td>');
    expect(html).toContain('<td class="num">+0.500</td>');
    expect(html).toContain('<li>Falcons withdrew from the tournament.</li>');
    expect(html).toContain('<span class="sub">Completed</span>');
  });

  it('shows the knockout bracket round by round with winners marked in text', () => {
    expect(html).toContain('<h3>Knockout bracket</h3>');
    expect(html.indexOf('<tr class="group"><td colspan="3">Semi-final</td></tr>')).toBeLessThan(
      html.indexOf('<tr class="group"><td colspan="3">Final</td></tr>'),
    );
    expect(html).toContain('<td>Semi-final 1</td><td>Lions &amp; &lt;Co&gt; v <span class="winner">Eagles ✓</span></td><td>Eagles won by 4 wickets (7 balls left)</td>');
    expect(html).toContain('<td>Match 4</td><td>Eagles (provisional) v Tigers</td><td>28 Sep 2026</td>');
  });

  it('lists results and the fixtures still to play', () => {
    expect(text(html)).toContain('# Date Stage Match Result');
    expect(html).toContain('<b>Lions &amp; &lt;Co&gt; v Tigers</b><br><span class="sub">Lions &amp; &lt;Co&gt; 150/6 (20) · Tigers 140/9 (20)</span></td><td>Lions &amp; &lt;Co&gt; won by 10 runs</td>');
    expect(html).toContain('<td>Match abandoned</td>');
    expect(html).toContain('<td class="num">3</td><td>5 Sep 2026</td><td>Knockout</td>');
    expect(html).toContain('<h2>Fixtures to play</h2>');
    expect(html).toContain('<td class="num">4</td><td>28 Sep 2026, 14:00</td><td>Knockout</td><td>Eagles (provisional) v Tigers</td><td>Gaddafi &lt;Stadium&gt;</td><td>Scheduled</td>');
    expect(html).toContain('<td class="num">5</td><td>Date to be confirmed</td><td>Group stage · Pool A</td><td>Tigers v Lions &amp; &lt;Co&gt;</td><td></td><td>Postponed</td>');
  });

  it('shows records and statistics leaders', () => {
    expect(html).toContain('<td class="label">Highest team score</td><td>Lions &amp; &lt;Co&gt;</td><td>150/6 v Tigers</td>');
    expect(html).toContain('<td class="label">Highest individual score</td><td>Babar &lt;b&gt;Azam&lt;/b&gt; (Lions &amp; &lt;Co&gt;)</td><td>78* (45)</td>');
    expect(html).toContain('<td class="label">Best bowling</td><td>Amir (Eagles)</td><td>4</td>');
    expect(html).not.toContain('Most sixes');
    expect(html).toContain('<h3>Most runs</h3>');
    expect(html).toContain('<h3>Most wickets</h3>');
    expect(html).toContain('<td class="name">Babar &lt;b&gt;Azam&lt;/b&gt;</td><td>Lions &amp; &lt;Co&gt;</td><td class="num">2</td><td class="num">2</td><td class="num">110</td><td class="num">78*</td><td class="num">110.00</td><td class="num">137.50</td>');
    expect(html).toContain('<td class="name">Amir</td><td>Eagles</td><td class="num">2</td><td class="num">6</td><td class="num">30</td><td class="num">3.75</td><td class="num">4/12</td>');
    expect(html).toContain('<td class="name">Unknown player</td>');
  });

  it('escapes every name and uses the print styling', () => {
    expect(html).not.toMatch(/<b>Azam<\/b>|Lions & <Co>|Spring <Cup>/);
    expect(html).toContain('<meta name="color-scheme" content="light only">');
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('Scored with Scorebook · generated 30 Sep 2026, 14:05');
  });

  it('is deterministic for identical input', () => {
    expect(buildTournamentHtml(tournamentSource(), OPTIONS)).toBe(html);
  });
});

describe('tournament document edge cases', () => {
  it('shows the champion, shared champions and a declared champion', () => {
    const final = buildTournamentHtml(tournamentSource({ evaluation: evaluation({ teamIds: [TEAM.tigers], basis: 'final', fixtureId: 'f-final' }) }), OPTIONS);
    expect(final).toContain('<p class="champion">Champion: <span class="winner">Tigers</span></p>');
    const shared = tournamentDocument(tournamentSource({ evaluation: evaluation({ teamIds: [TEAM.lions, TEAM.eagles], basis: 'shared', fixtureId: null }) }));
    expect(shared.champion).toBe('Lions & <Co> & Eagles (shared)');
    const manual = tournamentDocument(tournamentSource({ evaluation: evaluation({ teamIds: [TEAM.eagles], basis: 'manual', fixtureId: null }) }));
    expect(manual.champion).toBe('Eagles (declared by the organizer)');
    expect(tournamentDocument(tournamentSource()).champion).toBeNull();
  });

  it('renders a tournament that has not started', () => {
    const base = snapshot();
    const empty = tournamentSource({
      snapshot: { ...base, stages: [], fixtures: [], summaries: {}, tournament: { ...base.tournament, status: 'draft', startDate: null, endDate: null, venueIds: [] } },
      evaluation: { stages: [], currentStageId: null, champion: null, progress: { done: 0, total: 0 } },
      stats: null,
      venues: [],
    });
    const html = buildTournamentHtml(empty, OPTIONS);
    expect(html).toContain('No results yet.');
    expect(html).not.toContain('<h2>Statistics</h2>');
    expect(html).not.toContain('Fixtures to play');
    expect(html).toContain('<b>Status</b> Draft');
    expect(html).not.toContain('<b>Dates</b>');
  });

  it('names unresolved slots by their label and stages without fixtures', () => {
    const base = tournamentSource();
    const pending = tournamentDocument({
      ...base,
      evaluation: { ...base.evaluation, stages: base.evaluation.stages.map((stage) => ({ ...stage, slots: [] })) },
    });
    const knockout = pending.stages.find((stage) => stage.name === 'Knockout');
    expect(knockout?.bracket[1].matches[0].sideA).toBe('Winner SF1');
    const lonely = tournamentDocument({ ...base, snapshot: { ...base.snapshot, fixtures: [] } });
    expect(lonely.stages.find((stage) => stage.name === 'Knockout')?.bracket).toEqual([]);
    expect(buildTournamentHtml({ ...base, snapshot: { ...base.snapshot, fixtures: [] } }, OPTIONS)).toContain('No fixtures in this stage yet.');
  });
});

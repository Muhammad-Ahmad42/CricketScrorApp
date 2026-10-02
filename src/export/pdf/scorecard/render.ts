import { html, join, when, type SafeHtml } from '../html';
import { printDocument, type PrintOptions } from '../page';
import { renderStandings } from '../standings';
import type { BallCell, InningsDocument, ScorecardDocument } from './model';

function battingTable(doc: InningsDocument): SafeHtml {
  const rows = doc.batting.map(
    (row) => html`<tr>
<td class="name">${row.name}${when(row.marks.length > 0, () => html` <span class="mark">${row.marks}</span>`)}</td><td class="dismissal">${row.dismissal}</td>
<td class="num">${when(row.runs.length > 0, () => html`<b>${row.runs}</b>`)}</td><td class="num">${row.balls}</td><td class="num">${row.fours}</td><td class="num">${row.sixes}</td><td class="num">${row.strikeRate}</td>
</tr>`,
  );
  return html`<table class="batting">
<thead><tr><th>Batter</th><th></th><th class="num">R</th><th class="num">B</th><th class="num">4s</th><th class="num">6s</th><th class="num">SR</th></tr></thead>
<tbody>
${rows.length > 0 ? rows : html`<tr><td colspan="7" class="empty">No batter has come in yet.</td></tr>`}
<tr class="extras"><td class="label">Extras</td><td class="dismissal">${doc.extrasDetail}</td><td class="num">${doc.extras}</td><td colspan="4"></td></tr>
<tr class="total"><td class="label">Total</td><td>${doc.totalDetail}</td><td class="num figure">${doc.total}</td><td colspan="4"></td></tr>
</tbody>
</table>`;
}

function bowlingTable(doc: InningsDocument): SafeHtml {
  if (doc.bowling.length === 0) {
    return html``;
  }
  return html`<table class="bowling">
<thead><tr><th>Bowler</th><th class="num">O</th><th class="num">M</th><th class="num">R</th><th class="num">W</th><th class="num">Econ</th><th class="num">0s</th><th class="num">WD</th><th class="num">NB</th></tr></thead>
<tbody>
${doc.bowling.map(
  (row) => html`<tr><td class="name">${row.name}</td><td class="num">${row.overs}</td><td class="num">${row.maidens}</td><td class="num">${row.runs}</td><td class="num"><b>${row.wickets}</b></td><td class="num">${row.economy}</td><td class="num">${row.dots}</td><td class="num">${row.wides}</td><td class="num">${row.noBalls}</td></tr>`,
)}
</tbody>
</table>`;
}

function partnershipsTable(doc: InningsDocument): SafeHtml {
  if (doc.partnerships.length === 0) {
    return html``;
  }
  return html`<div class="block">
<h3>Partnerships</h3>
<table class="partnerships">
<thead><tr><th>Wkt</th><th>Batters</th><th class="num">Runs</th><th class="num">Balls</th></tr></thead>
<tbody>
${doc.partnerships.map(
  (row) => html`<tr><td>${row.wicket}</td><td>${row.batters}</td><td class="num"><b>${row.runs}</b></td><td class="num">${row.balls}</td></tr>`,
)}
</tbody>
</table>
</div>`;
}

function ballCell(ball: BallCell): SafeHtml {
  return ball.wicket
    ? html`<span class="ball wicket" aria-label="${ball.label}"><b>${ball.text}</b></span>`
    : html`<span class="ball" aria-label="${ball.label}">${ball.text}</span>`;
}

function oversTable(doc: InningsDocument): SafeHtml {
  if (doc.overs.length === 0) {
    return html``;
  }
  return html`<h3>Over by over</h3>
<table class="overs">
<thead><tr><th class="num">Over</th><th>Bowler</th><th>Balls</th><th class="num">Runs</th><th class="num">Wkts</th><th class="num">Score</th></tr></thead>
<tbody>
${doc.overs.map(
  (row) => html`<tr><td class="num">${row.over}</td><td>${row.bowler}</td><td class="balls">${row.balls.map(ballCell)}</td><td class="num">${row.runs}</td><td class="num">${row.wickets}</td><td class="num figure">${row.score}</td></tr>`,
)}
</tbody>
</table>`;
}

function inningsSection(doc: InningsDocument, className: string): SafeHtml {
  return html`<section class="${className}">
<h2><span>${doc.heading}</span><span class="figure score">${doc.score} <span class="sub">(${doc.oversLabel})</span></span></h2>
${when(doc.target !== null, () => html`<p class="target">${doc.target}</p>`)}
${battingTable(doc)}
${when(doc.didNotBat.length > 0, () => html`<p class="line"><b>Did not bat:</b> ${join(doc.didNotBat, ', ')}</p>`)}
${when(doc.fallOfWickets.length > 0, () => html`<p class="line"><b>Fall of wickets:</b> ${join(doc.fallOfWickets, ', ')}</p>`)}
${bowlingTable(doc)}
${partnershipsTable(doc)}
${oversTable(doc)}
</section>`;
}

function header(doc: ScorecardDocument): SafeHtml {
  const facts = [
    doc.venue === null ? null : html`<b>Venue</b> ${doc.venue}`,
    doc.date === null ? null : html`<b>Date</b> ${doc.date}`,
    html`<b>Format</b> ${doc.format}`,
  ];
  return html`<header class="doc">
${when(doc.kicker !== null && doc.kicker.length > 0, () => html`<p class="kicker">${doc.kicker}</p>`)}
<h1>${doc.title}</h1>
${when(doc.teams !== doc.title, () => html`<p class="teams">${doc.teams}</p>`)}
<p class="result">${doc.result}</p>
${when(doc.toss !== null, () => html`<p class="meta"><b>Toss</b> ${doc.toss}</p>`)}
<p class="meta">${join(facts, ' · ')}</p>
</header>`;
}

export function renderScorecardBody(doc: ScorecardDocument): SafeHtml {
  return html`${header(doc)}
${doc.innings.length === 0 ? html`<p class="empty">No innings has started yet.</p>` : doc.innings.map((innings) => inningsSection(innings, 'innings'))}
${when(
  doc.superOvers.length > 0,
  () => html`<h2 class="section">Super overs</h2>
${doc.superOvers.map((innings) => inningsSection(innings, 'innings super-over'))}`,
)}
${when(
  doc.standings.length > 0,
  () => html`<section class="standings">
<h2>Standings after this match</h2>
${doc.standings.map((table) => renderStandings(table, { withNotes: false }))}
</section>`,
)}`;
}

export function renderScorecard(doc: ScorecardDocument, options: PrintOptions): string {
  return printDocument({ title: `Scorecard - ${doc.title}`, runningFooter: doc.title, body: renderScorecardBody(doc) }, options);
}

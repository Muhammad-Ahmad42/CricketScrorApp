import { html, join, when, type SafeHtml } from '../html';
import { printDocument, type PrintOptions } from '../page';
import { renderStandings } from '../standings';
import type { BracketMatch, BracketRound, LeaderTable, StageDocument, TournamentDocument } from './model';

function header(doc: TournamentDocument): SafeHtml {
  return html`<header class="doc">
${when(doc.season !== null && doc.season.trim().length > 0, () => html`<p class="kicker">${doc.season}</p>`)}
<h1>${doc.title}</h1>
${when(doc.description !== null, () => html`<p class="teams">${doc.description}</p>`)}
${when(doc.champion !== null, () => html`<p class="champion">Champion: <span class="winner">${doc.champion}</span></p>`)}
<p class="meta">${join(
    doc.facts.map((fact) => html`<b>${fact.label}</b> ${fact.value}`),
    ' · ',
  )}</p>
</header>`;
}

function sideCell(name: string, won: boolean): SafeHtml {
  return won ? html`<span class="winner">${name} ✓</span>` : html`${name}`;
}

function bracketRow(match: BracketMatch): SafeHtml {
  return html`<tr><td>${match.label}</td><td>${sideCell(match.sideA, match.winner === 'A')} v ${sideCell(match.sideB, match.winner === 'B')}</td><td>${match.outcome}</td></tr>`;
}

function bracketTable(rounds: readonly BracketRound[]): SafeHtml {
  return html`<h3>Knockout bracket</h3>
<table class="bracket">
<thead><tr><th>Match</th><th>Teams</th><th>Result</th></tr></thead>
<tbody>
${rounds.map(
  (round) => html`<tr class="group"><td colspan="3">${round.name}</td></tr>
${round.matches.map(bracketRow)}`,
)}
</tbody>
</table>`;
}

function stageSection(stage: StageDocument): SafeHtml {
  const empty = stage.tables.length === 0 && stage.bracket.length === 0;
  return html`<section class="stage">
<h2><span>${stage.name}</span><span class="sub">${stage.status}</span></h2>
${stage.tables.map((table) => renderStandings(table, { withNotes: true }))}
${when(stage.bracket.length > 0, () => bracketTable(stage.bracket))}
${when(empty, () => html`<p class="empty">No fixtures in this stage yet.</p>`)}
</section>`;
}

function resultsSection(doc: TournamentDocument): SafeHtml {
  return html`<section class="results">
<h2>Results</h2>
${
  doc.results.length === 0
    ? html`<p class="empty">No results yet.</p>`
    : html`<table class="results">
<thead><tr><th class="num">#</th><th>Date</th><th>Stage</th><th>Match</th><th>Result</th></tr></thead>
<tbody>
${doc.results.map(
  (row) => html`<tr><td class="num">${row.number}</td><td>${row.date}</td><td>${row.stage}</td><td><b>${row.teams}</b><br><span class="sub">${row.scores}</span></td><td>${row.result}</td></tr>`,
)}
</tbody>
</table>`
}
</section>`;
}

function fixturesSection(doc: TournamentDocument): SafeHtml {
  return html`<section class="fixtures">
<h2>Fixtures to play</h2>
<table class="fixtures">
<thead><tr><th class="num">#</th><th>Date</th><th>Stage</th><th>Match</th><th>Venue</th><th>Status</th></tr></thead>
<tbody>
${doc.fixtures.map(
  (row) => html`<tr><td class="num">${row.number}</td><td>${row.date}</td><td>${row.stage}</td><td>${row.teams}</td><td>${row.venue}</td><td>${row.status}</td></tr>`,
)}
</tbody>
</table>
</section>`;
}

function leaderTable(table: LeaderTable): SafeHtml {
  return html`<div class="block">
<h3>${table.title}</h3>
<table class="leaders">
<thead><tr><th>Player</th><th>Team</th><th class="num">M</th>${table.columns.map((column) => html`<th class="num">${column}</th>`)}</tr></thead>
<tbody>
${table.rows.map(
  (row) => html`<tr><td class="name">${row.name}</td><td>${row.team}</td><td class="num">${row.matches}</td>${row.figures.map((figure) => html`<td class="num">${figure}</td>`)}</tr>`,
)}
</tbody>
</table>
</div>`;
}

function statisticsSection(doc: TournamentDocument): SafeHtml {
  return html`<section class="statistics">
<h2>Statistics</h2>
${when(
  doc.records.length > 0,
  () => html`<table class="records">
<thead><tr><th>Record</th><th>Held by</th><th>Detail</th></tr></thead>
<tbody>
${doc.records.map((row) => html`<tr><td class="label">${row.label}</td><td>${row.holder}</td><td>${row.detail}</td></tr>`)}
</tbody>
</table>`,
)}
${doc.leaders.map(leaderTable)}
</section>`;
}

export function renderTournamentBody(doc: TournamentDocument): SafeHtml {
  const hasStatistics = doc.records.length > 0 || doc.leaders.length > 0;
  return html`${header(doc)}
${doc.stages.map(stageSection)}
${resultsSection(doc)}
${when(doc.fixtures.length > 0, () => fixturesSection(doc))}
${when(hasStatistics, () => statisticsSection(doc))}`;
}

export function renderTournament(doc: TournamentDocument, options: PrintOptions): string {
  return printDocument({ title: `Tournament - ${doc.title}`, runningFooter: doc.title, body: renderTournamentBody(doc) }, options);
}

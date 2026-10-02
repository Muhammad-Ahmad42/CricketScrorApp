import { formatNrr } from '@/domain/scoring';
import type { StandingRow, StandingsTable, TeamId } from '@/domain/types';
import { html, when, type SafeHtml } from './html';
import type { NameLookup } from './text';

export interface StandingsLine {
  readonly position: string;
  readonly team: string;
  readonly played: string;
  readonly won: string;
  readonly lost: string;
  readonly tied: string;
  readonly noResult: string;
  readonly points: string;
  readonly nrr: string;
  readonly note: string | null;
  readonly highlight: boolean;
}

export interface StandingsDocument {
  readonly title: string;
  readonly rows: readonly StandingsLine[];
  readonly notes: readonly string[];
}

function rowName(row: StandingRow, teamName: NameLookup): string {
  if (row.teamId !== null) {
    return teamName(row.teamId);
  }
  return row.slotLabel ?? 'To be decided';
}

function rowNotes(row: StandingRow, name: string): readonly string[] {
  const notes: string[] = [];
  if (row.pointsAdjustment !== 0) {
    const sign = row.pointsAdjustment > 0 ? '+' : '';
    notes.push(`${name}: ${sign}${row.pointsAdjustment} ${Math.abs(row.pointsAdjustment) === 1 ? 'point' : 'points'} adjustment.`);
  }
  if (row.tieBreak !== null && row.tieBreak.detail.trim().length > 0) {
    notes.push(`${name}: ${row.tieBreak.detail}`);
  }
  if (row.membership === 'withdrawn') {
    notes.push(`${name} withdrew from the tournament.`);
  }
  return notes;
}

export function standingsDocument(
  title: string,
  table: StandingsTable,
  teamName: NameLookup,
  highlight: ReadonlySet<TeamId> = new Set(),
): StandingsDocument {
  const rows = table.rows.map((row): StandingsLine => {
    const name = rowName(row, teamName);
    return {
      position: `${row.position}${row.sharedPosition ? '=' : ''}`,
      team: `${name}${row.provisional ? ' (provisional)' : ''}`,
      played: String(row.played),
      won: String(row.won),
      lost: String(row.lost),
      tied: String(row.tied),
      noResult: String(row.noResult),
      points: String(row.points),
      nrr: formatNrr(row.nrr),
      note: row.qualification?.explanation ?? null,
      highlight: row.teamId !== null && highlight.has(row.teamId),
    };
  });
  const notes = table.rows.flatMap((row) => rowNotes(row, rowName(row, teamName)));
  return { title, rows, notes };
}

export function renderStandings(doc: StandingsDocument, options: { readonly withNotes: boolean }): SafeHtml {
  const body =
    doc.rows.length === 0
      ? html`<tr><td colspan="${options.withNotes ? 10 : 9}" class="empty">No teams in this table yet.</td></tr>`
      : doc.rows.map(
          (row) => html`<tr${row.highlight ? html` class="highlight"` : ''}>
<td class="num">${row.position}</td><td class="name">${row.highlight ? html`<b>${row.team}</b>` : row.team}</td>
<td class="num">${row.played}</td><td class="num">${row.won}</td><td class="num">${row.lost}</td><td class="num">${row.tied}</td>
<td class="num">${row.noResult}</td><td class="num"><b>${row.points}</b></td><td class="num">${row.nrr}</td>${when(options.withNotes, () => html`<td class="dismissal">${row.note ?? ''}</td>`)}
</tr>`,
        );
  return html`<div class="block">
<h3>${doc.title}</h3>
<table class="standings">
<thead><tr><th class="num">Pos</th><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">T</th><th class="num">NR</th><th class="num">Pts</th><th class="num">NRR</th>${when(options.withNotes, () => html`<th>Qualification</th>`)}</tr></thead>
<tbody>
${body}
</tbody>
</table>
${when(doc.notes.length > 0, () => html`<ul class="notes">${doc.notes.map((note) => html`<li>${note}</li>`)}</ul>`)}
</div>`;
}

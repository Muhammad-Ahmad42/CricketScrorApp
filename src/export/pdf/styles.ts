import { cssString } from './html';

export const PRINT_PALETTE = {
  paper: '#FFFFFF',
  ink: '#1A1C19',
  inkSecondary: '#474E49',
  hairline: '#B7C2C8',
  accent: '#00606F',
  band: '#EEF3F5',
} as const;

export const TEXT_FONT_STACK = "'Inter', -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif";
export const FIGURE_FONT_STACK = "'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";

export function printCss(runningFooter: string): string {
  const p = PRINT_PALETTE;
  return `
@page { size: A4 portrait; margin: 14mm 12mm 16mm; @bottom-center { content: ${cssString(runningFooter)} " \\b7  page " counter(page) " of " counter(pages); font-family: ${TEXT_FONT_STACK}; font-size: 7pt; color: ${p.inkSecondary}; } }
:root { color-scheme: only light; }
* { box-sizing: border-box; }
html { background: ${p.paper}; }
body { margin: 0; background: ${p.paper}; color: ${p.ink}; font-family: ${TEXT_FONT_STACK}; font-size: 9pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
header.doc { border-bottom: 1.5pt solid ${p.accent}; padding-bottom: 6pt; margin-bottom: 10pt; }
.kicker { margin: 0; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${p.inkSecondary}; }
h1 { margin: 2pt 0 1pt; font-size: 18pt; font-weight: 700; line-height: 1.15; }
h2 { margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 0.75pt solid ${p.ink}; font-size: 11pt; font-weight: 700; display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
h3 { margin: 8pt 0 2pt; font-size: 9.5pt; font-weight: 700; }
.teams { margin: 0; font-size: 10pt; color: ${p.inkSecondary}; }
.result { margin: 4pt 0 2pt; font-size: 12pt; font-weight: 700; }
.meta { margin: 1pt 0; font-size: 9pt; color: ${p.inkSecondary}; }
.meta b { color: ${p.ink}; font-weight: 600; }
.figure { font-family: ${FIGURE_FONT_STACK}; font-weight: 600; font-variant-numeric: tabular-nums; }
.score { font-size: 13pt; }
.sub { font-size: 8.5pt; font-weight: 400; color: ${p.inkSecondary}; }
.target { margin: 0 0 3pt; font-size: 8.5pt; color: ${p.inkSecondary}; }
table { width: 100%; border-collapse: collapse; margin: 3pt 0 7pt; font-size: 8.5pt; font-variant-numeric: tabular-nums; }
thead { display: table-header-group; }
tfoot { display: table-row-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { padding: 2pt 4pt; border-bottom: 0.75pt solid ${p.ink}; text-align: left; font-weight: 600; color: ${p.inkSecondary}; white-space: nowrap; }
td { padding: 2pt 4pt; border-bottom: 0.5pt solid ${p.hairline}; vertical-align: top; }
th.num, td.num { text-align: right; white-space: nowrap; width: 1%; }
td.name { font-weight: 600; }
td.dismissal { color: ${p.inkSecondary}; }
td.label { font-weight: 600; }
tr.extras td { border-bottom: 0; }
tr.total td { border-top: 0.75pt solid ${p.ink}; border-bottom: 2.25pt double ${p.ink}; font-weight: 700; }
tr.group td { padding-top: 5pt; border-bottom: 0.75pt solid ${p.ink}; font-weight: 700; }
.line { margin: 3pt 0; font-size: 8.5pt; }
.line b { font-weight: 600; }
.block { break-inside: avoid; page-break-inside: avoid; }
table.overs tbody tr:nth-child(even) td { background: ${p.band}; }
.balls { white-space: normal; }
.ball { display: inline-block; min-width: 13pt; margin: 0 2pt 1pt 0; padding: 0 2pt; border: 0.5pt dashed ${p.hairline}; text-align: center; }
.ball.wicket { font-weight: 700; border-style: solid; border-color: ${p.ink}; }
.mark { font-weight: 400; color: ${p.inkSecondary}; }
.winner { color: ${p.accent}; font-weight: 700; }
.champion { margin: 6pt 0 0; padding: 6pt 8pt; border: 0.75pt solid ${p.accent}; font-size: 11pt; font-weight: 700; }
.notes { margin: 2pt 0 8pt; padding-left: 12pt; font-size: 8pt; color: ${p.inkSecondary}; }
.empty { font-size: 8.5pt; color: ${p.inkSecondary}; font-style: italic; }
section { margin-bottom: 6pt; }
footer.doc { margin-top: 14pt; padding-top: 4pt; border-top: 0.5pt solid ${p.hairline}; font-size: 7.5pt; color: ${p.inkSecondary}; }
@media screen { body { max-width: 186mm; margin: 0 auto; padding: 12mm; } }
`.trim();
}

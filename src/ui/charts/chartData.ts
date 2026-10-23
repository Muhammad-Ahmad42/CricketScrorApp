export interface WormPoint {
  readonly over: number;
  readonly runs: number;
  readonly wickets: number;
}

export interface WormSeries {
  readonly label: string;
  readonly points: readonly WormPoint[];
}

export interface ManhattanOver {
  readonly over: number;
  readonly runs: number;
  readonly wickets: number;
}

export interface ManhattanInnings {
  readonly label: string;
  readonly overs: readonly ManhattanOver[];
}

export interface PartnershipBarItem {
  readonly key: string;
  readonly wicketLabel: string;
  readonly batters: string;
  readonly runs: number;
  readonly balls: number;
  readonly accessibilityLabel: string;
}

export const MAX_SERIES = 2;

export function niceMax(value: number, sections = 4): number {
  if (value <= 0) {
    return sections;
  }
  const rawStep = value / sections;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10];
  const step = candidates.map((c) => c * magnitude).find((c) => c >= rawStep) ?? 10 * magnitude;
  return step * sections;
}

export function wormMax(series: readonly WormSeries[]): number {
  return series.reduce((max, s) => s.points.reduce((m, p) => Math.max(m, p.runs), max), 0);
}

export function wormOvers(series: readonly WormSeries[]): number {
  return series.reduce((max, s) => s.points.reduce((m, p) => Math.max(m, p.over), max), 0);
}

export function manhattanMax(innings: readonly ManhattanInnings[]): number {
  return innings.reduce((max, i) => i.overs.reduce((m, o) => Math.max(m, o.runs), max), 0);
}

export function axisLabelEvery(overs: number): number {
  if (overs <= 10) {
    return 1;
  }
  if (overs <= 20) {
    return 5;
  }
  return 10;
}

export interface WormTableCell {
  readonly runs: number;
  readonly wickets: number;
}

export interface WormTableRow {
  readonly over: number;
  readonly cells: readonly (WormTableCell | null)[];
}

function cellAt(points: readonly WormPoint[], over: number): WormTableCell | null {
  const point = points.find((p) => p.over === over);
  if (!point) {
    return null;
  }
  const wickets = points.filter((p) => p.over <= over).reduce((sum, p) => sum + p.wickets, 0);
  return { runs: point.runs, wickets };
}

export function wormTableRows(series: readonly WormSeries[]): readonly WormTableRow[] {
  const overs = wormOvers(series);
  return Array.from({ length: overs }, (_, index) => {
    const over = index + 1;
    return { over, cells: series.map((s) => cellAt(s.points, over)) };
  });
}

export function wicketMarkText(wickets: number): string {
  return wickets > 1 ? `${wickets}W` : 'W';
}

export function runsAndWicketsText(runs: number, wickets: number): string {
  return `${runs} ${runs === 1 ? 'run' : 'runs'}, ${wickets} ${wickets === 1 ? 'wicket' : 'wickets'}`;
}

import type { PrintOptions } from './page';
import { scorecardDocument } from './scorecard/assemble';
import type { ScorecardSource } from './scorecard/model';
import { renderScorecard } from './scorecard/render';
import { tournamentDocument } from './tournament/assemble';
import type { TournamentPdfSource } from './tournament/model';
import { renderTournament } from './tournament/render';

export function buildScorecardHtml(source: ScorecardSource, options: PrintOptions): string {
  return renderScorecard(scorecardDocument(source), options);
}

export function buildTournamentHtml(source: TournamentPdfSource, options: PrintOptions): string {
  return renderTournament(tournamentDocument(source), options);
}

export { formatPrintDate, formatPrintDateTime } from './dates';
export { cssString, escapeHtml } from './html';
export type { PrintOptions } from './page';
export { PRINT_PALETTE } from './styles';
export { scorecardDocument } from './scorecard/assemble';
export { renderScorecard } from './scorecard/render';
export type {
  BattingLine,
  BowlingLine,
  InningsDocument,
  OverLine,
  PartnershipLine,
  ScorecardDocument,
  ScorecardSource,
  ScorecardTournamentContext,
  StandingsSource,
} from './scorecard/model';
export type { StandingsDocument, StandingsLine } from './standings';
export { tournamentDocument } from './tournament/assemble';
export { renderTournament } from './tournament/render';
export type { TournamentDocument, TournamentPdfSource } from './tournament/model';

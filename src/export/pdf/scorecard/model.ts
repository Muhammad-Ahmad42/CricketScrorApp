import type { Match, MatchSetup, MatchState, StandingsTable, TeamRef, Venue } from '@/domain/types';
import type { StandingsDocument } from '../standings';

export interface ScorecardTournamentContext {
  readonly tournamentName: string;
  readonly stageName: string | null;
  readonly poolName: string | null;
  readonly fixtureLabel: string | null;
}

export interface StandingsSource {
  readonly title: string;
  readonly table: StandingsTable;
  readonly teams: readonly TeamRef[];
}

export interface ScorecardSource {
  readonly match: Match;
  readonly setup: MatchSetup;
  readonly state: MatchState;
  readonly venue: Pick<Venue, 'name' | 'location'> | null;
  readonly tournament: ScorecardTournamentContext | null;
  readonly standings: readonly StandingsSource[];
}

export interface BattingLine {
  readonly name: string;
  readonly marks: string;
  readonly dismissal: string;
  readonly runs: string;
  readonly balls: string;
  readonly fours: string;
  readonly sixes: string;
  readonly strikeRate: string;
  readonly notOut: boolean;
}

export interface BowlingLine {
  readonly name: string;
  readonly overs: string;
  readonly maidens: string;
  readonly runs: string;
  readonly wickets: string;
  readonly economy: string;
  readonly dots: string;
  readonly wides: string;
  readonly noBalls: string;
}

export interface PartnershipLine {
  readonly wicket: string;
  readonly batters: string;
  readonly runs: string;
  readonly balls: string;
  readonly unbroken: boolean;
}

export interface BallCell {
  readonly text: string;
  readonly wicket: boolean;
  readonly label: string;
}

export interface OverLine {
  readonly over: string;
  readonly bowler: string;
  readonly balls: readonly BallCell[];
  readonly runs: string;
  readonly wickets: string;
  readonly score: string;
}

export interface InningsDocument {
  readonly heading: string;
  readonly score: string;
  readonly oversLabel: string;
  readonly target: string | null;
  readonly batting: readonly BattingLine[];
  readonly extras: string;
  readonly extrasDetail: string;
  readonly total: string;
  readonly totalDetail: string;
  readonly didNotBat: readonly string[];
  readonly fallOfWickets: readonly string[];
  readonly bowling: readonly BowlingLine[];
  readonly partnerships: readonly PartnershipLine[];
  readonly overs: readonly OverLine[];
}

export interface ScorecardDocument {
  readonly title: string;
  readonly kicker: string | null;
  readonly teams: string;
  readonly result: string;
  readonly toss: string | null;
  readonly venue: string | null;
  readonly date: string | null;
  readonly format: string;
  readonly innings: readonly InningsDocument[];
  readonly superOvers: readonly InningsDocument[];
  readonly standings: readonly StandingsDocument[];
}

import type { PlayerId, TournamentEvaluation, TournamentSnapshot, TournamentStats, Venue } from '@/domain/types';
import type { StandingsDocument } from '../standings';

export interface TournamentPdfSource {
  readonly snapshot: TournamentSnapshot;
  readonly evaluation: TournamentEvaluation;
  readonly stats: TournamentStats | null;
  readonly venues: readonly Pick<Venue, 'id' | 'name'>[];
  readonly playerNames: Readonly<Record<PlayerId, string>>;
}

export interface Fact {
  readonly label: string;
  readonly value: string;
}

export interface BracketMatch {
  readonly label: string;
  readonly sideA: string;
  readonly sideB: string;
  readonly winner: 'A' | 'B' | null;
  readonly outcome: string;
}

export interface BracketRound {
  readonly name: string;
  readonly matches: readonly BracketMatch[];
}

export interface StageDocument {
  readonly name: string;
  readonly status: string;
  readonly tables: readonly StandingsDocument[];
  readonly bracket: readonly BracketRound[];
}

export interface ResultLine {
  readonly number: string;
  readonly date: string;
  readonly stage: string;
  readonly teams: string;
  readonly scores: string;
  readonly result: string;
}

export interface FixtureLine {
  readonly number: string;
  readonly date: string;
  readonly stage: string;
  readonly teams: string;
  readonly venue: string;
  readonly status: string;
}

export interface RecordLine {
  readonly label: string;
  readonly holder: string;
  readonly detail: string;
}

export interface LeaderLine {
  readonly name: string;
  readonly team: string;
  readonly matches: string;
  readonly figures: readonly string[];
}

export interface LeaderTable {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly LeaderLine[];
}

export interface TournamentDocument {
  readonly title: string;
  readonly season: string | null;
  readonly description: string | null;
  readonly facts: readonly Fact[];
  readonly champion: string | null;
  readonly stages: readonly StageDocument[];
  readonly results: readonly ResultLine[];
  readonly fixtures: readonly FixtureLine[];
  readonly records: readonly RecordLine[];
  readonly leaders: readonly LeaderTable[];
}

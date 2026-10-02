import type { BracketPosition, Fixture, FixtureStatus, Stage, StageEvaluation, StageStatus } from '@/domain/types';
import { formatPrintDate } from '../dates';
import { standingsDocument, type StandingsDocument } from '../standings';
import type { BracketMatch, BracketRound, StageDocument, TournamentPdfSource } from './model';
import type { TournamentNames } from './naming';

const BRACKET_KIND_ORDER: Readonly<Record<BracketPosition['kind'], number>> = { main: 0, third_place: 1, placement: 2 };

export function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'pending':
      return 'Not started';
    case 'active':
      return 'In progress';
    case 'completed':
      return 'Completed';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function fixtureStatusLabel(status: FixtureStatus): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'postponed':
      return 'Postponed';
    case 'rescheduled':
      return 'Rescheduled';
    case 'live':
      return 'In progress';
    case 'completed':
      return 'Result pending';
    case 'abandoned':
      return 'Abandoned';
    case 'cancelled':
      return 'Cancelled';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function stageTables(stage: Stage, evaluation: StageEvaluation | undefined, source: TournamentPdfSource, names: TournamentNames): readonly StandingsDocument[] {
  if (evaluation === undefined) {
    return [];
  }
  const pools = new Map(source.snapshot.pools.map((pool) => [pool.id, pool.name]));
  const tables = evaluation.tables.map((table) =>
    standingsDocument(table.poolId === null ? stage.name : pools.get(table.poolId) ?? stage.name, table, names.team),
  );
  return evaluation.overall === null || evaluation.tables.length <= 1
    ? tables
    : [...tables, standingsDocument(`${stage.name} · overall`, evaluation.overall, names.team)];
}

function bracketMatch(fixture: Fixture, names: TournamentNames): BracketMatch {
  const summary = names.summaryOf(fixture);
  const winnerId = summary?.winnerTeamId ?? null;
  const winner = winnerId === null ? null : winnerId === names.teamIdOf(fixture, 'A') ? 'A' : winnerId === names.teamIdOf(fixture, 'B') ? 'B' : null;
  const pending = fixture.status === 'scheduled' && fixture.scheduledDate !== null ? formatPrintDate(fixture.scheduledDate) ?? 'Scheduled' : fixtureStatusLabel(fixture.status);
  return {
    label: fixture.label ?? `Match ${fixture.matchNumber}`,
    sideA: names.side(fixture, 'A'),
    sideB: names.side(fixture, 'B'),
    winner,
    outcome: summary === null ? pending : names.resultText(summary),
  };
}

function bracketRounds(stage: Stage, source: TournamentPdfSource, names: TournamentNames): readonly BracketRound[] {
  const fixtures = source.snapshot.fixtures
    .filter((fixture): fixture is Fixture & { readonly bracket: BracketPosition } => fixture.stageId === stage.id && fixture.bracket !== null)
    .sort(
      (a, b) =>
        BRACKET_KIND_ORDER[a.bracket.kind] - BRACKET_KIND_ORDER[b.bracket.kind] ||
        a.bracket.round - b.bracket.round ||
        a.bracket.position - b.bracket.position,
    );
  const rounds: { key: string; name: string; matches: BracketMatch[] }[] = [];
  fixtures.forEach((fixture) => {
    const key = `${fixture.bracket.kind}:${fixture.bracket.round}`;
    const last = rounds[rounds.length - 1];
    const name = fixture.bracket.roundName.trim().length > 0 ? fixture.bracket.roundName : `Round ${fixture.bracket.round}`;
    if (last === undefined || last.key !== key) {
      rounds.push({ key, name, matches: [bracketMatch(fixture, names)] });
    } else {
      last.matches.push(bracketMatch(fixture, names));
    }
  });
  return rounds.map((round) => ({ name: round.name, matches: round.matches }));
}

export function stageDocuments(source: TournamentPdfSource, names: TournamentNames): readonly StageDocument[] {
  const evaluations = new Map(source.evaluation.stages.map((stage) => [stage.stageId, stage]));
  return [...source.snapshot.stages]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((stage) => ({
      name: stage.name,
      status: stageStatusLabel(stage.status),
      tables: stageTables(stage, evaluations.get(stage.id), source, names),
      bracket: bracketRounds(stage, source, names),
    }));
}

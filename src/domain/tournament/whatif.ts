import type {
  Fixture,
  HypotheticalResult,
  MatchSummary,
  QualificationChange,
  TeamId,
  TournamentEvaluation,
  TournamentSnapshot,
  WhatIfResult,
} from '../types';
import { indexesOf, qualificationChanges, slotChanges, standingChanges, standingSentence } from './evaluation/diff';
import { joinNames } from './evaluation/format';
import { buildHypotheticalSummary, effectiveMatchRules, withSummary } from './evaluation/hypothetical';
import { slotPhrase } from './evaluation/qualificationText';
import { isTerminalStatus } from './evaluation/sides';
import { indexSnapshot, stageName } from './evaluation/snapshotIndex';
import { evaluateTournament, resolveFixtureTeams } from './evaluate';
import type { QualificationOptions } from './qualification';

export function hypotheticalSummary(
  fixture: Fixture,
  sideTeams: { readonly a: TeamId; readonly b: TeamId },
  hypothetical: HypotheticalResult,
  allottedBalls: number,
  ballsPerOver: number,
): MatchSummary {
  return buildHypotheticalSummary(fixture, sideTeams, hypothetical, allottedBalls, ballsPerOver);
}

function fixtureName(fixture: Fixture): string {
  return fixture.label ? `Match ${fixture.matchNumber} (${fixture.label})` : `Match ${fixture.matchNumber}`;
}

function describeHypothetical(hypothetical: HypotheticalResult, a: string, b: string): string {
  const bonus = hypothetical.bonus ? ' with a bonus point' : '';
  switch (hypothetical.outcome) {
    case 'side_a_win':
      return `${a} beat ${b}${bonus}`;
    case 'side_b_win':
      return `${b} beat ${a}${bonus}`;
    case 'tie': {
      const winner = hypothetical.tieWinner === 'side_a' ? a : hypothetical.tieWinner === 'side_b' ? b : null;
      return winner ? `${a} and ${b} tie and ${winner} win the super over` : `${a} and ${b} tie`;
    }
    case 'no_result':
      return `${a} v ${b} ends without a result`;
    case 'abandoned':
      return `${a} v ${b} is abandoned`;
    case 'side_a_walkover':
      return `${a} get a walkover against ${b}`;
    case 'side_b_walkover':
      return `${b} get a walkover against ${a}`;
    default: {
      const never: never = hypothetical.outcome;
      return never;
    }
  }
}

function isPlayed(fixture: Fixture): boolean {
  return isTerminalStatus(fixture.status);
}

interface Pending {
  readonly hypothetical: HypotheticalResult;
  readonly fixture: Fixture;
  readonly orderIndex: number;
}

function phaseOf(entry: Pending): string {
  return `${entry.orderIndex}:${entry.fixture.bracket?.round ?? 0}`;
}

function orderedHypotheticals(snapshot: TournamentSnapshot, hypotheticals: readonly HypotheticalResult[], narrative: string[]): readonly Pending[] {
  const stageOrder = new Map(snapshot.stages.map((stage) => [stage.id, stage.orderIndex]));
  const pending: Pending[] = [];
  for (const hypothetical of hypotheticals) {
    const fixture = snapshot.fixtures.find((candidate) => candidate.id === hypothetical.fixtureId);
    if (!fixture) {
      narrative.push('A hypothetical result for a fixture that no longer exists was ignored.');
      continue;
    }
    if (isPlayed(fixture)) {
      narrative.push(`${fixtureName(fixture)} has already been played, so its hypothetical result was ignored.`);
      continue;
    }
    pending.push({ hypothetical, fixture, orderIndex: stageOrder.get(fixture.stageId) ?? 0 });
  }
  return pending
    .map((entry, position) => ({ entry, position }))
    .sort(
      (x, y) =>
        x.entry.orderIndex - y.entry.orderIndex ||
        (x.entry.fixture.bracket?.round ?? 0) - (y.entry.fixture.bracket?.round ?? 0) ||
        x.position - y.position,
    )
    .map(({ entry }) => entry);
}

function teamLabel(names: ReadonlyMap<TeamId, string>, teamId: TeamId): string {
  return names.get(teamId) ?? teamId;
}

function heldPhrase(working: TournamentSnapshot, after: TournamentEvaluation, stageId: string, teamId: TeamId): string {
  const index = indexSnapshot(working);
  for (const stage of after.stages) {
    for (const qualification of stage.qualification) {
      if (qualification.teamId !== teamId) continue;
      const target = qualification.targets.find((candidate) => candidate.stageId === stageId);
      const slotId = target?.slotIds[0];
      const slot = slotId === undefined ? undefined : index.slotById.get(slotId);
      const resolution = after.stages.flatMap((candidate) => candidate.slots).find((candidate) => candidate.slotId === slotId);
      if (slot && resolution?.status === 'final') return ` as ${slotPhrase(index, slot)}`;
    }
  }
  return '';
}

function qualificationEffect(working: TournamentSnapshot, after: TournamentEvaluation, change: QualificationChange, name: string): string | null {
  const stage = `the ${stageName(indexSnapshot(working), change.stageId)}`;
  if (change.after === 'qualified') return `${name} qualify for ${stage}${heldPhrase(working, after, change.stageId, change.teamId)}`;
  if (change.after === 'eliminated') return `${name} are eliminated from ${stage}`;
  if (change.after === 'in_contention' && change.before === 'qualified') return `${name} are no longer certain of a place in ${stage}`;
  if (change.after === 'in_contention' && change.before === null) return `${name} are in contention for ${stage}`;
  if (change.after === 'in_contention') return `${name} are back in contention for ${stage}`;
  return null;
}

function consequences(snapshot: TournamentSnapshot, working: TournamentSnapshot, before: TournamentEvaluation, after: TournamentEvaluation): string[] {
  const indexes = indexesOf(working, snapshot);
  const names = indexes[0].teamNames;
  const qualification = qualificationChanges(before, after)
    .map((change) => qualificationEffect(working, after, change, names.get(change.teamId) ?? change.teamId))
    .filter((line): line is string => line !== null);
  const moves = standingChanges(before, after)
    .map((change) => standingSentence(indexes, change))
    .filter((line): line is string => line !== null)
    .map((line) => line.slice(0, -1));
  return [...qualification, ...moves];
}

export function simulate(snapshot: TournamentSnapshot, hypotheticals: readonly HypotheticalResult[], opts?: QualificationOptions): WhatIfResult {
  const before = evaluateTournament(snapshot, opts);
  const narrative: string[] = [];
  const names = new Map(snapshot.teams.map((view) => [view.team.id, view.team.name]));
  let working = snapshot;
  let evaluation = before;
  let dirty = false;
  let appliedPhase: string | null = null;
  const applied: HypotheticalResult[] = [];
  const phrases: string[] = [];
  for (const entry of orderedHypotheticals(snapshot, hypotheticals, narrative)) {
    const fixture = working.fixtures.find((candidate) => candidate.id === entry.fixture.id) ?? entry.fixture;
    const phase = phaseOf(entry);
    if (dirty && phase !== appliedPhase) {
      evaluation = evaluateTournament(working, opts);
      dirty = false;
    }
    let teams = resolveFixtureTeams(evaluation, fixture);
    if ((teams.a === null || teams.b === null) && dirty) {
      evaluation = evaluateTournament(working, opts);
      dirty = false;
      teams = resolveFixtureTeams(evaluation, fixture);
    }
    if (teams.a === null || teams.b === null) {
      narrative.push(`${fixtureName(fixture)} was skipped because its teams are not known yet.`);
      continue;
    }
    const rules = effectiveMatchRules(working, fixture);
    const summary = hypotheticalSummary(fixture, { a: teams.a, b: teams.b }, entry.hypothetical, rules.oversPerInnings * rules.ballsPerOver, rules.ballsPerOver);
    working = withSummary(working, fixture.id, summary);
    dirty = true;
    appliedPhase = phase;
    applied.push(entry.hypothetical);
    phrases.push(describeHypothetical(entry.hypothetical, teamLabel(names, teams.a), teamLabel(names, teams.b)));
  }
  const after = applied.length > 0 ? evaluateTournament(working, opts) : before;
  if (phrases.length > 0) {
    const effects = consequences(snapshot, working, before, after);
    const lead = `If ${joinNames(phrases)}, `;
    narrative.unshift(
      effects.length > 0 ? `${lead}${effects[0]}.` : `${lead}the standings and qualification do not change.`,
      ...effects.slice(1).map((effect) => `${effect}.`),
    );
  }
  return {
    hypotheticals: applied,
    before: { tables: before.stages.flatMap((stage) => stage.tables), qualification: before.stages.flatMap((stage) => stage.qualification) },
    after: { tables: after.stages.flatMap((stage) => stage.tables), qualification: after.stages.flatMap((stage) => stage.qualification) },
    standingChanges: standingChanges(before, after),
    qualificationChanges: qualificationChanges(before, after),
    slotChanges: slotChanges(snapshot, working, before, after),
    narrative,
  };
}

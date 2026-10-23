import type {
  Explained,
  Fixture,
  FixtureId,
  HypotheticalResult,
  MatchSummary,
  QualificationChange,
  StandingChange,
  StandingsTable,
  TeamId,
  TeamQualification,
  TieBreakerKind,
  TournamentEvaluation,
  TournamentSnapshot,
  WhatIfNrrStatus,
  WhatIfResult,
} from '../types';
import { explain } from '../text';
import { indexesOf, qualificationChanges, slotChanges, standingChanges, standingSentence } from './evaluation/diff';
import { joinNames, ordinal } from './evaluation/format';
import { buildHypotheticalSummary, effectiveMatchRules, scoreOf, withSummary } from './evaluation/hypothetical';
import { slotPhrase } from './evaluation/qualificationText';
import { isTerminalStatus } from './evaluation/sides';
import type { SnapshotIndex } from './evaluation/snapshotIndex';
import { indexSnapshot, stageName } from './evaluation/snapshotIndex';
import { countedMatches } from './evaluation/statsMatches';
import { evaluateTournament, resolveFixtureTeams } from './evaluate';
import type { QualificationOptions } from './qualification';

export function hypotheticalSummary(
  fixture: Fixture,
  sideTeams: { readonly a: TeamId; readonly b: TeamId },
  hypothetical: HypotheticalResult,
  allottedBalls: number,
  ballsPerOver: number,
  parRuns?: number,
): MatchSummary {
  return buildHypotheticalSummary(fixture, sideTeams, hypothetical, allottedBalls, ballsPerOver, parRuns);
}

const NRR_CRITERIA: readonly TieBreakerKind[] = ['nrr', 'head_to_head_nrr'];

export function parRunsPerBall(snapshot: TournamentSnapshot): number | null {
  let runs = 0;
  let balls = 0;
  for (const { summary } of countedMatches(snapshot)) {
    const first = summary.innings.find((innings) => innings.inningsIndex === 0);
    if (first === undefined || first.legalBalls === 0) continue;
    runs += first.runs;
    balls += first.legalBalls;
  }
  return balls === 0 ? null : runs / balls;
}

function countsTowardNrr(hypothetical: HypotheticalResult): boolean {
  return hypothetical.outcome === 'side_a_win' || hypothetical.outcome === 'side_b_win' || hypothetical.outcome === 'tie';
}

function nrrUncertainTeams(tables: readonly StandingsTable[], unscoredTeams: ReadonlySet<TeamId>): readonly TeamId[] {
  const teams = new Set<TeamId>();
  for (const table of tables) {
    for (const row of table.rows) {
      const note = row.tieBreak;
      if (note === null || note.separatedBy === null || !NRR_CRITERIA.includes(note.separatedBy) || row.teamId === null) continue;
      const pair = note.aboveTeamId === null ? [row.teamId] : [row.teamId, note.aboveTeamId];
      if (!pair.some((teamId) => unscoredTeams.has(teamId))) continue;
      pair.forEach((teamId) => teams.add(teamId));
    }
  }
  return [...teams];
}

interface Named {
  readonly fixture: Fixture;
}

function byMatchNumber(entries: readonly Named[]): readonly Named[] {
  return [...entries].sort((a, b) => a.fixture.matchNumber - b.fixture.matchNumber);
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

interface Noted {
  readonly notes: readonly string[];
  readonly items: readonly Explained[];
}

function nrrNotes(unscored: readonly string[], estimated: readonly string[], parPerOver: number | null): Noted {
  const notes: string[] = [];
  const items: Explained[] = [];
  if (unscored.length > 0) {
    const names = joinNames(unscored);
    const verb = unscored.length === 1 ? 'has' : 'have';
    notes.push(`NRR isn't simulated for ${names}: no score or margin. Places decided on NRR may change.`);
    items.push(explain('NRR not simulated', `${names} ${verb} no score or margin, so NRR stays as it is. Places decided on NRR may change.`));
  }
  if (estimated.length > 0 && parPerOver !== null) {
    const names = joinNames(estimated);
    const par = parPerOver.toFixed(2);
    notes.push(`NRR for ${names} is estimated from the margin, with a par of ${par} runs an over.`);
    items.push(explain('NRR estimated from margins', `${names}: par score of ${par} runs an over.`));
  }
  return { notes, items };
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

interface Narrated {
  readonly lines: string[];
  readonly items: Explained[];
}

function say(narrated: Narrated, line: string, item: Explained): void {
  narrated.lines.push(line);
  narrated.items.push(item);
}

function orderedHypotheticals(snapshot: TournamentSnapshot, hypotheticals: readonly HypotheticalResult[], narrative: Narrated): readonly Pending[] {
  const stageOrder = new Map(snapshot.stages.map((stage) => [stage.id, stage.orderIndex]));
  const pending: Pending[] = [];
  for (const hypothetical of hypotheticals) {
    const fixture = snapshot.fixtures.find((candidate) => candidate.id === hypothetical.fixtureId);
    if (!fixture) {
      say(narrative, 'A hypothetical result for a fixture that no longer exists was ignored.', explain('A result was ignored', 'Its fixture no longer exists.'));
      continue;
    }
    if (isPlayed(fixture)) {
      say(
        narrative,
        `${fixtureName(fixture)} has already been played, so its hypothetical result was ignored.`,
        explain(`${fixtureName(fixture)} ignored`, 'It has already been played.'),
      );
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

interface Effect {
  readonly line: string;
  readonly item: Explained;
}

function qualificationEffect(working: TournamentSnapshot, after: TournamentEvaluation, change: QualificationChange, name: string): Effect | null {
  const stage = `the ${stageName(indexSnapshot(working), change.stageId)}`;
  if (change.after === 'qualified') {
    const held = heldPhrase(working, after, change.stageId, change.teamId);
    return { line: `${name} qualify for ${stage}${held}`, item: explain(`${name} qualify`, `For ${stage}${held}.`) };
  }
  if (change.after === 'eliminated') return { line: `${name} are eliminated from ${stage}`, item: explain(`${name} eliminated`, `From ${stage}.`) };
  if (change.after === 'in_contention' && change.before === 'qualified') {
    return { line: `${name} are no longer certain of a place in ${stage}`, item: explain(`${name} no longer certain`, `Of a place in ${stage}.`) };
  }
  if (change.after === 'in_contention' && change.before === null) return { line: `${name} are in contention for ${stage}`, item: explain(`${name} in contention`, `For ${stage}.`) };
  if (change.after === 'in_contention') return { line: `${name} are back in contention for ${stage}`, item: explain(`${name} back in contention`, `For ${stage}.`) };
  return null;
}

function qualifyingPlaces(index: SnapshotIndex, change: StandingChange): number | null {
  for (const stage of index.stageById.values()) {
    for (const rule of stage.config.entryRules) {
      if (rule.kind === 'top_per_pool' && rule.sourceStageId === change.stageId && rule.fromPosition === 1 && change.poolId !== null) return rule.count;
      if (rule.kind === 'top_overall' && rule.sourceStageId === change.stageId && change.poolId === null) return rule.count;
    }
  }
  return null;
}

function qualificationOf(after: TournamentEvaluation, change: StandingChange): TeamQualification | null {
  for (const stage of after.stages) {
    const entry = stage.qualification.find((candidate) => candidate.teamId === change.teamId && candidate.stageId === change.stageId);
    if (entry !== undefined) return entry;
  }
  return null;
}

function placeLabel(index: SnapshotIndex, change: StandingChange): string {
  const pool = change.poolId === null ? undefined : index.poolById.get(change.poolId);
  return pool ? pool.name : stageName(index, change.stageId);
}

function moveSentence(indexes: readonly SnapshotIndex[], after: TournamentEvaluation, change: StandingChange): Effect | null {
  const sentence = standingSentence(indexes, change);
  if (sentence === null || change.after === null || change.before === null) return null;
  const index = indexes[0];
  const team = index.teamNames.get(change.teamId) ?? change.teamId;
  const plainLine = sentence.slice(0, -1);
  const plain: Effect = {
    line: plainLine,
    item: explain(`${team}: ${ordinal(change.before.position)} → ${ordinal(change.after.position)}`, `In ${placeLabel(index, change)}.`),
  };
  const qualification = qualificationOf(after, change);
  if (qualification === null || qualification.state !== 'eliminated') return plain;
  const places = qualifyingPlaces(index, change);
  if (places !== null && change.after.position > places) return plain;
  const target = qualification.targetStageId === null ? 'the next stage' : `the ${stageName(index, qualification.targetStageId)}`;
  const reach =
    qualification.certainty === 'manual'
      ? `are out of ${target} by the organizer's decision`
      : places === null
        ? `can no longer qualify for ${target}`
        : `can no longer finish in the top ${places}`;
  const line = `${team} would sit ${ordinal(change.after.position)} in ${placeLabel(index, change)} for now, but ${reach}`;
  return { line, item: explain(`${team} out despite ${ordinal(change.after.position)} place`, `${line}.`) };
}

function consequences(snapshot: TournamentSnapshot, working: TournamentSnapshot, before: TournamentEvaluation, after: TournamentEvaluation): Effect[] {
  const indexes = indexesOf(working, snapshot);
  const names = indexes[0].teamNames;
  const qualification = qualificationChanges(before, after)
    .map((change) => qualificationEffect(working, after, change, names.get(change.teamId) ?? change.teamId))
    .filter((effect): effect is Effect => effect !== null);
  const moves = standingChanges(before, after)
    .map((change) => moveSentence(indexes, after, change))
    .filter((effect): effect is Effect => effect !== null);
  return [...qualification, ...moves];
}

export function simulate(snapshot: TournamentSnapshot, hypotheticals: readonly HypotheticalResult[], opts?: QualificationOptions): WhatIfResult {
  const before = evaluateTournament(snapshot, opts);
  const narrated: Narrated = { lines: [], items: [] };
  const names = new Map(snapshot.teams.map((view) => [view.team.id, view.team.name]));
  let working = snapshot;
  let evaluation = before;
  let dirty = false;
  let appliedPhase: string | null = null;
  const applied: HypotheticalResult[] = [];
  const phrases: string[] = [];
  const parRate = parRunsPerBall(snapshot);
  const unscored: Named[] = [];
  const estimated: Named[] = [];
  const unscoredTeams = new Set<TeamId>();
  let parPerOver: number | null = null;
  for (const entry of orderedHypotheticals(snapshot, hypotheticals, narrated)) {
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
      say(narrated, `${fixtureName(fixture)} was skipped because its teams are not known yet.`, explain(`${fixtureName(fixture)} skipped`, "Its teams aren't known yet."));
      continue;
    }
    const rules = effectiveMatchRules(working, fixture);
    const allotted = rules.oversPerInnings * rules.ballsPerOver;
    const parRuns = (parRate ?? 1) * allotted;
    if (countsTowardNrr(entry.hypothetical)) {
      const scored = scoreOf(entry.hypothetical, allotted, parRuns);
      if (scored.score === null) {
        unscored.push({ fixture });
        unscoredTeams.add(teams.a);
        unscoredTeams.add(teams.b);
      } else if (scored.estimated) {
        estimated.push({ fixture });
        parPerOver ??= roundTo((parRate ?? 1) * rules.ballsPerOver, 2);
      }
    }
    const summary = hypotheticalSummary(fixture, { a: teams.a, b: teams.b }, entry.hypothetical, allotted, rules.ballsPerOver, parRuns);
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
    narrated.lines.unshift(
      effects.length > 0 ? `${lead}${effects[0].line}.` : `${lead}the standings and qualification do not change.`,
      ...effects.slice(1).map((effect) => `${effect.line}.`),
    );
    narrated.items.unshift(...(effects.length > 0 ? effects.map((effect) => effect.item) : [explain('No change to standings or qualification')]));
  }
  const afterTables = after.stages.flatMap((stage) => stage.tables);
  const unscoredSorted = byMatchNumber(unscored);
  const estimatedSorted = byMatchNumber(estimated);
  const noted = nrrNotes(
    unscoredSorted.map((entry) => fixtureName(entry.fixture)),
    estimatedSorted.map((entry) => fixtureName(entry.fixture)),
    parPerOver,
  );
  const nrr: WhatIfNrrStatus = {
    simulated: unscored.length === 0,
    unscoredFixtureIds: unscoredSorted.map((entry): FixtureId => entry.fixture.id),
    estimatedFixtureIds: estimatedSorted.map((entry): FixtureId => entry.fixture.id),
    parRunsPerOver: parPerOver,
    nrrUncertainTeamIds: nrrUncertainTeams(afterTables, unscoredTeams),
    notes: noted.notes,
    noteItems: noted.items,
  };
  return {
    hypotheticals: applied,
    before: { tables: before.stages.flatMap((stage) => stage.tables), qualification: before.stages.flatMap((stage) => stage.qualification) },
    after: { tables: afterTables, qualification: after.stages.flatMap((stage) => stage.qualification) },
    standingChanges: standingChanges(before, after),
    qualificationChanges: qualificationChanges(before, after),
    slotChanges: slotChanges(snapshot, working, before, after),
    narrative: narrated.lines,
    nrr,
    narrativeItems: narrated.items,
  };
}

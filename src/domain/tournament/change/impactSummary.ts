import type {
  ChangePlan,
  Explained,
  Fixture,
  FixtureImpact,
  ImpactSeverity,
  ImpactSummary,
  ProposedChange,
  TournamentEvaluation,
  TournamentSnapshot,
} from '../../types';
import {
  indexesOf,
  nrrChangedTeams,
  qualificationChanges,
  qualificationSentence,
  slotChanges,
  slotSentence,
  standingChanges,
  standingSentence,
} from '../evaluation/diff';
import { explain, splitExplained } from '../../text';
import { joinNames, plural, possessive } from '../evaluation/format';
import { countedSummaryOf } from '../evaluation/sides';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';
import { fixtureTeamsVia } from '../evaluation/stageTables';
import { isFixtureReplay } from '../fixtureReplay';
import { deepEqual } from './equality';
import { labelFixtureImpacts, labelQualificationChanges, labelStandingChanges } from './impactLabels';
import { slotShortfalls } from './slotShortfalls';

interface Evaluated {
  readonly snapshot: TournamentSnapshot;
  readonly evaluation: TournamentEvaluation;
  readonly index: SnapshotIndex;
}

function sideName(side: Evaluated, fixture: Fixture, which: 'a' | 'b'): string {
  const resolutions = new Map(side.evaluation.stages.flatMap((stage) => stage.slots).map((resolution) => [resolution.slotId, resolution]));
  const teams = fixtureTeamsVia(fixture, (slotId) => resolutions.get(slotId));
  const teamId = which === 'a' ? teams.a : teams.b;
  if (teamId !== null) return side.index.teamNames.get(teamId) ?? teamId;
  const raw = which === 'a' ? fixture.sideA : fixture.sideB;
  return raw.kind === 'slot' ? (side.index.slotById.get(raw.slotId)?.label ?? 'TBD') : raw.teamId;
}

function fixtureLabel(side: Evaluated, fixture: Fixture): string {
  return `Match ${fixture.matchNumber} · ${sideName(side, fixture, 'a')} v ${sideName(side, fixture, 'b')}`;
}

interface Said {
  readonly lines: readonly string[];
  readonly items: readonly Explained[];
}

const NOTHING_SAID: Said = { lines: [], items: [] };

function labelParts(label: string | null): { readonly match: string | null; readonly teams: string | null } {
  if (label === null) return { match: null, teams: null };
  const cut = label.indexOf(' · ');
  return cut === -1 ? { match: label, teams: null } : { match: label.slice(0, cut), teams: label.slice(cut + 3) };
}

function updateKind(before: Fixture, after: Fixture): FixtureImpact['change'] | null {
  if (!deepEqual(before.sideA, after.sideA) || !deepEqual(before.sideB, after.sideB)) return 'teams_changed';
  if (before.stageId !== after.stageId || before.poolId !== after.poolId) return 'moved';
  if (before.status !== after.status) return 'status_changed';
  if (before.scheduledDate !== after.scheduledDate || before.scheduledTime !== after.scheduledTime || before.venueId !== after.venueId) {
    return 'rescheduled';
  }
  return null;
}

function hasMatchData(fixture: Fixture): boolean {
  return fixture.matchId !== null;
}

export function fixtureImpacts(plan: ChangePlan, before: Evaluated, after: Evaluated): readonly FixtureImpact[] {
  const impacts = new Map<string, FixtureImpact>();
  const add = (impact: FixtureImpact) => {
    if (!impacts.has(impact.fixtureId)) impacts.set(impact.fixtureId, impact);
  };
  for (const id of plan.fixtures.delete) {
    const fixture = before.index.fixtureById.get(id);
    if (fixture) add({ fixtureId: id, label: fixtureLabel(before, fixture), change: 'removed', hasMatchData: hasMatchData(fixture) });
  }
  for (const draft of plan.fixtures.insert) {
    const fixture = after.index.fixtureById.get(draft.id);
    if (fixture) add({ fixtureId: draft.id, label: fixtureLabel(after, fixture), change: 'created', hasMatchData: false });
  }
  for (const updated of plan.fixtures.update) {
    const old = before.index.fixtureById.get(updated.id);
    const kind = old ? updateKind(old, updated) : null;
    if (old && kind) add({ fixtureId: updated.id, label: fixtureLabel(after, updated), change: kind, hasMatchData: hasMatchData(old) });
  }
  for (const created of plan.matchesToCreate) {
    const fixture = after.index.fixtureById.get(created.fixtureId);
    if (fixture) add({ fixtureId: fixture.id, label: fixtureLabel(after, fixture), change: 'result_changed', hasMatchData: false });
  }
  for (const change of plan.summaryChanges) {
    const fixture = before.snapshot.fixtures.find((candidate) => candidate.matchId === change.matchId);
    if (fixture) add({ fixtureId: fixture.id, label: fixtureLabel(before, fixture), change: 'result_changed', hasMatchData: true });
  }
  for (const fixture of after.snapshot.fixtures) {
    const old = before.index.fixtureById.get(fixture.id);
    if (!old || old.matchId !== null || fixture.matchId !== null || impacts.has(fixture.id)) continue;
    const previous = `${sideName(before, old, 'a')}|${sideName(before, old, 'b')}`;
    const next = `${sideName(after, fixture, 'a')}|${sideName(after, fixture, 'b')}`;
    if (previous !== next) add({ fixtureId: fixture.id, label: fixtureLabel(after, fixture), change: 'teams_changed', hasMatchData: false });
  }
  return [...impacts.values()];
}

function playedResultsOf(snapshot: TournamentSnapshot, teamId: string): number {
  return snapshot.fixtures.filter(
    (fixture) =>
      countedSummaryOf(snapshot.summaries, fixture) !== null &&
      (fixture.matchSides?.teamAId === teamId || fixture.matchSides?.teamBId === teamId),
  ).length;
}

function replayLines(change: ProposedChange, plan: ChangePlan, before: Evaluated): Said {
  if (change.kind !== 'fixture_update') return NOTHING_SAID;
  const old = before.index.fixtureById.get(change.fixtureId);
  const next = plan.fixtures.update.find((fixture) => fixture.id === change.fixtureId);
  if (!old || !next || !isFixtureReplay(old, change.patch) || old.matchId === null || next.matchId !== null) return NOTHING_SAID;
  const counted = countedSummaryOf(before.snapshot.summaries, old) !== null;
  const stays = counted ? 'The abandoned match stays on record but no longer counts.' : 'The abandoned match stays on record.';
  return {
    lines: [`${fixtureLabel(before, old)} will be replayed as a new match.`, stays],
    items: [explain(`Match ${old.matchNumber} will be replayed`, stays)],
  };
}

interface ResultSaid extends Said {
  readonly affected: number;
}

function removedFromStandings(owner: string, count: number): Said {
  const results = plural(count, 'result');
  return {
    lines: [`${owner} ${results} ${count === 1 ? 'is' : 'are'} removed from the standings.`],
    items: [explain(`${owner} ${results} removed`, `${count === 1 ? 'It no longer counts' : 'They no longer count'} in the standings.`)],
  };
}

function resultLines(change: ProposedChange, plan: ChangePlan, before: Evaluated): ResultSaid {
  const name = (teamId: string) => before.index.teamNames.get(teamId) ?? teamId;
  if (change.kind === 'team_replace') {
    const count = playedResultsOf(before.snapshot, change.outTeamId);
    if (count === 0) return { ...NOTHING_SAID, affected: 0 };
    const results = plural(count, 'result');
    const out = possessive(name(change.outTeamId));
    const one = count === 1;
    switch (change.priorResults) {
      case 'transfer_to_replacement': {
        const line = `${out} ${results} ${one ? 'transfers' : 'transfer'} to ${name(change.inTeamId)}.`;
        return { lines: [line], items: [explain(line)], affected: count };
      }
      case 'keep_for_opponents':
        return {
          lines: [`${out} ${results} ${one ? 'stays' : 'stay'} in the table for their opponents.`],
          items: [explain(`${out} ${results} kept for opponents`, `${one ? 'It stays' : 'They stay'} in the table for their opponents.`)],
          affected: 0,
        };
      case 'expunge':
        return { ...removedFromStandings(out, count), affected: count };
      default: {
        const never: never = change.priorResults;
        return never;
      }
    }
  }
  if (change.kind === 'team_withdraw') {
    const lines: string[] = [];
    const items: Explained[] = [];
    const count = change.remainingFixtures === 'walkover' ? plan.matchesToCreate.length : plan.fixtures.update.length;
    if (count > 0) {
      const matches = plural(count, 'remaining match', 'remaining matches');
      if (change.remainingFixtures === 'walkover') {
        lines.push(`${matches} become walkovers for the opponents.`);
        items.push(explain(`${matches} become walkovers`, 'The opponents get the wins.'));
      } else {
        lines.push(`${matches} will be cancelled.`);
        items.push(explain(`${matches} cancelled`));
      }
    }
    const played = playedResultsOf(before.snapshot, change.teamId);
    if (change.expungeResults && played > 0) {
      const removed = removedFromStandings(possessive(name(change.teamId)), played);
      lines.push(...removed.lines);
      items.push(...removed.items);
    }
    return { lines, items, affected: change.expungeResults ? played : 0 };
  }
  return { ...NOTHING_SAID, affected: 0 };
}

function fixtureLines(change: ProposedChange, impacts: readonly FixtureImpact[], before: Evaluated): readonly string[] {
  const count = (kind: FixtureImpact['change']) => impacts.filter((impact) => impact.change === kind).length;
  if (change.kind === 'fixtures_replace') {
    const scope = before.snapshot.fixtures.filter(
      (fixture) => fixture.stageId === change.stageId && (change.poolId === null || fixture.poolId === change.poolId),
    );
    const played = scope.filter(hasMatchData).length;
    if (scope.length === 0) return count('created') > 0 ? [`${plural(count('created'), 'fixture')} will be created.`] : [];
    return [`${plural(scope.length, 'fixture')} will be regenerated${played > 0 ? ` (${played} already played)` : ''}.`];
  }
  const lines: string[] = [];
  const phrase = (kind: FixtureImpact['change'], singular: string, pluralText = singular) => {
    const n = count(kind);
    if (n > 0) lines.push(`${plural(n, 'fixture')} ${n === 1 ? singular : pluralText}.`);
  };
  phrase('removed', 'will be removed');
  phrase('created', 'will be created');
  phrase('moved', 'will move to another pool or stage');
  phrase('teams_changed', 'changes teams', 'change teams');
  phrase('rescheduled', 'will be rescheduled');
  phrase('status_changed', 'changes status', 'change status');
  return lines;
}

function resultChangeLine(withdrawn: boolean, impacts: readonly FixtureImpact[]): Said {
  const label = impacts.find((impact) => impact.change === 'result_changed')?.label ?? null;
  const { match, teams } = labelParts(label);
  if (withdrawn) {
    return {
      lines: [label === null ? 'A match result no longer counts until the match is finished again.' : `The result of ${label} no longer counts until the match is finished again.`],
      items: [explain(`${match ?? 'A'} result no longer counts`, `It counts again once ${teams ?? 'the match'} is finished.`)],
    };
  }
  return {
    lines: [label === null ? 'A match result changes.' : `The result of ${label} changes.`],
    items: [explain(`${match ?? 'A match'} result changes`, teams)],
  };
}

function championLine(before: Evaluated, after: Evaluated): Said {
  const names = (evaluated: Evaluated) =>
    evaluated.evaluation.champion ? joinNames(evaluated.evaluation.champion.teamIds.map((teamId) => evaluated.index.teamNames.get(teamId) ?? teamId), '&') : null;
  const previous = names(before);
  const next = names(after);
  if (previous === next) return NOTHING_SAID;
  if (previous && next) return { lines: [`The champion changes from ${previous} to ${next}.`], items: [explain(`New champion: ${next}`, `Was ${previous}.`)] };
  if (next) return { lines: [`${next} become champion.`], items: [explain(`${next} become champion`)] };
  return { lines: [`${previous} are no longer champion.`], items: [explain(`${previous} no longer champion`)] };
}

function headline(impacts: readonly FixtureImpact[], standingsTeams: number, qualificationCount: number, planTouches: boolean): string {
  if (impacts.length > 0) {
    const completed = impacts.filter((impact) => impact.hasMatchData).length;
    return `${plural(impacts.length, 'fixture')} affected${completed > 0 ? `, ${completed} completed` : ''}`;
  }
  if (standingsTeams > 0) return `Standings change for ${plural(standingsTeams, 'team')}`;
  if (qualificationCount > 0) return 'Qualification changes';
  return planTouches ? 'No effect on results or fixtures' : 'Nothing changes';
}

function planTouches(plan: ChangePlan): boolean {
  return (
    plan.tournamentTeams.upsert.length > 0 ||
    plan.rules !== null ||
    plan.stages.upsert.length + plan.stages.delete.length > 0 ||
    plan.pools.upsert.length + plan.pools.delete.length > 0 ||
    plan.slots.upsert.length + plan.slots.delete.length > 0 ||
    plan.poolEntries.length > 0 ||
    plan.overrides.insert.length + plan.overrides.revoke.length > 0
  );
}

function severityOf(destructive: boolean, warning: boolean, info: boolean): ImpactSeverity {
  if (destructive) return 'destructive';
  if (warning) return 'warning';
  if (info) return 'info';
  return 'none';
}

export function summarizeImpact(
  change: ProposedChange,
  plan: ChangePlan,
  before: Evaluated,
  after: Evaluated,
  blocked: string | null,
): ImpactSummary {
  const indexes = indexesOf(after.snapshot, before.snapshot);
  const fixtures = fixtureImpacts(plan, before, after);
  const standings = standingChanges(before.evaluation, after.evaluation);
  const qualification = qualificationChanges(before.evaluation, after.evaluation);
  const slots = slotChanges(before.snapshot, after.snapshot, before.evaluation, after.evaluation);
  const shortfalls = slotShortfalls(before, after);
  const nrrTeams = nrrChangedTeams(standings);
  const results = resultLines(change, plan, before);
  const detached = fixtures.filter((impact) => impact.hasMatchData && impact.change !== 'result_changed' && impact.change !== 'rescheduled');
  const completedData = new Set(fixtures.filter((impact) => impact.hasMatchData).map((impact) => impact.fixtureId)).size + results.affected;
  const champion = championLine(before, after);
  const resultChange = change.kind === 'match_result_change' ? resultChangeLine(change.summary === null, fixtures) : NOTHING_SAID;
  const replay = replayLines(change, plan, before);
  const keyLines = [
    ...(blocked ? [blocked] : []),
    ...shortfalls.map((shortfall) => shortfall.message),
    ...resultChange.lines,
    ...replay.lines,
    ...results.lines,
    ...champion.lines,
  ];
  const keyItems: readonly Explained[] = [
    ...(blocked ? [splitExplained(blocked)] : []),
    ...shortfalls.map((shortfall) => explain(shortfall.headline ?? shortfall.message, shortfall.detail)),
    ...resultChange.items,
    ...replay.items,
    ...results.items,
    ...champion.items,
  ];
  const lines = [
    ...(blocked ? [blocked] : []),
    ...shortfalls.map((shortfall) => shortfall.message),
    ...resultChange.lines,
    ...fixtureLines(change, fixtures, before),
    ...replay.lines,
    ...results.lines,
    ...slots.map((slot) => slotSentence(indexes, before.snapshot, slot)),
    ...standings.map((line) => standingSentence(indexes, line)).filter((line): line is string => line !== null),
    ...qualification.map((line) => qualificationSentence(indexes, line)).filter((line): line is string => line !== null),
    ...(nrrTeams.length > 0 ? [`Net run rate changes for ${plural(nrrTeams.length, 'team')}.`] : []),
    ...champion.lines,
  ];
  const evaluationChanged = standings.length > 0 || qualification.length > 0 || slots.length > 0 || nrrTeams.length > 0 || champion.lines.length > 0;
  const severity = severityOf(
    detached.length > 0 || results.affected > 0,
    evaluationChanged || plan.summaryChanges.length > 0 || shortfalls.length > 0,
    fixtures.length > 0 || planTouches(plan),
  );
  const historical = change.kind === 'match_result_change' || completedData > 0;
  return {
    severity,
    headline: headline(fixtures, new Set(standings.map((line) => line.teamId)).size, qualification.length, planTouches(plan)),
    lines,
    fixtures: labelFixtureImpacts(before.snapshot, plan, fixtures),
    standings: labelStandingChanges(indexes, standings),
    qualification: labelQualificationChanges(indexes, qualification),
    slots,
    nrrChanged: nrrTeams.length > 0,
    completedMatchesAffected: completedData,
    requiresConfirmation:
      completedData > 0 || standings.length > 0 || qualification.length > 0 || nrrTeams.length > 0 || shortfalls.length > 0 || severity === 'destructive',
    requiresReason: historical || change.kind === 'override_apply' || change.kind === 'override_revoke',
    blocked: blocked ? { reason: blocked } : null,
    slotShortfalls: shortfalls,
    keyLines,
    keyItems,
  };
}

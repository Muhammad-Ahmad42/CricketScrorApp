import type {
  ChangePlan,
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
import { joinNames, plural, possessive } from '../evaluation/format';
import { countedSummaryOf } from '../evaluation/sides';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';
import { fixtureTeamsVia } from '../evaluation/stageTables';
import { isFixtureReplay } from '../fixtureReplay';
import { deepEqual } from './equality';

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

function replayLines(change: ProposedChange, plan: ChangePlan, before: Evaluated): readonly string[] {
  if (change.kind !== 'fixture_update') return [];
  const old = before.index.fixtureById.get(change.fixtureId);
  const next = plan.fixtures.update.find((fixture) => fixture.id === change.fixtureId);
  if (!old || !next || !isFixtureReplay(old, change.patch) || old.matchId === null || next.matchId !== null) return [];
  const counted = countedSummaryOf(before.snapshot.summaries, old) !== null;
  return [
    `${fixtureLabel(before, old)} will be replayed as a new match.`,
    counted
      ? 'The abandoned match stays on record, but its no result stops counting in the standings, net run rate and statistics.'
      : 'The abandoned match stays on record.',
  ];
}

function resultLines(change: ProposedChange, plan: ChangePlan, before: Evaluated): { readonly lines: readonly string[]; readonly affected: number } {
  const name = (teamId: string) => before.index.teamNames.get(teamId) ?? teamId;
  if (change.kind === 'team_replace') {
    const count = playedResultsOf(before.snapshot, change.outTeamId);
    if (count === 0) return { lines: [], affected: 0 };
    const results = plural(count, 'result');
    const out = possessive(name(change.outTeamId));
    const one = count === 1;
    switch (change.priorResults) {
      case 'transfer_to_replacement':
        return { lines: [`${out} ${results} ${one ? 'transfers' : 'transfer'} to ${name(change.inTeamId)}.`], affected: count };
      case 'keep_for_opponents':
        return { lines: [`${out} ${results} ${one ? 'stays' : 'stay'} in the table for their opponents.`], affected: 0 };
      case 'expunge':
        return { lines: [`${out} ${results} ${one ? 'is' : 'are'} removed from the standings.`], affected: count };
      default: {
        const never: never = change.priorResults;
        return never;
      }
    }
  }
  if (change.kind === 'team_withdraw') {
    const lines: string[] = [];
    const count = change.remainingFixtures === 'walkover' ? plan.matchesToCreate.length : plan.fixtures.update.length;
    if (count > 0) {
      lines.push(
        change.remainingFixtures === 'walkover'
          ? `${plural(count, 'remaining match', 'remaining matches')} become walkovers for the opponents.`
          : `${plural(count, 'remaining match', 'remaining matches')} will be cancelled.`,
      );
    }
    const played = playedResultsOf(before.snapshot, change.teamId);
    if (change.expungeResults && played > 0) {
      lines.push(`${possessive(name(change.teamId))} ${plural(played, 'result')} ${played === 1 ? 'is' : 'are'} removed from the standings.`);
    }
    return { lines, affected: change.expungeResults ? played : 0 };
  }
  return { lines: [], affected: 0 };
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
  if (change.kind === 'match_result_change') lines.push('A match result changes.');
  return lines;
}

function championLine(before: Evaluated, after: Evaluated): string | null {
  const names = (evaluated: Evaluated) =>
    evaluated.evaluation.champion ? joinNames(evaluated.evaluation.champion.teamIds.map((teamId) => evaluated.index.teamNames.get(teamId) ?? teamId), '&') : null;
  const previous = names(before);
  const next = names(after);
  if (previous === next) return null;
  if (previous && next) return `The champion changes from ${previous} to ${next}.`;
  if (next) return `${next} become champion.`;
  return `${previous} are no longer champion.`;
}

function headline(impacts: readonly FixtureImpact[], standingsTeams: number, qualificationCount: number, planTouches: boolean): string {
  if (impacts.length > 0) {
    const completed = impacts.filter((impact) => impact.hasMatchData).length;
    return `This change affects ${plural(impacts.length, 'fixture')}${completed > 0 ? `, ${completed} of them completed` : ''}.`;
  }
  if (standingsTeams > 0) return `This change affects the standings of ${plural(standingsTeams, 'team')}.`;
  if (qualificationCount > 0) return 'This change affects qualification.';
  return planTouches ? "This change doesn't affect any results or fixtures." : 'Nothing in the tournament changes.';
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
  const nrrTeams = nrrChangedTeams(standings);
  const results = resultLines(change, plan, before);
  const detached = fixtures.filter((impact) => impact.hasMatchData && impact.change !== 'result_changed' && impact.change !== 'rescheduled');
  const completedData = new Set(fixtures.filter((impact) => impact.hasMatchData).map((impact) => impact.fixtureId)).size + results.affected;
  const champion = championLine(before, after);
  const lines = [
    ...(blocked ? [blocked] : []),
    ...fixtureLines(change, fixtures, before),
    ...replayLines(change, plan, before),
    ...results.lines,
    ...slots.map((slot) => slotSentence(indexes, before.snapshot, slot)),
    ...standings.map((line) => standingSentence(indexes, line)).filter((line): line is string => line !== null),
    ...qualification.map((line) => qualificationSentence(indexes, line)).filter((line): line is string => line !== null),
    ...(nrrTeams.length > 0 ? [`Net run rate changes for ${plural(nrrTeams.length, 'team')}.`] : []),
    ...(champion ? [champion] : []),
  ];
  const evaluationChanged = standings.length > 0 || qualification.length > 0 || slots.length > 0 || nrrTeams.length > 0 || champion !== null;
  const severity = severityOf(
    detached.length > 0 || results.affected > 0,
    evaluationChanged || plan.summaryChanges.length > 0,
    fixtures.length > 0 || planTouches(plan),
  );
  const historical = change.kind === 'match_result_change' || completedData > 0;
  return {
    severity,
    headline: headline(fixtures, new Set(standings.map((line) => line.teamId)).size, qualification.length, planTouches(plan)),
    lines,
    fixtures,
    standings,
    qualification,
    slots,
    nrrChanged: nrrTeams.length > 0,
    completedMatchesAffected: completedData,
    requiresConfirmation: completedData > 0 || standings.length > 0 || qualification.length > 0 || nrrTeams.length > 0 || severity === 'destructive',
    requiresReason: historical || change.kind === 'override_apply' || change.kind === 'override_revoke',
    blocked: blocked ? { reason: blocked } : null,
  };
}

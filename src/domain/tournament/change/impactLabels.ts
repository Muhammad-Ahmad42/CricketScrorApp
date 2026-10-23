import type { ChangePlan, FixtureImpact, QualificationChange, QualificationState, StandingChange, TournamentSnapshot } from '../../types';
import { qualificationSentence } from '../evaluation/diff';
import { formatPoints, formatSignedNrr, ordinal } from '../evaluation/format';
import type { SnapshotIndex } from '../evaluation/snapshotIndex';

function teamOf(indexes: readonly SnapshotIndex[], teamId: string): string {
  for (const index of indexes) {
    const name = index.teamNames.get(teamId);
    if (name !== undefined) return name;
  }
  return teamId;
}

function stageOf(indexes: readonly SnapshotIndex[], stageId: string): string {
  for (const index of indexes) {
    const stage = index.stageById.get(stageId);
    if (stage) return stage.name;
  }
  return 'the stage';
}

function poolOf(indexes: readonly SnapshotIndex[], poolId: string | null): string | null {
  if (poolId === null) return null;
  for (const index of indexes) {
    const pool = index.poolById.get(poolId);
    if (pool) return pool.name;
  }
  return null;
}

function nrrText(value: number | null): string {
  return value === null ? '–' : formatSignedNrr(value);
}

function standingHeadline(change: StandingChange, team: string): string {
  const { before, after } = change;
  if (before === null && after !== null) return `${team} join in ${ordinal(after.position)}`;
  if (after === null && before !== null) return `${team} leave`;
  if (before !== null && after !== null && before.position === after.position) return `${team} stay ${ordinal(after.position)}`;
  if (before !== null && after !== null) return `${team}: ${ordinal(before.position)} → ${ordinal(after.position)}`;
  return team;
}

function standingDetail(change: StandingChange, where: string): string {
  const { before, after } = change;
  const parts: string[] = [];
  if (before !== null && after !== null && before.points !== after.points) parts.push(`Points ${formatPoints(before.points)} → ${formatPoints(after.points)}`);
  if (before !== null && after !== null && nrrText(before.nrr) !== nrrText(after.nrr)) parts.push(`NRR ${nrrText(before.nrr)} → ${nrrText(after.nrr)}`);
  return parts.length === 0 ? `${where}.` : `${where}. ${parts.join(', ')}.`;
}

function standingText(change: StandingChange, team: string, where: string): string {
  const { before, after } = change;
  let head: string;
  if (before === null && after !== null) head = `${team} join ${where} in ${ordinal(after.position)}`;
  else if (after === null && before !== null) head = `${team} leave ${where}, where they were ${ordinal(before.position)}`;
  else if (before !== null && after !== null && before.position === after.position) head = `${team} stay ${ordinal(after.position)} in ${where}`;
  else if (before !== null && after !== null) head = `${team} move from ${ordinal(before.position)} to ${ordinal(after.position)} in ${where}`;
  else head = `${team} in ${where}`;
  const details: string[] = [];
  if (before !== null && after !== null && before.points !== after.points) {
    details.push(`points ${formatPoints(before.points)} → ${formatPoints(after.points)}`);
  }
  if (before !== null && after !== null && nrrText(before.nrr) !== nrrText(after.nrr)) {
    details.push(`net run rate ${nrrText(before.nrr)} → ${nrrText(after.nrr)}`);
  }
  return details.length === 0 ? `${head}.` : `${head}; ${details.join(', ')}.`;
}

export function labelStandingChanges(indexes: readonly SnapshotIndex[], changes: readonly StandingChange[]): readonly StandingChange[] {
  return changes.map((change) => {
    const teamName = teamOf(indexes, change.teamId);
    const stageName = stageOf(indexes, change.stageId);
    const poolName = poolOf(indexes, change.poolId);
    const where = poolName === null ? stageName : `${stageName} · ${poolName}`;
    return {
      ...change,
      teamName,
      stageName,
      poolName,
      where,
      text: standingText(change, teamName, where),
      headline: standingHeadline(change, teamName),
      detail: standingDetail(change, where),
    };
  });
}

function qualificationHeadline(change: QualificationChange, team: string, stage: string): string {
  if (change.after === 'qualified') return `${team} qualify`;
  if (change.after === 'eliminated') return `${team} eliminated`;
  if (change.after === 'in_contention' && change.before === 'qualified') return `${team} no longer certain`;
  if (change.after === 'in_contention' && change.before === null) return `${team} in contention`;
  if (change.after === 'in_contention') return `${team} back in contention`;
  return `${team} out of the ${stage}`;
}

const STATE_WORD: { readonly [K in QualificationState]: string } = {
  qualified: 'qualified',
  in_contention: 'in contention',
  eliminated: 'eliminated',
};

export function labelQualificationChanges(indexes: readonly SnapshotIndex[], changes: readonly QualificationChange[]): readonly QualificationChange[] {
  return changes.map((change) => {
    const teamName = teamOf(indexes, change.teamId);
    const stageName = stageOf(indexes, change.stageId);
    const sentence = qualificationSentence(indexes, change);
    const word = (state: QualificationState | null) => (state === null ? 'not taking part' : STATE_WORD[state]);
    const text = sentence ?? `${teamName} go from ${word(change.before)} to ${word(change.after)} for the ${stageName}.`;
    return { ...change, teamName, stageName, text, headline: qualificationHeadline(change, teamName, stageName), detail: `For the ${stageName}.` };
  });
}

const CHANGE_TEXT: { readonly [K in FixtureImpact['change']]: string } = {
  created: 'New fixture',
  removed: 'Removed',
  teams_changed: 'Teams change',
  moved: 'Moves to another pool or stage',
  rescheduled: 'Rescheduled',
  status_changed: 'Status changes',
  result_changed: 'Result changes',
};

function withdrawnResult(snapshot: TournamentSnapshot, plan: ChangePlan, fixtureId: string): boolean {
  const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture || fixture.matchId === null) return false;
  return plan.summaryChanges.some((change) => change.matchId === fixture.matchId && change.summary === null);
}

function fixtureNote(impact: FixtureImpact, withdrawn: boolean): string | null {
  switch (impact.change) {
    case 'result_changed':
      if (!impact.hasMatchData) return 'Recorded without scores.';
      return withdrawn ? 'Counts again once the match is finished.' : 'Standings update from the new scores.';
    case 'removed':
      return impact.hasMatchData ? 'The played match stays in history.' : null;
    case 'teams_changed':
      return impact.hasMatchData ? 'The played match keeps its teams.' : null;
    case 'moved':
      return impact.hasMatchData ? 'Its result moves with it.' : null;
    case 'rescheduled':
    case 'status_changed':
      return impact.hasMatchData ? 'The played match stays in history.' : null;
    case 'created':
      return null;
    default: {
      const never: never = impact.change;
      return never;
    }
  }
}

export function labelFixtureImpacts(snapshot: TournamentSnapshot, plan: ChangePlan, impacts: readonly FixtureImpact[]): readonly FixtureImpact[] {
  return impacts.map((impact) => {
    const withdrawn = impact.change === 'result_changed' && withdrawnResult(snapshot, plan, impact.fixtureId);
    return {
      ...impact,
      changeText: withdrawn ? 'Result no longer counts' : CHANGE_TEXT[impact.change],
      note: fixtureNote(impact, withdrawn),
    };
  });
}

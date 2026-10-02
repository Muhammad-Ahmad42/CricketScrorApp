import type {
  QualificationChange,
  QualificationState,
  SlotChange,
  SlotResolution,
  StandingChange,
  StandingRow,
  StandingSnapshotLine,
  TeamId,
  TournamentEvaluation,
  TournamentSnapshot,
} from '../../types';
import { NRR_EPSILON } from '../../types';
import { joinNames, ordinal } from './format';
import type { SnapshotIndex } from './snapshotIndex';
import { indexSnapshot, stageName, teamName } from './snapshotIndex';

interface RowKey {
  readonly stageId: string;
  readonly poolId: string | null;
  readonly teamId: TeamId;
}

function sameNrr(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < NRR_EPSILON;
}

function lineOf(row: StandingRow): StandingSnapshotLine {
  return { position: row.position, points: row.points, nrr: row.nrr };
}

function rowsByKey(evaluation: TournamentEvaluation): Map<string, { readonly key: RowKey; readonly row: StandingRow }> {
  const map = new Map<string, { readonly key: RowKey; readonly row: StandingRow }>();
  for (const stage of evaluation.stages) {
    for (const table of stage.tables) {
      for (const row of table.rows) {
        if (row.teamId === null) continue;
        const key = { stageId: stage.stageId, poolId: table.poolId, teamId: row.teamId };
        map.set(`${key.stageId}|${key.poolId ?? ''}|${key.teamId}`, { key, row });
      }
    }
  }
  return map;
}

export function standingChanges(before: TournamentEvaluation, after: TournamentEvaluation): readonly StandingChange[] {
  const previous = rowsByKey(before);
  const next = rowsByKey(after);
  const keys = [...new Set([...previous.keys(), ...next.keys()])];
  const changes: StandingChange[] = [];
  for (const id of keys) {
    const old = previous.get(id);
    const now = next.get(id);
    const same =
      !!old &&
      !!now &&
      old.row.position === now.row.position &&
      old.row.points === now.row.points &&
      sameNrr(old.row.nrr, now.row.nrr);
    const source = now ?? old;
    if (same || !source) continue;
    changes.push({ ...source.key, before: old ? lineOf(old.row) : null, after: now ? lineOf(now.row) : null });
  }
  return changes;
}

function statesByTarget(evaluation: TournamentEvaluation): Map<string, { readonly stageId: string; readonly teamId: TeamId; readonly state: QualificationState }> {
  const map = new Map<string, { readonly stageId: string; readonly teamId: TeamId; readonly state: QualificationState }>();
  for (const stage of evaluation.stages) {
    for (const qualification of stage.qualification) {
      for (const target of qualification.targets) {
        const id = `${target.stageId}|${qualification.teamId}`;
        if (!map.has(id)) map.set(id, { stageId: target.stageId, teamId: qualification.teamId, state: target.state });
      }
    }
  }
  return map;
}

export function qualificationChanges(before: TournamentEvaluation, after: TournamentEvaluation): readonly QualificationChange[] {
  const previous = statesByTarget(before);
  const next = statesByTarget(after);
  const changes: QualificationChange[] = [];
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const old = previous.get(id);
    const now = next.get(id);
    const base = now ?? old;
    if (old?.state === now?.state || !base) continue;
    changes.push({ stageId: base.stageId, teamId: base.teamId, before: old?.state ?? null, after: now?.state ?? null });
  }
  return changes;
}

function resolutionsOf(evaluation: TournamentEvaluation): Map<string, SlotResolution> {
  return new Map(evaluation.stages.flatMap((stage) => stage.slots).map((resolution) => [resolution.slotId, resolution]));
}

export function playedThroughSlot(snapshot: TournamentSnapshot, slotId: string, teamId: TeamId | null): readonly string[] {
  if (teamId === null) return [];
  return snapshot.fixtures
    .filter((fixture) => {
      if (fixture.matchId === null || fixture.matchSides === null) return false;
      const viaA = fixture.sideA.kind === 'slot' && fixture.sideA.slotId === slotId && fixture.matchSides.teamAId === teamId;
      const viaB = fixture.sideB.kind === 'slot' && fixture.sideB.slotId === slotId && fixture.matchSides.teamBId === teamId;
      return viaA || viaB;
    })
    .map((fixture) => fixture.id);
}

export function slotChanges(
  beforeSnapshot: TournamentSnapshot,
  afterSnapshot: TournamentSnapshot,
  before: TournamentEvaluation,
  after: TournamentEvaluation,
): readonly SlotChange[] {
  const previous = resolutionsOf(before);
  const next = resolutionsOf(after);
  const labels = new Map([...beforeSnapshot.slots, ...afterSnapshot.slots].map((slot) => [slot.id, slot.label]));
  const changes: SlotChange[] = [];
  for (const slotId of new Set([...previous.keys(), ...next.keys()])) {
    const beforeTeamId = previous.get(slotId)?.teamId ?? null;
    const afterTeamId = next.get(slotId)?.teamId ?? null;
    if (beforeTeamId === afterTeamId) continue;
    changes.push({
      slotId,
      label: labels.get(slotId) ?? slotId,
      beforeTeamId,
      afterTeamId,
      playedFixtureIds: playedThroughSlot(beforeSnapshot, slotId, beforeTeamId),
    });
  }
  return changes;
}

export function nrrChangedTeams(changes: readonly StandingChange[]): readonly TeamId[] {
  return [
    ...new Set(
      changes.filter((change) => !sameNrr(change.before?.nrr ?? null, change.after?.nrr ?? null)).map((change) => change.teamId),
    ),
  ];
}

function nameIn(indexes: readonly SnapshotIndex[], teamId: TeamId): string {
  for (const index of indexes) {
    if (index.teamNames.has(teamId)) return teamName(index, teamId);
  }
  return teamId;
}

function poolLabel(indexes: readonly SnapshotIndex[], poolId: string | null, stageId: string): string {
  for (const index of indexes) {
    const pool = poolId === null ? undefined : index.poolById.get(poolId);
    if (pool) return pool.name;
  }
  return stageName(indexes[0], stageId);
}

export function standingSentence(indexes: readonly SnapshotIndex[], change: StandingChange): string | null {
  if (!change.before || !change.after || change.before.position === change.after.position) return null;
  return `${nameIn(indexes, change.teamId)} move from ${ordinal(change.before.position)} to ${ordinal(change.after.position)} in ${poolLabel(
    indexes,
    change.poolId,
    change.stageId,
  )}.`;
}

export function qualificationSentence(indexes: readonly SnapshotIndex[], change: QualificationChange): string | null {
  const team = nameIn(indexes, change.teamId);
  const stage = `the ${stageName(indexes[0], change.stageId)}`;
  if (change.after === 'qualified') return `${team} have qualified for ${stage}.`;
  if (change.after === 'eliminated') return `${team} can no longer qualify for ${stage}.`;
  if (change.after === 'in_contention' && change.before === 'qualified') return `${team} are no longer qualified for ${stage}.`;
  if (change.after === 'in_contention' && change.before === null) return `${team} are in contention for ${stage}.`;
  if (change.after === 'in_contention') return `${team} are back in contention for ${stage}.`;
  return null;
}

export function slotSentence(indexes: readonly SnapshotIndex[], snapshot: TournamentSnapshot, change: SlotChange): string {
  const name = (teamId: TeamId | null) => (teamId === null ? 'to be decided' : nameIn(indexes, teamId));
  const base = `${change.label} changes from ${name(change.beforeTeamId)} to ${name(change.afterTeamId)}`;
  if (change.playedFixtureIds.length === 0) return `${base}.`;
  const labels = change.playedFixtureIds.map((fixtureId) => {
    const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
    return fixture?.label ?? `Match ${fixture?.matchNumber ?? ''}`.trim();
  });
  return `${base}, but ${joinNames(labels)} ${labels.length === 1 ? 'was' : 'were'} already played by ${name(change.beforeTeamId)}; played results stand.`;
}

export function indexesOf(...snapshots: readonly TournamentSnapshot[]): readonly SnapshotIndex[] {
  return snapshots.map(indexSnapshot);
}

import type {
  ComparisonTable,
  PoolId,
  QualificationTarget,
  SlotResolution,
  Stage,
  StageEvaluation,
  StageSlot,
  StandingsTable,
  TeamId,
  TeamQualification,
  TournamentOverride,
} from '../../types';
import type { StandingsInput } from '../standings';
import { certaintyOf } from './certainty';
import type { VerdictOf } from './certainty';
import { comparisonKey, targetStages } from './downstream';
import {
  contentionCopy,
  contentionText,
  eliminatedCopy,
  eliminatedText,
  manualCopy,
  manualText,
  parallelCopy,
  parallelText,
  qualifiedCopy,
  qualifiedText,
  ruleContext,
  ruleLines,
  targetSummary,
  winHint,
} from './qualificationText';
import type { QualificationCopy, TextContext } from './qualificationText';
import { analysePool } from './scenarios';
import { countedSummaryOf, isSettledStatus } from './sides';
import { viewLayout } from './slotLayout';
import { StageSlotResolver } from './slotResolver';
import type { SnapshotIndex } from './snapshotIndex';
import { teamName } from './snapshotIndex';
import { registerStageInputs } from './sourceInputs';
import { fixtureTeamsVia } from './stageTables';
import { targetSources } from './targetSources';
import type { TargetSources } from './targetSources';

export interface QualificationScope {
  readonly index: SnapshotIndex;
  readonly stage: Stage;
  readonly tables: readonly StandingsTable[];
  readonly overall: StandingsTable | null;
  readonly comparisonTables: readonly ComparisonTable[];
  readonly slots: readonly SlotResolution[];
  readonly inputs: ReadonlyMap<PoolId, StandingsInput>;
  readonly earlier: readonly StageEvaluation[];
  readonly limit: number;
  readonly progress: { readonly done: number; readonly total: number };
  readonly complete: boolean;
}

interface StageTeam {
  readonly teamId: TeamId;
  readonly poolId: PoolId | null;
}

interface TargetView {
  readonly stage: Stage;
  readonly sources: TargetSources;
  readonly resolutions: ReadonlyMap<string, SlotResolution>;
  readonly entrySlots: readonly StageSlot[];
  readonly eliminated: readonly TeamId[];
  readonly verdict: VerdictOf;
}

interface TargetOutcome {
  readonly target: QualificationTarget;
  readonly override: TournamentOverride | null;
  readonly text: TextContext;
}

type QualificationOverride = Extract<TournamentOverride, { readonly kind: 'qualification' }>;

function stageTeams(scope: QualificationScope): readonly StageTeam[] {
  const seen = new Set<TeamId>();
  const teams: StageTeam[] = [];
  const add = (teamId: TeamId | null, poolId: PoolId | null) => {
    if (teamId === null || seen.has(teamId)) return;
    const status = scope.index.teamViews.get(teamId)?.membership.status ?? 'active';
    if (status !== 'active') return;
    seen.add(teamId);
    teams.push({ teamId, poolId });
  };
  if (scope.tables.length > 0) {
    scope.tables.forEach((table) =>
      table.rows.forEach((row) => {
        if (row.membership === 'active') add(row.teamId, table.poolId);
      }),
    );
    return teams;
  }
  const own = new Map(scope.slots.map((resolution) => [resolution.slotId, resolution]));
  for (const slot of scope.index.slotsByStage.get(scope.stage.id) ?? []) {
    if (slot.role === 'entry') add(own.get(slot.id)?.teamId ?? null, null);
  }
  const lookup = (slotId: string) => own.get(slotId) ?? earlierLookup(scope, slotId);
  for (const fixture of scope.index.fixturesByStage.get(scope.stage.id) ?? []) {
    const sides = fixtureTeamsVia(fixture, lookup);
    add(sides.a, null);
    add(sides.b, null);
  }
  return teams;
}

function earlierLookup(scope: QualificationScope, slotId: string): SlotResolution | undefined {
  for (const evaluation of scope.earlier) {
    const hit = evaluation.slots.find((resolution) => resolution.slotId === slotId);
    if (hit) return hit;
  }
  return undefined;
}

function provisionalEvaluation(scope: QualificationScope): StageEvaluation {
  const evaluation: StageEvaluation = {
    stageId: scope.stage.id,
    tables: scope.tables,
    overall: scope.overall,
    comparisonTables: scope.comparisonTables,
    slots: scope.slots,
    qualification: [],
    progress: scope.progress,
    complete: scope.complete,
  };
  registerStageInputs(evaluation, scope.inputs);
  return evaluation;
}

function eliminatedFor(index: SnapshotIndex, target: Stage): readonly TeamId[] {
  return index.activeOverrides
    .filter((override): override is QualificationOverride => override.kind === 'qualification')
    .filter((override) => override.action === 'eliminate' && override.stageId === target.id)
    .map((override) => override.teamId);
}

function targetViews(scope: QualificationScope): readonly TargetView[] {
  const source = provisionalEvaluation(scope);
  const fixturesInPools = (scope.index.fixturesByStage.get(scope.stage.id) ?? []).every((fixture) => fixture.poolId !== null);
  return targetStages(scope.index, scope.stage.id).map((stage) => {
    const resolved = new StageSlotResolver(scope.index, stage.id, [...scope.earlier, source]).resolveAll();
    const resolutions = new Map(resolved.map((resolution) => [resolution.slotId, resolution]));
    const sources = targetSources(scope.index, scope.stage.id, stage);
    const entrySlots = (scope.index.slotsByStage.get(stage.id) ?? []).filter((slot) => slot.role === 'entry');
    const eliminated = eliminatedFor(scope.index, stage);
    const verdict = certaintyOf({
      snapshot: scope.index.snapshot,
      stageId: scope.stage.id,
      tables: scope.tables,
      inputs: scope.inputs,
      fixturesInPools,
      eliminated,
      layout: viewLayout({ sourceSlots: sources.slots, entrySlots, resolutions }),
      limit: scope.limit,
    });
    return { stage, sources, resolutions, entrySlots, eliminated, verdict };
  });
}

function manualOverride(index: SnapshotIndex, teamId: TeamId, view: TargetView): { readonly override: TournamentOverride; readonly qualified: boolean } | null {
  const slotIds = new Set(view.entrySlots.map((slot) => slot.id));
  const relevant = index.activeOverrides.filter(
    (override) =>
      (override.kind === 'qualification' && override.stageId === view.stage.id && override.teamId === teamId) ||
      (override.kind === 'slot_assignment' && override.teamId === teamId && slotIds.has(override.slotId)),
  );
  if (relevant.length === 0) return null;
  const latest = relevant.reduce((best, candidate) => (candidate.createdAt >= best.createdAt ? candidate : best));
  return { override: latest, qualified: !(latest.kind === 'qualification' && latest.action === 'eliminate') };
}

function heldSlots(view: TargetView, teamId: TeamId): readonly StageSlot[] {
  return view.entrySlots.filter((slot) => view.resolutions.get(slot.id)?.teamId === teamId);
}

function tableTie(scope: QualificationScope, teamId: TeamId): readonly TeamId[] | null {
  const tables = [...scope.tables, ...scope.comparisonTables.map((comparison) => comparison.table)];
  for (const table of tables) {
    const group = table.unresolvedTies.find((candidate) => candidate.includes(teamId));
    if (group) return group;
  }
  return null;
}

function contestedSlotTie(scope: QualificationScope, view: TargetView, teamId: TeamId): readonly TeamId[] | null {
  if (!scope.tables.every((table) => table.complete)) return null;
  const placed = new Set(view.entrySlots.map((slot) => view.resolutions.get(slot.id)?.teamId ?? null));
  for (const slot of view.sources.slots) {
    const source = slot.source;
    if (source.kind !== 'best_of_position' && source.kind !== 'overall_position') continue;
    const resolution = view.resolutions.get(slot.id);
    if (!resolution || resolution.teamId === null || resolution.status === 'final' || resolution.viaOverride) continue;
    const key = comparisonKey(source.kind === 'best_of_position' ? source.position : null, source.normalization);
    const table = scope.comparisonTables.find((comparison) => comparison.key === key)?.table ?? (source.kind === 'overall_position' ? scope.overall : null);
    const occupant = table?.rows.find((row) => row.teamId === resolution.teamId);
    if (!table || !occupant || !occupant.sharedPosition) continue;
    const group = table.rows
      .filter((row) => row.position === occupant.position && row.membership === 'active')
      .flatMap((row) => (row.teamId === null ? [] : [row.teamId]))
      .filter((candidate) => candidate === resolution.teamId || (!placed.has(candidate) && !view.eliminated.includes(candidate)));
    if (group.length > 1 && group.includes(teamId)) return group;
  }
  return null;
}

function contestedPoolTie(scope: QualificationScope, view: TargetView, teamId: TeamId): readonly TeamId[] | null {
  if (!scope.tables.every((table) => table.complete)) return null;
  const automatic = new Map<TeamId, StageSlot>();
  for (const slot of view.sources.slots) {
    const resolution = view.resolutions.get(slot.id);
    if (resolution && resolution.teamId !== null && !resolution.viaOverride) automatic.set(resolution.teamId, slot);
  }
  for (const table of scope.tables) {
    const group = [...table.unresolvedTies, ...table.provisionalTies].find((candidate) => candidate.includes(teamId));
    if (!group) continue;
    const contested = group.some((member) => {
      const source = member === teamId ? undefined : automatic.get(member)?.source;
      return !!source && (source.kind !== 'pool_position' || source.poolId === table.poolId);
    });
    if (contested) return group;
  }
  return null;
}

function reachableOpenSlot(scope: QualificationScope, view: TargetView, teamId: TeamId): boolean {
  for (const slot of view.sources.slots) {
    const source = slot.source;
    const resolution = view.resolutions.get(slot.id);
    if (!resolution || resolution.status === 'final' || resolution.viaOverride) continue;
    if (source.kind === 'pool_position') {
      const table = scope.tables.find((candidate) => candidate.poolId === source.poolId);
      if (table?.rows.some((row) => row.teamId === teamId && row.membership === 'active' && row.position >= source.position)) return true;
      continue;
    }
    if (source.kind !== 'best_of_position' && source.kind !== 'overall_position') continue;
    const key = comparisonKey(source.kind === 'best_of_position' ? source.position : null, source.normalization);
    const table = scope.comparisonTables.find((comparison) => comparison.key === key)?.table ?? (source.kind === 'overall_position' ? scope.overall : null);
    if (table?.rows.some((row) => row.teamId === teamId && row.membership === 'active')) return true;
  }
  return false;
}

function tieGroup(scope: QualificationScope, view: TargetView, teamId: TeamId): readonly TeamId[] | null {
  return tableTie(scope, teamId) ?? contestedPoolTie(scope, view, teamId) ?? contestedSlotTie(scope, view, teamId);
}

function remainingOpponents(scope: QualificationScope, view: TargetView, team: StageTeam): readonly string[] {
  if (team.poolId === null) return [];
  const table = scope.tables.find((candidate) => candidate.poolId === team.poolId);
  const input = scope.inputs.get(team.poolId);
  if (!table || !input) return [];
  const analysis = analysePool(scope.index.snapshot, scope.stage.id, team.poolId, table, input, view.eliminated, scope.limit);
  return (analysis.remaining.get(team.teamId) ?? []).map((opponent) => teamName(scope.index, opponent));
}

type AutoState = { readonly state: QualificationTarget['state']; readonly hint: string | null; readonly opponents?: readonly string[] };

function poolState(scope: QualificationScope, view: TargetView, team: StageTeam, held: readonly StageSlot[], heldFinal: boolean): AutoState {
  if (team.poolId === null) return { state: 'in_contention', hint: null };
  const verdict = view.verdict(team.teamId, team.poolId);
  if (scope.tables.every((table) => table.complete)) {
    if (held.length > 0 && (heldFinal || verdict?.state === 'qualified')) return { state: 'qualified', hint: null };
    if (verdict?.state === 'eliminated') return { state: 'eliminated', hint: null };
    const open = tieGroup(scope, view, team.teamId) !== null || reachableOpenSlot(scope, view, team.teamId);
    if (held.length === 0 && !open) return { state: 'eliminated', hint: null };
    return { state: 'in_contention', hint: null };
  }
  if (verdict && verdict.state !== 'in_contention') return { state: verdict.state, hint: null };
  if (!verdict?.winsGuarantee) return { state: 'in_contention', hint: null };
  const opponents = remainingOpponents(scope, view, team);
  return { state: 'in_contention', hint: winHint(opponents), opponents };
}

function lostDecided(scope: QualificationScope, teamId: TeamId): boolean {
  const lookup = (slotId: string) => scope.slots.find((resolution) => resolution.slotId === slotId) ?? earlierLookup(scope, slotId);
  for (const fixture of scope.index.fixturesByStage.get(scope.stage.id) ?? []) {
    const summary = countedSummaryOf(scope.index.snapshot.summaries, fixture);
    if (!summary) continue;
    const sides = fixtureTeamsVia(fixture, lookup);
    if (sides.a !== teamId && sides.b !== teamId) continue;
    const winner = summary.winnerTeamId;
    if (winner !== null && winner !== teamId && (fixture.bracket === null || fixture.bracket.kind === 'main')) return true;
  }
  return false;
}

function bracketState(scope: QualificationScope, view: TargetView, team: StageTeam, held: readonly StageSlot[]): AutoState {
  if (held.length > 0) return { state: 'in_contention', hint: null };
  const allSettled = (scope.index.fixturesByStage.get(scope.stage.id) ?? []).every((fixture) => isSettledStatus(fixture.status));
  if (scope.complete && allSettled) return { state: 'eliminated', hint: null };
  if (view.sources.winnerOnly && lostDecided(scope, team.teamId)) return { state: 'eliminated', hint: null };
  return { state: 'in_contention', hint: null };
}

function targetFor(scope: QualificationScope, view: TargetView, team: StageTeam): TargetOutcome {
  const held = heldSlots(view, team.teamId);
  const heldFinal = held.some((slot) => view.resolutions.get(slot.id)?.status === 'final');
  const firstHeld = held.find((slot) => view.resolutions.get(slot.id)?.status === 'final') ?? held[0] ?? null;
  const name = teamName(scope.index, team.teamId);
  const base: TextContext = {
    team: name,
    target: view.stage,
    heldSlot: firstHeld,
    heldFinal,
    rule: ruleContext(scope.index, scope.stage, view.stage),
    rules: ruleLines(scope.index, scope.stage, view.stage),
    tieWith: null,
    hint: null,
    opponents: null,
  };
  const slotIds = held.map((slot) => slot.id);
  const manual = manualOverride(scope.index, team.teamId, view);
  if (manual) {
    return {
      target: { stageId: view.stage.id, state: manual.qualified ? 'qualified' : 'eliminated', certainty: 'manual', slotIds },
      override: manual.override,
      text: base,
    };
  }
  const auto =
    scope.tables.length > 0
      ? poolState(scope, view, team, held, heldFinal)
      : heldFinal
        ? { state: 'qualified' as const, hint: null }
        : bracketState(scope, view, team, held);
  const group = auto.state === 'in_contention' ? tieGroup(scope, view, team.teamId) : null;
  return {
    target: {
      stageId: view.stage.id,
      state: auto.state,
      certainty: auto.state === 'in_contention' ? 'provisional' : 'mathematical',
      slotIds,
    },
    override: null,
    text: {
      ...base,
      hint: auto.hint,
      opponents: auto.opponents ?? null,
      tieWith: group ? group.map((teamId) => teamName(scope.index, teamId)) : null,
    },
  };
}

function explanation(scope: QualificationScope, outcomes: readonly TargetOutcome[], primary: TargetOutcome): string {
  const target = primary.target;
  if (target.certainty === 'manual' && primary.override) {
    return manualText(primary.text.team, primary.text.target, target.state === 'qualified', primary.override);
  }
  if (target.state === 'qualified') {
    const out = outcomes.find(
      (outcome) => outcome.target.state === 'eliminated' && outcome.text.target.orderIndex < primary.text.target.orderIndex,
    );
    return out ? parallelText(scope.index, primary.text.team, out.text.target, primary.text) : qualifiedText(scope.index, primary.text);
  }
  if (target.state === 'in_contention') return contentionText(primary.text);
  return eliminatedText(primary.text);
}

function copyOf(scope: QualificationScope, outcomes: readonly TargetOutcome[], primary: TargetOutcome): QualificationCopy {
  const target = primary.target;
  if (target.certainty === 'manual' && primary.override) {
    return manualCopy(primary.text.target, target.state === 'qualified', primary.override);
  }
  if (target.state === 'qualified') {
    const out = outcomes.find(
      (outcome) => outcome.target.state === 'eliminated' && outcome.text.target.orderIndex < primary.text.target.orderIndex,
    );
    return out ? parallelCopy(scope.index, out.text.target, primary.text) : qualifiedCopy(scope.index, primary.text);
  }
  if (target.state === 'in_contention') return contentionCopy(primary.text);
  return eliminatedCopy(primary.text);
}

export function qualifyStage(scope: QualificationScope): readonly TeamQualification[] {
  const views = targetViews(scope);
  if (views.length === 0) return [];
  return stageTeams(scope).map((team) => {
    const outcomes = views.map((view) => targetFor(scope, view, team));
    const primaryTarget = targetSummary(outcomes.map((outcome) => outcome.target));
    const primary = outcomes.find((outcome) => outcome.target === primaryTarget) ?? outcomes[0];
    const copy = copyOf(scope, outcomes, primary);
    return {
      teamId: team.teamId,
      stageId: scope.stage.id,
      poolId: team.poolId,
      state: primary.target.state,
      certainty: primary.target.certainty,
      targetStageId: primary.target.stageId,
      slotIds: primary.target.slotIds,
      targets: outcomes.map((outcome) => outcome.target),
      explanation: explanation(scope, outcomes, primary),
      override: primary.override,
      headline: copy.headline,
      note: copy.note,
      detail: copy.detail,
    };
  });
}

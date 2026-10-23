import { formatNrr } from '@/domain/scoring/format';
import { explainEntryRules } from '@/domain/tournament/slots';
import { describeTieBreakerChain } from '@/domain/tournament/tiebreakers';
import type {
  ComparisonTable,
  QualificationState,
  StageEvaluation,
  StageId,
  StandingRow,
  StandingsTable,
  TeamId,
  TeamQualification,
} from '@/domain/types';
import {
  CERTAINTY_LABEL,
  MANUAL_OVERRIDE_LABEL,
  QUALIFICATION_SHORT,
  QUALIFICATION_STATE_LABEL,
  conciseExplanation,
  joinList,
  ordinal,
  plural,
  type QualificationCertainty,
} from '@/features/shared';
import type { TournamentIndex } from './names';

export interface RowQualificationVM {
  readonly state: QualificationState;
  readonly certainty: QualificationCertainty;
  readonly short: string;
  readonly manual: boolean;
  readonly explanation: string;
  readonly condition: string | null;
  readonly headline: string | null;
  readonly detail: string | null;
  readonly reason: string | null;
}

export interface RowAdjustmentVM {
  readonly points: number;
  readonly amount: string;
  readonly reasons: readonly string[];
}

export interface StandingRowVM {
  readonly key: string;
  readonly rank: number;
  readonly position: string;
  readonly team: string;
  readonly teamShort: string;
  readonly teamId: TeamId | null;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
  readonly noResult: number;
  readonly points: number;
  readonly nrr: string;
  readonly qualification: RowQualificationVM | null;
  readonly adjustment: RowAdjustmentVM | null;
  readonly remaining: string | null;
  readonly note: string | null;
  readonly muted: boolean;
  readonly accessibilityLabel: string;
  readonly delta?: string | null;
  readonly nrrUncertain?: boolean;
}

export interface StandingsTableVM {
  readonly key: string;
  readonly title: string;
  readonly poolId: string | null;
  readonly rows: readonly StandingRowVM[];
  readonly showTies: boolean;
  readonly complete: boolean;
  readonly chain: string;
  readonly unresolvedTies: readonly string[];
}

export interface StageStandingsVM {
  readonly stageId: StageId;
  readonly stageName: string;
  readonly tables: readonly StandingsTableVM[];
  readonly rulesText: string;
}

export function spokenNrr(text: string): string {
  if (text.startsWith('+')) {
    return `plus ${text.slice(1)}`;
  }
  if (/^-\d/.test(text)) {
    return `minus ${text.slice(1)}`;
  }
  if (text === '0.000') {
    return 'zero';
  }
  return 'not available';
}

function rowQualification(qualification: TeamQualification | null, teamName: string): RowQualificationVM | null {
  if (qualification === null) {
    return null;
  }
  const manual = qualification.certainty === 'manual' || qualification.override !== null;
  return {
    state: qualification.state,
    certainty: qualification.certainty,
    short: manual ? 'M' : QUALIFICATION_SHORT[qualification.state],
    manual,
    explanation: qualification.explanation,
    condition: qualification.note !== undefined ? qualification.note : conciseExplanation(qualification.explanation, teamName),
    headline: qualification.headline ?? null,
    detail: qualification.detail ?? null,
    reason: qualification.override?.reason ?? null,
  };
}

function shortText(index: TournamentIndex, row: StandingRow): string {
  if (row.teamId) {
    const short = index.teamShort(row.teamId);
    if (short !== '?') {
      return row.provisional && row.slotLabel ? `${row.slotLabel} ${short}` : short;
    }
  }
  return row.slotLabel ?? 'TBD';
}

function teamText(index: TournamentIndex, row: StandingRow): string {
  const name = row.teamId ? index.teamName(row.teamId) : null;
  let text: string;
  if (row.side.kind === 'slot' && row.slotLabel) {
    if (name === null) {
      text = row.slotLabel;
    } else if (row.provisional) {
      text = `${row.slotLabel} · ${name} (provisional)`;
    } else {
      text = name;
    }
  } else {
    text = name ?? row.slotLabel ?? 'To be decided';
  }
  if (row.membership === 'withdrawn') {
    return `${text} (withdrawn)`;
  }
  if (row.membership === 'replaced') {
    return `${text} (replaced)`;
  }
  return text;
}

function signedPoints(points: number): string {
  return `${points > 0 ? '+' : '−'}${plural(Math.abs(points), 'pt')}`;
}

function rowAdjustment(index: TournamentIndex, row: StandingRow, stageId: StageId | null): RowAdjustmentVM | null {
  if (row.pointsAdjustment === 0) {
    return null;
  }
  const reasons = index.snapshot.overrides
    .filter(
      (override) =>
        override.kind === 'points_adjustment' &&
        override.revokedAt === null &&
        override.teamId === row.teamId &&
        (stageId === null || override.stageId === stageId),
    )
    .map((override) => override.reason);
  return { points: row.pointsAdjustment, amount: signedPoints(row.pointsAdjustment), reasons };
}

function rowLabel(row: StandingRow, team: string, nrr: string, qualification: RowQualificationVM | null, adjustment: RowAdjustmentVM | null): string {
  const parts = [
    `Position ${row.sharedPosition ? `${row.position}, shared` : row.position}`,
    team,
    `played ${row.played}`,
    `won ${row.won}`,
    `lost ${row.lost}`,
  ];
  if (row.tied > 0) {
    parts.push(`tied ${row.tied}`);
  }
  parts.push(`no result ${row.noResult}`, plural(row.points, 'point'), `net run rate ${spokenNrr(nrr)}`);
  const adjusted = adjustment ? `. ${MANUAL_OVERRIDE_LABEL}: points adjusted by ${adjustment.amount}` : '';
  const base = `${parts.join(', ')}${adjusted}`;
  if (qualification === null) {
    return `${base}.`;
  }
  const status = qualification.manual
    ? `${QUALIFICATION_STATE_LABEL[qualification.state]}, Manual Override`
    : qualification.state === 'in_contention'
      ? QUALIFICATION_STATE_LABEL[qualification.state]
      : `${QUALIFICATION_STATE_LABEL[qualification.state]}, ${CERTAINTY_LABEL[qualification.certainty].toLowerCase()}`;
  return `${base}. ${status}.`;
}

export function standingRowVM(index: TournamentIndex, row: StandingRow, tableKey: string, stageId: StageId | null = null): StandingRowVM {
  const team = teamText(index, row);
  const nrr = formatNrr(row.nrr);
  const qualification = row.membership === 'active' ? rowQualification(row.qualification, row.teamId ? index.teamName(row.teamId) : team) : null;
  const adjustment = rowAdjustment(index, row, stageId);
  return {
    key: `${tableKey}:${row.side.kind === 'team' ? row.side.teamId : row.side.slotId}`,
    rank: row.position,
    position: row.sharedPosition ? `=${row.position}` : String(row.position),
    team,
    teamShort: shortText(index, row),
    teamId: row.teamId,
    played: row.played,
    won: row.won,
    lost: row.lost,
    tied: row.tied,
    noResult: row.noResult,
    points: row.points,
    nrr,
    qualification,
    adjustment,
    remaining: row.matchesRemaining > 0 ? `${plural(row.matchesRemaining, 'match', 'matches')} left` : null,
    note: row.tieBreak?.detail ?? null,
    muted: row.membership !== 'active',
    accessibilityLabel: rowLabel(row, team, nrr, qualification, adjustment),
  };
}

function tiesText(index: TournamentIndex, table: StandingsTable, title: string): readonly string[] {
  return table.unresolvedTies.map((group) => `${joinList(group.map((teamId) => index.teamName(teamId)))} can't be separated in ${title}.`);
}

function tableVM(index: TournamentIndex, table: StandingsTable, key: string, title: string): StandingsTableVM {
  const rows = table.rows.map((row) => standingRowVM(index, row, key, table.stageId));
  return {
    key,
    title,
    poolId: table.poolId,
    rows,
    showTies: table.rows.some((row) => row.tied > 0),
    complete: table.complete,
    chain: describeTieBreakerChain(table.tieBreakers),
    unresolvedTies: tiesText(index, table, title),
  };
}

function comparisonTitle(comparison: ComparisonTable): string {
  if (comparison.position === null) {
    return 'Comparison';
  }
  if (comparison.position === 1) {
    return 'Best pool winners';
  }
  if (comparison.position === 2) {
    return 'Best runners-up';
  }
  return `Best ${ordinal(comparison.position)}s`;
}

export function downstreamRulesText(index: TournamentIndex, stageId: StageId): string {
  const names = new Map(index.stages.map((stage) => [stage.id, stage.name]));
  const sentences: string[] = [];
  for (const stage of index.stages) {
    const rules = stage.config.entryRules.filter((rule) => 'sourceStageId' in rule && rule.sourceStageId === stageId);
    if (rules.length > 0) {
      sentences.push(`${explainEntryRules(rules, names)} qualify for the ${stage.name}.`);
    }
  }
  if (sentences.length === 0) {
    const stage = index.stage(stageId);
    if (stage?.config.decidesChampion) {
      return 'The team on top of the table wins the title.';
    }
    return 'No qualification rule uses this stage.';
  }
  return sentences.join(' ');
}

export function stageStandingsVM(index: TournamentIndex, stage: StageEvaluation): StageStandingsVM {
  const pools = index.poolsOf(stage.stageId);
  const tables: StandingsTableVM[] = [];
  const ordered = [...stage.tables].sort((a, b) => {
    const ia = pools.findIndex((pool) => pool.id === a.poolId);
    const ib = pools.findIndex((pool) => pool.id === b.poolId);
    return ia - ib;
  });
  for (const table of ordered) {
    const poolKey = table.poolId ? index.poolKey(table.poolId) : 'a';
    const title = (table.poolId && pools.length > 1 ? index.poolName(table.poolId) : null) ?? index.stageName(stage.stageId);
    tables.push(tableVM(index, table, poolKey, title));
  }
  if (stage.overall && stage.tables.length > 1) {
    tables.push(tableVM(index, stage.overall, 'overall', 'Overall'));
  }
  stage.comparisonTables.forEach((comparison, position) => {
    tables.push(tableVM(index, comparison.table, `compare-${position + 1}`, comparisonTitle(comparison)));
  });
  return {
    stageId: stage.stageId,
    stageName: index.stageName(stage.stageId),
    tables,
    rulesText: downstreamRulesText(index, stage.stageId),
  };
}

const vmCache = new WeakMap<StageEvaluation, WeakMap<TournamentIndex, StageStandingsVM>>();

export function cachedStageStandings(index: TournamentIndex, stage: StageEvaluation): StageStandingsVM {
  let perStage = vmCache.get(stage);
  if (!perStage) {
    perStage = new WeakMap();
    vmCache.set(stage, perStage);
  }
  const cached = perStage.get(index);
  if (cached) {
    return cached;
  }
  const built = stageStandingsVM(index, stage);
  perStage.set(index, built);
  return built;
}

export function stagesWithTables(index: TournamentIndex): readonly StageEvaluation[] {
  const order = new Map(index.stages.map((stage, position) => [stage.id, position]));
  return [...(index.evaluation?.stages ?? [])]
    .filter((stage) => stage.tables.length > 0)
    .sort((a, b) => (order.get(a.stageId) ?? 0) - (order.get(b.stageId) ?? 0));
}

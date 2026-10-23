import { formatNrr } from '@/domain/scoring/format';
import type {
  FixtureImpact,
  ImpactSeverity,
  ImpactSummary,
  QualificationChange,
  QualificationState,
  SlotChange,
  SlotShortfall,
  StandingChange,
  StandingSnapshotLine,
} from '@/domain/types';
import { QUALIFICATION_STATE_LABEL } from './qualification';
import { ordinal, plural } from './text';

export interface ImpactNames {
  readonly team: (teamId: string) => string;
  readonly pool: (poolId: string | null) => string | null;
  readonly stage: (stageId: string) => string;
}

export interface ImpactLineVM {
  readonly key: string;
  readonly text: string;
  readonly note: string | null;
  readonly warn: boolean;
  readonly detail?: string | null;
}

export interface ImpactKeyItemVM {
  readonly key: string;
  readonly headline: string;
  readonly detail: string | null;
}

export type ImpactFixtureKind = 'added' | 'removed' | 'changed';

export interface ImpactFixtureVM {
  readonly key: string;
  readonly kind: ImpactFixtureKind;
  readonly label: string;
  readonly change: string;
  readonly note: string | null;
  readonly hasMatchData: boolean;
}

export interface ImpactViewModel {
  readonly headline: string;
  readonly lines: readonly string[];
  readonly keyItems: readonly ImpactKeyItemVM[];
  readonly severity: ImpactSeverity;
  readonly severityNotice: string | null;
  readonly fixtures: readonly ImpactFixtureVM[];
  readonly standings: readonly ImpactLineVM[];
  readonly qualification: readonly ImpactLineVM[];
  readonly slots: readonly ImpactLineVM[];
  readonly shortfalls: readonly ImpactLineVM[];
  readonly nrrText: string | null;
  readonly blockedReason: string | null;
  readonly requiresReason: boolean;
  readonly destructive: boolean;
}

const FALLBACK_NAMES: ImpactNames = {
  team: () => 'A team',
  pool: () => null,
  stage: () => 'Stage',
};

const CHANGE_TEXT: { readonly [K in FixtureImpact['change']]: string } = {
  created: 'New fixture',
  removed: 'Removed',
  teams_changed: 'Teams change',
  moved: 'Moves to another pool or stage',
  rescheduled: 'Rescheduled',
  status_changed: 'Status changes',
  result_changed: 'Result changes',
};

function kindFor(change: FixtureImpact['change']): ImpactFixtureKind {
  if (change === 'created') {
    return 'added';
  }
  if (change === 'removed') {
    return 'removed';
  }
  return 'changed';
}

function fixtureNote(fixture: FixtureImpact): string | null {
  if (fixture.note !== undefined) {
    return fixture.note;
  }
  return fixture.hasMatchData ? 'Played · stays in the match history' : null;
}

function positionText(line: StandingSnapshotLine | null, missing: string): string {
  return line === null ? missing : ordinal(line.position);
}

function standingText(change: StandingChange, names: ImpactNames): string {
  if (change.text) {
    return change.text;
  }
  const where = change.where ?? names.pool(change.poolId) ?? names.stage(change.stageId);
  const parts = [`${change.teamName ?? names.team(change.teamId)} · ${where}`];
  const { before, after } = change;
  parts.push(`${positionText(before, 'not ranked')} → ${positionText(after, 'not ranked')}`);
  if (before !== null && after !== null && before.points !== after.points) {
    parts.push(`${before.points} → ${after.points} pts`);
  } else if (after !== null) {
    parts.push(plural(after.points, 'pt'));
  }
  const beforeNrr = before?.nrr ?? null;
  const afterNrr = after?.nrr ?? null;
  if (formatNrr(beforeNrr) !== formatNrr(afterNrr)) {
    parts.push(`NRR ${formatNrr(beforeNrr)} → ${formatNrr(afterNrr)}`);
  }
  return parts.join(' · ');
}

function stateText(state: QualificationState | null): string {
  return state === null ? 'Not taking part' : QUALIFICATION_STATE_LABEL[state];
}

function qualificationText(change: QualificationChange, names: ImpactNames): string {
  if (change.text) {
    return change.text;
  }
  return `${change.teamName ?? names.team(change.teamId)}: ${stateText(change.before)} → ${stateText(change.after)} (${change.stageName ?? names.stage(change.stageId)})`;
}

function slotText(change: SlotChange, names: ImpactNames): ImpactLineVM {
  const before = change.beforeTeamId === null ? 'to be decided' : names.team(change.beforeTeamId);
  const after = change.afterTeamId === null ? 'to be decided' : names.team(change.afterTeamId);
  const played = change.playedFixtureIds.length > 0;
  return {
    key: change.slotId,
    text: `${change.label}: ${before} → ${after}`,
    note: played ? `Already played as ${before}. The ${change.playedFixtureIds.length === 1 ? 'result stands' : 'results stand'}.` : null,
    warn: played,
  };
}

function severityNotice(impact: ImpactSummary): string | null {
  if (impact.completedMatchesAffected > 0) {
    if (impact.severity !== 'destructive' && /completed/i.test(impact.headline)) {
      return null;
    }
    return `${plural(impact.completedMatchesAffected, 'completed match', 'completed matches')} ${impact.completedMatchesAffected === 1 ? 'is' : 'are'} affected.`;
  }
  if (impact.severity === 'destructive') {
    return "Can't be undone automatically.";
  }
  return null;
}

export function shortfallHeadline(shortfall: SlotShortfall): string {
  return `${shortfall.label} in ${shortfall.stageName} can't be filled`;
}

function keyItems(impact: ImpactSummary, lines: readonly string[]): readonly ImpactKeyItemVM[] {
  if (impact.keyItems === undefined) {
    return lines.map((line, index) => ({ key: `${index}:${line}`, headline: line, detail: null }));
  }
  const shortfalls = new Set((impact.slotShortfalls ?? []).flatMap((shortfall) => [shortfall.message, shortfall.headline ?? shortfall.message]));
  const blocked = impact.blocked?.reason ?? null;
  return impact.keyItems
    .filter((item) => !shortfalls.has(item.headline) && (blocked === null || !blocked.startsWith(item.headline)))
    .map((item, index) => ({ key: `${index}:${item.headline}`, headline: item.headline, detail: item.detail ?? null }));
}

function keyLines(impact: ImpactSummary): readonly string[] {
  const shortfalls = new Set((impact.slotShortfalls ?? []).map((shortfall) => shortfall.message));
  const blocked = impact.blocked?.reason ?? null;
  const source = impact.keyLines ?? impact.lines;
  return source.filter((line) => !shortfalls.has(line) && line !== blocked);
}

function soleResultChange(impact: ImpactSummary, items: readonly ImpactKeyItemVM[]): ImpactKeyItemVM | null {
  const [fixture] = impact.fixtures;
  const single = impact.fixtures.length === 1 && fixture?.change === 'result_changed';
  const clear = !impact.blocked && (impact.slotShortfalls ?? []).length === 0;
  return single && clear && items.length === 1 ? items[0] : null;
}

export function impactViewModel(impact: ImpactSummary, names: ImpactNames = FALLBACK_NAMES): ImpactViewModel {
  const standings = impact.standings.map((change) => ({
    key: `${change.stageId}:${change.poolId ?? ''}:${change.teamId}`,
    text: change.headline ?? standingText(change, names),
    note: change.headline ? (change.detail ?? null) : null,
    warn: false,
  }));
  const lines = keyLines(impact);
  const items = keyItems(impact, lines);
  const sole = soleResultChange(impact, items);
  return {
    headline: sole?.headline ?? impact.headline,
    lines,
    keyItems: sole ? [] : items,
    severity: impact.severity,
    severityNotice: impact.severity === 'warning' || impact.severity === 'destructive' ? severityNotice(impact) : null,
    fixtures: impact.fixtures.map((fixture, index) => ({
      key: `${fixture.fixtureId}:${index}`,
      kind: kindFor(fixture.change),
      label: fixture.label,
      change: fixture.changeText ?? CHANGE_TEXT[fixture.change],
      note: fixtureNote(fixture),
      hasMatchData: fixture.hasMatchData,
    })),
    standings,
    qualification: impact.qualification.map((change) => ({
      key: `${change.stageId}:${change.teamId}`,
      text: change.headline ?? qualificationText(change, names),
      note: change.headline ? (change.detail ?? null) : null,
      warn: false,
    })),
    slots: impact.slots.map((change) => slotText(change, names)),
    shortfalls: (impact.slotShortfalls ?? []).map((shortfall) => ({
      key: shortfall.slotId,
      text: shortfall.headline ?? shortfallHeadline(shortfall),
      note: null,
      warn: true,
      detail: shortfall.detail ?? shortfall.message,
    })),
    nrrText: impact.nrrChanged && standings.length === 0 ? 'Net run rate changes.' : null,
    blockedReason: impact.blocked?.reason ?? null,
    requiresReason: impact.requiresReason,
    destructive: impact.severity === 'destructive',
  };
}

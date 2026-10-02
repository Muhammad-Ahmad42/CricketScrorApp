import { formatNrr } from '@/domain/scoring/format';
import type {
  FixtureImpact,
  ImpactSeverity,
  ImpactSummary,
  QualificationChange,
  QualificationState,
  SlotChange,
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
}

export interface ImpactFixtureVM {
  readonly key: string;
  readonly glyph: '+' | '−' | '~';
  readonly label: string;
  readonly change: string;
  readonly hasMatchData: boolean;
}

export interface ImpactViewModel {
  readonly headline: string;
  readonly lines: readonly string[];
  readonly severity: ImpactSeverity;
  readonly severityNotice: string | null;
  readonly fixtures: readonly ImpactFixtureVM[];
  readonly standings: readonly ImpactLineVM[];
  readonly qualification: readonly ImpactLineVM[];
  readonly slots: readonly ImpactLineVM[];
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

const CHANGE_WORD: { readonly [K in FixtureImpact['change']]: string } = {
  created: 'created',
  removed: 'removed',
  teams_changed: 'teams changed',
  moved: 'moved',
  rescheduled: 'rescheduled',
  status_changed: 'status changed',
  result_changed: 'result changed',
};

function glyphFor(change: FixtureImpact['change']): ImpactFixtureVM['glyph'] {
  if (change === 'created') {
    return '+';
  }
  if (change === 'removed') {
    return '−';
  }
  return '~';
}

function positionText(line: StandingSnapshotLine | null, missing: string): string {
  return line === null ? missing : ordinal(line.position);
}

function standingText(change: StandingChange, names: ImpactNames): string {
  const where = names.pool(change.poolId) ?? names.stage(change.stageId);
  const parts = [`${names.team(change.teamId)} · ${where}`];
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
  return `${names.team(change.teamId)}: ${stateText(change.before)} → ${stateText(change.after)} (${names.stage(change.stageId)})`;
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
    return `${plural(impact.completedMatchesAffected, 'completed match', 'completed matches')} ${impact.completedMatchesAffected === 1 ? 'is' : 'are'} affected.`;
  }
  if (impact.severity === 'destructive') {
    return 'This change cannot be undone automatically.';
  }
  return null;
}

export function impactViewModel(impact: ImpactSummary, names: ImpactNames = FALLBACK_NAMES): ImpactViewModel {
  return {
    headline: impact.headline,
    lines: impact.lines,
    severity: impact.severity,
    severityNotice: impact.severity === 'warning' || impact.severity === 'destructive' ? severityNotice(impact) : null,
    fixtures: impact.fixtures.map((fixture, index) => ({
      key: `${fixture.fixtureId}:${index}`,
      glyph: glyphFor(fixture.change),
      label: fixture.label,
      change: CHANGE_WORD[fixture.change],
      hasMatchData: fixture.hasMatchData,
    })),
    standings: impact.standings.map((change) => ({
      key: `${change.stageId}:${change.poolId ?? ''}:${change.teamId}`,
      text: standingText(change, names),
      note: null,
      warn: false,
    })),
    qualification: impact.qualification.map((change) => ({
      key: `${change.stageId}:${change.teamId}`,
      text: qualificationText(change, names),
      note: null,
      warn: false,
    })),
    slots: impact.slots.map((change) => slotText(change, names)),
    nrrText: impact.nrrChanged ? 'Net run rate changes for the affected teams.' : null,
    blockedReason: impact.blocked?.reason ?? null,
    requiresReason: impact.requiresReason,
    destructive: impact.severity === 'destructive',
  };
}

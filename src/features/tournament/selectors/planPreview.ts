import { scheduleSequential, validateFixtureDrafts, type FixtureIssue } from '@/domain/tournament/fixtures';
import type { PoolAssignment } from '@/domain/tournament/pools';
import type { FixtureDraft, FixtureSide, Pool, PoolId, Stage, StageSlot } from '@/domain/types';
import type { FixturePlan } from '@/services/contracts';
import { formatDateTime } from './dates';

export interface PlanRowVM {
  readonly key: string;
  readonly fixtureId: string;
  readonly matchNumber: number;
  readonly label: string;
  readonly teams: string;
  readonly when: string | null;
}

export interface PlanSectionVM {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly PlanRowVM[];
}

export type SideNamer = (side: FixtureSide) => string;

export function sideNamer(teamNames: ReadonlyMap<string, string>, slots: readonly StageSlot[]): SideNamer {
  const slotLabels = new Map(slots.map((slot) => [slot.id, slot.label]));
  return (side) => (side.kind === 'team' ? teamNames.get(side.teamId) ?? 'Team' : slotLabels.get(side.slotId) ?? 'To be decided');
}

function rowFor(draft: FixtureDraft, name: SideNamer): PlanRowVM {
  return {
    key: draft.id,
    fixtureId: draft.id,
    matchNumber: draft.matchNumber,
    label: draft.label ?? `M${draft.matchNumber}`,
    teams: `${name(draft.sideA)} v ${name(draft.sideB)}`,
    when: formatDateTime(draft.scheduledDate, draft.scheduledTime),
  };
}

export function planSections(plan: FixturePlan, pools: readonly Pool[], name: SideNamer): readonly PlanSectionVM[] {
  const poolName = new Map(pools.map((pool) => [pool.id, pool.name]));
  const ordered = [...plan.fixtures].sort((a, b) => a.matchNumber - b.matchNumber);
  const sections: { key: string; title: string; rows: PlanRowVM[] }[] = [];
  for (const draft of ordered) {
    const title = draft.bracket
      ? draft.bracket.roundName
      : [draft.poolId ? poolName.get(draft.poolId) : null, draft.round !== null ? `Round ${draft.round}` : null].filter(Boolean).join(' · ') || 'Matches';
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.rows.push(rowFor(draft, name));
    } else {
      sections.push({ key: `${title}-${sections.length}`, title, rows: [rowFor(draft, name)] });
    }
  }
  return sections;
}

export function planIssues(
  plan: FixturePlan,
  context: {
    readonly stage: Stage;
    readonly pools: readonly Pool[];
    readonly assignment: PoolAssignment | null;
    readonly entrants: readonly FixtureSide[];
    readonly startDate: string | null;
    readonly endDate: string | null;
  },
): readonly FixtureIssue[] {
  const poolMembers: Record<PoolId, readonly FixtureSide[]> = {};
  for (const pool of context.assignment?.pools ?? []) {
    poolMembers[pool.poolId] = pool.members;
  }
  const legsByPool = new Map<PoolId, number>();
  for (const pool of context.pools) {
    if (pool.stageId === context.stage.id && pool.legs !== null) {
      legsByPool.set(pool.id, pool.legs);
    }
  }
  return validateFixtureDrafts(plan.fixtures, {
    poolMembers,
    tournamentSides: context.entrants,
    legsByPool,
    defaultLegs: context.stage.config.fixtureGeneration.legs,
    startDate: context.startDate,
    endDate: context.endDate,
  });
}

export function updatePlanFixture(plan: FixturePlan, fixtureId: string, patch: Partial<FixtureDraft>): FixturePlan {
  return { ...plan, fixtures: plan.fixtures.map((draft) => (draft.id === fixtureId ? { ...draft, ...patch } : draft)) };
}

export function parseTimes(text: string): readonly string[] | null {
  const times = text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return times.length > 0 && times.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ? times : null;
}

export function schedulePlan(plan: FixturePlan, startDate: string, matchesPerDay: number, times: readonly string[]): FixturePlan {
  return { ...plan, fixtures: scheduleSequential(plan.fixtures, { startDate, matchesPerDay, times }) };
}

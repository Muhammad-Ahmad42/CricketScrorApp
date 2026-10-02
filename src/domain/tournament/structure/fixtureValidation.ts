import type { FixtureDraft, FixtureSide, IsoDate, PoolId } from '../../types';
import type { FixtureIssue, FixtureIssueCode } from '../fixtures';
import { pairKey, sameSide, sideKey, sideSet } from './sides';

export interface FixtureValidationContext {
  readonly poolMembers: Readonly<Record<PoolId, readonly FixtureSide[]>>;
  readonly tournamentSides: readonly FixtureSide[];
  readonly legsByPool: ReadonlyMap<PoolId, number>;
  readonly defaultLegs: number;
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
}

function issue(draft: FixtureDraft, code: FixtureIssueCode, severity: 'error' | 'warning', detail: string): FixtureIssue {
  return { code, severity, fixtureId: draft.id, message: `Match ${draft.matchNumber}: ${detail}` };
}

function membershipIssues(drafts: readonly FixtureDraft[], context: FixtureValidationContext): readonly FixtureIssue[] {
  const tournament = sideSet(context.tournamentSides);
  const poolSets = new Map<PoolId, ReadonlySet<string>>();
  const poolSet = (poolId: PoolId): ReadonlySet<string> => {
    const cached = poolSets.get(poolId);
    if (cached) {
      return cached;
    }
    const created = sideSet(context.poolMembers[poolId] ?? []);
    poolSets.set(poolId, created);
    return created;
  };
  return drafts.flatMap((draft) => {
    const found: FixtureIssue[] = [];
    if (sameSide(draft.sideA, draft.sideB)) {
      found.push(issue(draft, 'SAME_SIDE_TWICE', 'error', "a team can't play against itself."));
    }
    const sides = sameSide(draft.sideA, draft.sideB) ? [draft.sideA] : [draft.sideA, draft.sideB];
    for (const side of sides) {
      const key = sideKey(side);
      if (!tournament.has(key)) {
        found.push(issue(draft, 'SIDE_NOT_IN_TOURNAMENT', 'error', 'one of the teams is not in this tournament.'));
      } else if (draft.poolId !== null && !poolSet(draft.poolId).has(key)) {
        found.push(issue(draft, 'SIDE_NOT_IN_POOL', 'error', 'one of the teams is not in this pool.'));
      }
    }
    return found;
  });
}

function duplicateIssues(drafts: readonly FixtureDraft[], context: FixtureValidationContext): readonly FixtureIssue[] {
  const counts = new Map<string, number>();
  return drafts.flatMap((draft) => {
    if (sameSide(draft.sideA, draft.sideB)) {
      return [];
    }
    const scope = draft.poolId === null ? `stage:${draft.stageId}` : `pool:${draft.poolId}`;
    const key = `${scope}#${pairKey(draft.sideA, draft.sideB)}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const limit = draft.poolId === null ? context.defaultLegs : (context.legsByPool.get(draft.poolId) ?? context.defaultLegs);
    if (count <= limit) {
      return [];
    }
    return [issue(draft, 'DUPLICATE_ENCOUNTER', 'warning', 'these teams already meet as often as the format allows.')];
  });
}

function doubleBookingIssues(drafts: readonly FixtureDraft[]): readonly FixtureIssue[] {
  const booked = new Set<string>();
  return drafts.flatMap((draft) => {
    if (draft.scheduledDate === null || draft.scheduledTime === null) {
      return [];
    }
    const when = `${draft.scheduledDate} ${draft.scheduledTime}`;
    const sides = sameSide(draft.sideA, draft.sideB) ? [draft.sideA] : [draft.sideA, draft.sideB];
    const clash = sides.some((side) => booked.has(`${sideKey(side)}@${when}`));
    sides.forEach((side) => booked.add(`${sideKey(side)}@${when}`));
    return clash
      ? [issue(draft, 'TEAM_DOUBLE_BOOKED', 'warning', `a team already has a match on ${draft.scheduledDate} at ${draft.scheduledTime}.`)]
      : [];
  });
}

function dateIssues(drafts: readonly FixtureDraft[], context: FixtureValidationContext): readonly FixtureIssue[] {
  return drafts.flatMap((draft) => {
    const date = draft.scheduledDate;
    if (date === null) {
      return [];
    }
    const early = context.startDate !== null && date < context.startDate;
    const late = context.endDate !== null && date > context.endDate;
    return early || late ? [issue(draft, 'OUTSIDE_TOURNAMENT_DATES', 'warning', `${date} is outside the tournament dates.`)] : [];
  });
}

export function fixtureDraftIssues(drafts: readonly FixtureDraft[], context: FixtureValidationContext): readonly FixtureIssue[] {
  return [
    ...membershipIssues(drafts, context),
    ...duplicateIssues(drafts, context),
    ...doubleBookingIssues(drafts),
    ...dateIssues(drafts, context),
  ];
}

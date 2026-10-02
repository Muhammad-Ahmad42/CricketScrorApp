import type { ChangePlan, Fixture, ProposedChange } from '../../types';
import { isFixtureReplay, supersedeFixtureMatch } from '../fixtureReplay';
import { emptyPlan } from './plan';
import type { PlanContext } from './plan';
import { planPoolMove, planPoolsReplace, planPoolSwap } from './poolChanges';
import { planFixturesReplace, planStageDelete, planStageUpsert } from './stageChanges';
import { planSeedsChange, planTeamReplace, planTeamWithdraw } from './teamChanges';

type Of<K extends ProposedChange['kind']> = Extract<ProposedChange, { readonly kind: K }>;

function planFixtureUpdate(ctx: PlanContext, change: Of<'fixture_update'>): ChangePlan {
  const fixture = ctx.index.fixtureById.get(change.fixtureId);
  if (!fixture) return emptyPlan();
  const updated: Fixture = { ...fixture, ...change.patch, updatedAt: ctx.now };
  const next = isFixtureReplay(fixture, change.patch) ? supersedeFixtureMatch(updated, ctx.now) : updated;
  return { ...emptyPlan(), fixtures: { insert: [], update: [next], delete: [] } };
}

function planRulesChange(ctx: PlanContext, change: Of<'rules_change'>): ChangePlan {
  if (change.stageId === null) {
    const rules = ctx.snapshot.rules;
    return {
      ...emptyPlan(),
      rules: {
        ...rules,
        pointsSystem: change.pointsSystem ?? rules.pointsSystem,
        tieBreakers: change.tieBreakers ?? rules.tieBreakers,
        nrr: change.nrr ?? rules.nrr,
        updatedAt: ctx.now,
      },
    };
  }
  const stage = ctx.index.stageById.get(change.stageId);
  if (!stage) return emptyPlan();
  const config = {
    ...stage.config,
    pointsSystem: change.pointsSystem ?? stage.config.pointsSystem,
    tieBreakers: change.tieBreakers ?? stage.config.tieBreakers,
    nrr: change.nrr ?? stage.config.nrr,
  };
  return { ...emptyPlan(), stages: { upsert: [{ ...stage, config, updatedAt: ctx.now }], delete: [] } };
}

function planSlotChange(ctx: PlanContext, change: Of<'slot_change'>): ChangePlan {
  const slot = ctx.index.slotById.get(change.slotId);
  if (!slot) return emptyPlan();
  return { ...emptyPlan(), slots: { upsert: [{ ...slot, source: change.source }], delete: [] } };
}

export function buildPlan(ctx: PlanContext, change: ProposedChange): ChangePlan {
  switch (change.kind) {
    case 'pool_move':
      return planPoolMove(ctx, change);
    case 'pool_swap':
      return planPoolSwap(ctx, change);
    case 'team_replace':
      return planTeamReplace(ctx, change);
    case 'team_withdraw':
      return planTeamWithdraw(ctx, change);
    case 'pools_replace':
      return planPoolsReplace(ctx, change);
    case 'team_seeds_change':
      return planSeedsChange(ctx, change);
    case 'stage_upsert':
      return planStageUpsert(ctx, change);
    case 'stage_delete':
      return planStageDelete(ctx, change);
    case 'fixture_add':
      return { ...emptyPlan(), fixtures: { insert: [change.fixture], update: [], delete: [] } };
    case 'fixture_update':
      return planFixtureUpdate(ctx, change);
    case 'fixture_delete':
      return { ...emptyPlan(), fixtures: { insert: [], update: [], delete: [change.fixtureId] } };
    case 'fixtures_replace':
      return planFixturesReplace(ctx, change);
    case 'match_result_change':
      return { ...emptyPlan(), summaryChanges: [{ matchId: change.matchId, summary: change.summary }] };
    case 'rules_change':
      return planRulesChange(ctx, change);
    case 'slot_change':
      return planSlotChange(ctx, change);
    case 'override_apply':
      return { ...emptyPlan(), overrides: { insert: [change.override], revoke: [] } };
    case 'override_revoke':
      return { ...emptyPlan(), overrides: { insert: [], revoke: [{ overrideId: change.overrideId, at: ctx.now, reason: null }] } };
    default: {
      const never: never = change;
      return never;
    }
  }
}

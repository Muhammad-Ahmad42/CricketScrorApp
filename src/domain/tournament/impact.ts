import type { ChangePlan, IdGenerator, ImpactSummary, IsoDateTime, ProposedChange, TournamentSnapshot } from '../types';
import { applyChangePlan } from './change/applyPlan';
import { blockedReason } from './change/guard';
import { summarizeImpact } from './change/impactSummary';
import { planContext } from './change/plan';
import { buildPlan } from './change/planner';
import { runEvaluation } from './evaluation/pipeline';
import { indexSnapshot } from './evaluation/snapshotIndex';

export interface ImpactContext {
  readonly ids: IdGenerator;
  readonly now: IsoDateTime;
}

export function planChange(snapshot: TournamentSnapshot, change: ProposedChange, ctx: ImpactContext): ChangePlan {
  return buildPlan(planContext(snapshot, ctx.ids, ctx.now), change);
}

export function applyPlan(snapshot: TournamentSnapshot, plan: ChangePlan): TournamentSnapshot {
  return applyChangePlan(snapshot, plan);
}

export function applyChange(snapshot: TournamentSnapshot, change: ProposedChange, ctx: ImpactContext): TournamentSnapshot {
  return applyPlan(snapshot, planChange(snapshot, change, ctx));
}

export function computeImpact(change: ProposedChange, snapshot: TournamentSnapshot, ctx: ImpactContext): ImpactSummary {
  const plannerContext = planContext(snapshot, ctx.ids, ctx.now);
  const plan = buildPlan(plannerContext, change);
  const after = applyPlan(snapshot, plan);
  const before = { snapshot, evaluation: runEvaluation(snapshot), index: indexSnapshot(snapshot) };
  const next = { snapshot: after, evaluation: runEvaluation(after), index: indexSnapshot(after) };
  return summarizeImpact(change, plan, before, next, blockedReason(plannerContext, change, plan, before.evaluation));
}

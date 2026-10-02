import type { QualificationTarget, Stage, StageSlot, TournamentOverride } from '../../types';
import { explainEntryRules } from '../slots';
import { describeTieBreakerChain } from '../tiebreakers';
import { joinNames, ordinal, positionWord } from './format';
import type { SnapshotIndex } from './snapshotIndex';

function positionNoun(position: number): string {
  if (position === 1) return 'pool winner';
  if (position === 2) return 'runner-up';
  return `${ordinal(position)}-placed team`;
}

export function slotPhrase(index: SnapshotIndex, slot: StageSlot): string {
  const source = slot.source;
  switch (source.kind) {
    case 'pool_position': {
      const pool = index.poolById.get(source.poolId);
      return pool ? `${pool.name} ${positionWord(source.position)}` : slot.label;
    }
    case 'best_of_position':
      return source.rank === 1 ? `the best ${positionNoun(source.position)}` : `the ${ordinal(source.rank)} best ${positionNoun(source.position)}`;
    case 'overall_position':
      return `${ordinal(source.rank)} overall`;
    default:
      return slot.label;
  }
}

export function ruleContext(index: SnapshotIndex, source: Stage, target: Stage): string {
  const parts: string[] = [];
  if (target.config.entryRules.length > 0) {
    const names = new Map(index.snapshot.stages.map((stage) => [stage.id, stage.name]));
    parts.push(explainEntryRules(target.config.entryRules, names));
  }
  if (source.type !== 'knockout' && (index.poolsByStage.get(source.id) ?? []).length > 0) {
    const chain = source.config.tieBreakers ?? index.snapshot.rules.tieBreakers;
    if (chain.length > 0) parts.push(describeTieBreakerChain(chain));
  }
  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}

export interface TextContext {
  readonly team: string;
  readonly target: Stage;
  readonly heldSlot: StageSlot | null;
  readonly heldFinal: boolean;
  readonly rule: string;
  readonly tieWith: readonly string[] | null;
  readonly hint: string | null;
}

export function qualifiedText(index: SnapshotIndex, ctx: TextContext): string {
  const as = ctx.heldSlot && ctx.heldFinal ? ` as ${slotPhrase(index, ctx.heldSlot)}` : '';
  return `${ctx.team} have mathematically qualified for the ${ctx.target.name}${as}${ctx.rule}.`;
}

export function parallelText(index: SnapshotIndex, team: string, out: Stage, ctx: TextContext): string {
  const as = ctx.heldSlot && ctx.heldFinal ? ` as ${slotPhrase(index, ctx.heldSlot)}` : '';
  return `${team} are out of the ${out.name} but have qualified for the ${ctx.target.name}${as}.`;
}

export function contentionText(ctx: TextContext): string {
  if (ctx.tieWith && ctx.tieWith.length > 1) {
    const label = ctx.heldSlot?.label ?? `a place in the ${ctx.target.name}`;
    return `${joinNames(ctx.tieWith)} are level for ${label}: organizer decision required.`;
  }
  const base = `${ctx.team} are still in contention for the ${ctx.target.name}.`;
  return ctx.hint ? `${base} ${ctx.hint}` : base;
}

export function eliminatedText(ctx: TextContext): string {
  return `${ctx.team} can no longer qualify for the ${ctx.target.name}.`;
}

export function manualText(team: string, target: Stage, qualified: boolean, override: TournamentOverride): string {
  const verb = qualified ? 'qualified for' : 'were eliminated from';
  return `${team} ${verb} the ${target.name} by Manual Override: '${override.reason}'.`;
}

export function winHint(opponents: readonly string[]): string | null {
  if (opponents.length === 0) return null;
  if (opponents.length === 1) return `A win against ${opponents[0]} guarantees qualification.`;
  return `Wins against ${joinNames(opponents)} guarantee qualification.`;
}

export function targetSummary(targets: readonly QualificationTarget[]): QualificationTarget | null {
  return (
    targets.find((target) => target.state === 'qualified') ??
    targets.find((target) => target.state === 'in_contention') ??
    targets[0] ??
    null
  );
}

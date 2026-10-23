import type { QualificationTarget, Stage, StageSlot, TournamentOverride } from '../../types';
import { asSentence } from '../../text';
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

export function ruleLines(index: SnapshotIndex, source: Stage, target: Stage): string {
  const parts: string[] = [];
  if (target.config.entryRules.length > 0) {
    const names = new Map(index.snapshot.stages.map((stage) => [stage.id, stage.name]));
    parts.push(asSentence(explainEntryRules(target.config.entryRules, names)));
  }
  if (source.type !== 'knockout' && (index.poolsByStage.get(source.id) ?? []).length > 0) {
    const chain = source.config.tieBreakers ?? index.snapshot.rules.tieBreakers;
    if (chain.length > 0) parts.push(`Ranking: ${describeTieBreakerChain(chain)}.`);
  }
  return parts.join(' ');
}

export interface TextContext {
  readonly team: string;
  readonly target: Stage;
  readonly heldSlot: StageSlot | null;
  readonly heldFinal: boolean;
  readonly rule: string;
  readonly rules: string;
  readonly tieWith: readonly string[] | null;
  readonly hint: string | null;
  readonly opponents: readonly string[] | null;
}

export interface QualificationCopy {
  readonly headline: string;
  readonly note: string | null;
  readonly detail: string;
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

function heldAs(index: SnapshotIndex, ctx: TextContext): string | null {
  return ctx.heldSlot && ctx.heldFinal ? slotPhrase(index, ctx.heldSlot) : null;
}

function beatHeadline(opponents: readonly string[]): string {
  if (opponents.length <= 2) return `Beat ${joinNames(opponents)} to qualify`;
  return `Win all ${opponents.length} remaining to qualify`;
}

const SETTLED = 'No remaining result can change this.';
const OPEN = 'Depends on the remaining results.';

function withRules(lead: string, ctx: TextContext): string {
  return ctx.rules.length > 0 ? `${lead} ${ctx.rules}` : lead;
}

export function qualifiedCopy(index: SnapshotIndex, ctx: TextContext): QualificationCopy {
  const as = heldAs(index, ctx);
  return {
    headline: as === null ? `Through to the ${ctx.target.name}` : `${ctx.target.name} as ${as}`,
    note: as === null ? null : `As ${as}`,
    detail: withRules(SETTLED, ctx),
  };
}

export function parallelCopy(index: SnapshotIndex, out: Stage, ctx: TextContext): QualificationCopy {
  const line = `${ctx.target.name}, not the ${out.name}`;
  const as = heldAs(index, ctx);
  return { headline: line, note: line, detail: withRules(as === null ? SETTLED : `As ${as}. ${SETTLED}`, ctx) };
}

export function contentionCopy(ctx: TextContext): QualificationCopy {
  if (ctx.tieWith && ctx.tieWith.length > 1) {
    const others = ctx.tieWith.filter((name) => name !== ctx.team);
    const line = `Level with ${joinNames(others.length > 0 ? others : ctx.tieWith)}: organizer decides`;
    return { headline: line, note: line, detail: withRules(contentionText(ctx), ctx) };
  }
  if (ctx.opponents && ctx.opponents.length > 0 && ctx.hint) {
    const line = beatHeadline(ctx.opponents);
    return { headline: line, note: line, detail: withRules(ctx.hint, ctx) };
  }
  return { headline: `Can still reach the ${ctx.target.name}`, note: null, detail: withRules(OPEN, ctx) };
}

export function eliminatedCopy(ctx: TextContext): QualificationCopy {
  return { headline: `Can't reach the ${ctx.target.name}`, note: null, detail: withRules(SETTLED, ctx) };
}

export function manualCopy(target: Stage, qualified: boolean, override: TournamentOverride): QualificationCopy {
  const line = qualified ? `Into the ${target.name}` : `Out of the ${target.name}`;
  return { headline: `${line} by organizer decision`, note: line, detail: `Manual override: “${override.reason}”.` };
}

export function targetSummary(targets: readonly QualificationTarget[]): QualificationTarget | null {
  return (
    targets.find((target) => target.state === 'qualified') ??
    targets.find((target) => target.state === 'in_contention') ??
    targets[0] ??
    null
  );
}

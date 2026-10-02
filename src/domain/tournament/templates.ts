import type {
  Id,
  IdGenerator,
  IsoDateTime,
  Pool,
  PoolEntry,
  Stage,
  StageSlot,
  TournamentId,
  TournamentRules,
  TournamentSnapshot,
  TournamentTemplate,
} from '../types';
import { BUILTIN_TEMPLATES } from './structure/builtinTemplates';
import { templateFromStructure } from './structure/templateFromSnapshot';
import { instantiateStructure } from './structure/templateInstantiate';

export function builtinTemplates(): readonly TournamentTemplate[] {
  return BUILTIN_TEMPLATES;
}

export interface InstantiatedStructure {
  readonly rules: TournamentRules;
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly poolEntries: readonly PoolEntry[];
}

export function instantiateTemplate(
  template: TournamentTemplate,
  input: { readonly tournamentId: TournamentId; readonly now: IsoDateTime; readonly ids: IdGenerator },
): InstantiatedStructure {
  return instantiateStructure(template, input);
}

export function templateFromSnapshot(
  snapshot: TournamentSnapshot,
  meta: { readonly id: Id; readonly name: string; readonly description: string; readonly now: IsoDateTime },
): TournamentTemplate {
  return templateFromStructure(snapshot, meta);
}

function directEntries(template: TournamentTemplate): number {
  return template.stages.reduce(
    (total, stage) => total + stage.entry.reduce((sum, rule) => sum + (rule.kind === 'direct_entry' ? rule.count : 0), 0),
    0,
  );
}

export function templateFitsTeamCount(template: TournamentTemplate, teamCount: number): { readonly ok: boolean; readonly message: string | null } {
  if (template.teamCount !== null && template.teamCount !== teamCount) {
    return { ok: false, message: `Designed for ${template.teamCount} teams; you have ${teamCount}.` };
  }
  if (teamCount < 2) {
    return { ok: false, message: `A tournament needs at least 2 teams; you have ${teamCount}.` };
  }
  const first = template.stages[0];
  if (!first) {
    return { ok: false, message: 'This template has no stages.' };
  }
  const entrants = teamCount - directEntries(template);
  if (first.poolSizes !== null) {
    const designed = first.poolSizes.reduce((sum, size) => sum + size, 0);
    if (designed !== entrants) {
      return { ok: false, message: `Designed for pools of ${first.poolSizes.join(', ')} (${designed} teams); you have ${entrants}.` };
    }
  }
  if (first.entry.length === 0 && first.poolCount > 1 && entrants < first.poolCount * 2) {
    return { ok: false, message: `${first.poolCount} pools need at least ${first.poolCount * 2} teams; you have ${entrants}.` };
  }
  return { ok: true, message: null };
}

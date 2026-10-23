import { explainEntryRules } from '@/domain/tournament/slots';
import type { Pool, Stage, StageId, StageType, TournamentStructureKind } from '@/domain/types';
import { plural } from '@/features/shared';
import { STAGE_TYPE_LABEL, legsLabel } from '../labels';

export function stageNameMap(stages: readonly Stage[]): ReadonlyMap<StageId, string> {
  return new Map(stages.map((stage) => [stage.id, stage.name]));
}

function summaryParts(stage: Stage, pools: readonly Pool[], names: ReadonlyMap<StageId, string>): string[] {
  const parts = [STAGE_TYPE_LABEL[stage.type]];
  const count = pools.filter((pool) => pool.stageId === stage.id).length;
  if (count > 1) {
    parts.push(plural(count, 'pool'));
  }
  if (stage.config.fixtureGeneration.method === 'round_robin') {
    parts.push(legsLabel(stage.config.fixtureGeneration.legs));
  } else if (stage.config.fixtureGeneration.method === 'manual') {
    parts.push('fixtures added by hand');
  }
  if (stage.config.entryRules.length > 0) {
    parts.push(explainEntryRules(stage.config.entryRules, names));
  }
  return parts;
}

function stem(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+stage$/, '')
    .replace(/s$/, '');
}

export function namesStageType(stage: Stage): boolean {
  return stem(stage.name) === stem(STAGE_TYPE_LABEL[stage.type]);
}

export function stageDetail(stage: Stage, pools: readonly Pool[], names: ReadonlyMap<StageId, string>): string {
  const parts = summaryParts(stage, pools, names);
  return (namesStageType(stage) ? parts.slice(1) : parts).join(' · ');
}

function sentenceStart(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function stageSubtitle(stage: Stage, pools: readonly Pool[], names: ReadonlyMap<StageId, string>): string {
  return sentenceStart(stageDetail(stage, pools, names));
}

export function stageLine(stage: Stage, pools: readonly Pool[], names: ReadonlyMap<StageId, string>): string {
  return [stage.name, stageDetail(stage, pools, names)].filter((part) => part.length > 0).join(' · ');
}

const TABLE_TYPES: readonly StageType[] = ['league', 'group'];

export const STRUCTURE_SHORT: { readonly [K in TournamentStructureKind]: string } = {
  league: 'League',
  groups: 'Groups',
  knockout: 'Knockout',
  groups_knockout: 'Groups + KO',
  custom: 'Custom',
};

export function structureShortLabel(stages: readonly Stage[], fallback: TournamentStructureKind): string {
  const types = [...stages].sort((a, b) => a.orderIndex - b.orderIndex).map((stage) => stage.type);
  if (types.length === 0) {
    return STRUCTURE_SHORT[fallback];
  }
  if (types.includes('custom')) {
    return STRUCTURE_SHORT.custom;
  }
  const split = types.indexOf('knockout');
  const tables = split === -1 ? types : types.slice(0, split);
  const knockouts = split === -1 ? [] : types.slice(split);
  if (knockouts.some((type) => type !== 'knockout') || tables.some((type) => !TABLE_TYPES.includes(type))) {
    return STRUCTURE_SHORT.custom;
  }
  if (tables.length === 0) {
    return STRUCTURE_SHORT.knockout;
  }
  const table = tables.every((type) => type === 'league') ? STRUCTURE_SHORT.league : STRUCTURE_SHORT.groups;
  return knockouts.length === 0 ? table : `${table} + KO`;
}

export const CHAMPION_MARK = '★ Decides the champion';

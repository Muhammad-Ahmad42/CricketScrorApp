import { explainEntryRules } from '@/domain/tournament/slots';
import type { Pool, Stage, StageId } from '@/domain/types';
import { plural } from '@/features/shared';
import { STAGE_TYPE_LABEL, legsLabel } from '../labels';

export function stageNameMap(stages: readonly Stage[]): ReadonlyMap<StageId, string> {
  return new Map(stages.map((stage) => [stage.id, stage.name]));
}

export function stageSummary(stage: Stage, pools: readonly Pool[], names: ReadonlyMap<StageId, string>): string {
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
  return parts.join(' · ');
}

export const CHAMPION_MARK = '★ Decides the champion';

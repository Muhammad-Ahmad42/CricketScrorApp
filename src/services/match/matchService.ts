import type { MatchService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { createConfigurationOperations } from './configuration';
import { createHistoryEditOperations } from './historyEdits';
import { createLifecycleOperations } from './lifecycle';
import { createQueryOperations } from './queries';
import { createScoringOperations } from './scoring';

export function createMatchService(ctx: ServiceContext): MatchService {
  return {
    ...createLifecycleOperations(ctx),
    ...createQueryOperations(ctx),
    ...createScoringOperations(ctx),
    ...createHistoryEditOperations(ctx),
    ...createConfigurationOperations(ctx),
  };
}

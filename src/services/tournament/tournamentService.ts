import type { TournamentService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { createChangeOperations } from './changes';
import { createDeletionOperations } from './deletion';
import { createFixtureMatchOperations } from './fixtureMatch';
import { createFixtureOperations } from './fixturePlans';
import { createFixtureUpdateOperations } from './fixtureUpdates';
import { createInsightOperations } from './insights';
import { createTournamentLifecycle } from './lifecycle';
import { createMembershipOperations } from './membership';
import { createPoolPreviewOperations } from './poolPreview';
import { createStructureOperations } from './structure';

export function createTournamentService(ctx: ServiceContext): TournamentService {
  return {
    ...createTournamentLifecycle(ctx),
    ...createInsightOperations(ctx),
    ...createMembershipOperations(ctx),
    ...createStructureOperations(ctx),
    ...createPoolPreviewOperations(ctx),
    ...createFixtureOperations(ctx),
    ...createChangeOperations(ctx),
    ...createFixtureUpdateOperations(ctx),
    ...createFixtureMatchOperations(ctx),
    ...createDeletionOperations(ctx),
  };
}

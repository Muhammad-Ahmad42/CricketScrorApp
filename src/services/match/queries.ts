import type { MatchService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { attempt, inTransaction, withRepositories } from '../core/transaction';
import { readMatchLog } from './matchLog';

type QueryOperations = Pick<MatchService, 'load' | 'list' | 'findResumable' | 'auditLog'>;

export function createQueryOperations(ctx: ServiceContext): QueryOperations {
  return {
    load(matchId) {
      return attempt(MESSAGES.loadMatch, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          return { match: log.match, setup: log.setup, events: log.events, state: log.state };
        }),
      );
    },

    list(query) {
      return attempt(MESSAGES.matchList, () => withRepositories(ctx, (repos) => repos.matches.list(query)));
    },

    findResumable(opts) {
      return attempt(MESSAGES.matchList, () => withRepositories(ctx, (repos) => repos.matches.findResumable(opts)));
    },

    auditLog(matchId, page) {
      return attempt(MESSAGES.loadMatch, () =>
        withRepositories(ctx, (repos) => repos.audit.list({ matchId, limit: page.limit, ...(page.before === undefined ? {} : { before: page.before }) })),
      );
    },
  };
}

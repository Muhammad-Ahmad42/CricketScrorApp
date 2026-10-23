import type { MatchService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { assertSquadSizes, newMatchRow, startLog, validateNewMatch } from './creation';
import { MATCH_NOT_FOUND } from './matchLog';
import { rebuildProjection } from './rebuild';

type LifecycleOperations = Pick<MatchService, 'createMatch' | 'discard' | 'dismissResume' | 'delete' | 'rebuildProjections'>;

const UNFINISHED = ['scheduled', 'live', 'paused', 'postponed'];

export function createLifecycleOperations(ctx: ServiceContext): LifecycleOperations {
  return {
    createMatch(input, openingEvents = []) {
      return attempt(MESSAGES.createMatch, () =>
        inTransaction(ctx, async (repos) => {
          if (input.tournamentId !== null || input.fixtureId !== null) {
            throw failure('VALIDATION', 'Start tournament matches from their fixture.');
          }
          validateNewMatch(input);
          await assertSquadSizes(repos, input);
          const now = ctx.clock.now();
          const match = await newMatchRow(repos, input, ctx.ids(), now);
          await repos.matches.insert(match, input.squads);
          const committed = await startLog(ctx, repos, match, openingEvents, now);
          return committed.live;
        }),
      );
    },

    discard(matchId) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const match = await repos.matches.get(matchId);
          if (match === null) {
            throw failure('NOT_FOUND', MATCH_NOT_FOUND);
          }
          if (match.tournamentId !== null || match.fixtureId !== null) {
            throw failure('FORBIDDEN_STATE', "Tournament matches can't be discarded. Manage them from the tournament instead.");
          }
          if (!UNFINISHED.includes(match.status)) {
            throw failure('FORBIDDEN_STATE', 'Only unfinished matches can be discarded. Delete finished matches from the history.');
          }
          await repos.matches.delete(matchId);
        }),
      );
    },

    dismissResume(matchId) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const match = await repos.matches.get(matchId);
          if (match === null) {
            throw failure('NOT_FOUND', MATCH_NOT_FOUND);
          }
          await repos.matches.setResumeDismissed(matchId, ctx.clock.now());
        }),
      );
    },

    delete(matchId) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const match = await repos.matches.get(matchId);
          if (match === null) {
            throw failure('NOT_FOUND', MATCH_NOT_FOUND);
          }
          if (match.tournamentId !== null || match.fixtureId !== null) {
            throw failure('FORBIDDEN_STATE', 'This match belongs to a tournament. Remove it from the tournament instead.');
          }
          await repos.matches.delete(matchId);
        }),
      );
    },

    rebuildProjections(matchId) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos, tx) => {
          const outcome = await rebuildProjection(ctx, repos, tx, matchId);
          if (!outcome.rebuilt) {
            throw failure('FORBIDDEN_STATE', MESSAGES.needsRepair, { detail: outcome.issue });
          }
        }),
      );
    },
  };
}

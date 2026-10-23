import type { TournamentService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { evaluateSnapshot, readSnapshot } from './snapshots';

type DeletionOperations = Pick<TournamentService, 'previewDelete' | 'delete'>;

export function createDeletionOperations(ctx: ServiceContext): DeletionOperations {
  return {
    previewDelete(tournamentId) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          await readSnapshot(ctx, repos, tournamentId);
          return repos.tournaments.deletionFootprint(tournamentId);
        }),
      );
    },

    delete(tournamentId, confirm) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const snapshot = await readSnapshot(ctx, repos, tournamentId);
          if (confirm.typedName.trim() !== snapshot.tournament.name) {
            throw failure('VALIDATION', "Type the tournament's name to delete it.");
          }
          const { policy } = evaluateSnapshot(snapshot);
          if (policy.deleteTournament === 'forbidden') {
            throw failure('FORBIDDEN_STATE', 'This tournament is archived. Unarchive it before deleting it.');
          }
          const footprint = await repos.tournaments.deletionFootprint(tournamentId);
          if (footprint.matches > 0 && !confirm.deleteCompletedMatches) {
            throw failure(
              'CONFIRMATION_REQUIRED',
              `${footprint.matches} scored match${footprint.matches === 1 ? '' : 'es'} will be deleted too. Confirm to continue.`,
            );
          }
          for (const matchId of await repos.tournaments.listMatchIds(tournamentId)) {
            await repos.matches.delete(matchId);
          }
          await repos.tournaments.delete(tournamentId);
          ctx.locator.forget(tournamentId);
        }),
      );
    },
  };
}

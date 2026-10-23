import { builtinTemplates, computeTournamentStats, simulate, templateFromSnapshot } from '@/domain/tournament';
import type { TournamentService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction, withRepositories } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { evaluateSnapshot, readSnapshot } from './snapshots';

type InsightOperations = Pick<
  TournamentService,
  'list' | 'snapshot' | 'evaluate' | 'whatIf' | 'stats' | 'auditLog' | 'listTemplates' | 'saveAsTemplate'
>;

export function createInsightOperations(ctx: ServiceContext): InsightOperations {
  return {
    list(opts) {
      return attempt(MESSAGES.tournamentLoad, () => withRepositories(ctx, (repos) => repos.tournaments.list(opts)));
    },

    snapshot(tournamentId) {
      return attempt(MESSAGES.tournamentLoad, () => inTransaction(ctx, (repos) => readSnapshot(ctx, repos, tournamentId)));
    },

    evaluate(tournamentId) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, evaluation } = evaluateSnapshot(await readSnapshot(ctx, repos, tournamentId));
          return { snapshot, evaluation };
        }),
      );
    },

    whatIf(tournamentId, hypotheticals) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => simulate(await readSnapshot(ctx, repos, tournamentId), hypotheticals)),
      );
    },

    stats(tournamentId) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, evaluation } = evaluateSnapshot(await readSnapshot(ctx, repos, tournamentId));
          return computeTournamentStats(snapshot, evaluation);
        }),
      );
    },

    auditLog(tournamentId, page) {
      return attempt(MESSAGES.tournamentLoad, () =>
        withRepositories(ctx, (repos) =>
          repos.audit.list({ tournamentId, limit: page.limit, ...(page.before === undefined ? {} : { before: page.before }) }),
        ),
      );
    },

    listTemplates() {
      return attempt(MESSAGES.tournamentLoad, () =>
        withRepositories(ctx, async (repos) => [...builtinTemplates(), ...(await repos.templates.list())]),
      );
    },

    saveAsTemplate(tournamentId, meta) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const name = trimmedOrNull(meta.name);
          if (name === null) {
            throw failure('VALIDATION', 'Give the template a name.');
          }
          const snapshot = await readSnapshot(ctx, repos, tournamentId);
          if (snapshot.stages.length === 0) {
            throw failure('VALIDATION', 'Add a stage before saving a template.');
          }
          const template = templateFromSnapshot(snapshot, { id: ctx.ids(), name, description: meta.description.trim(), now: ctx.clock.now() });
          await repos.templates.upsert(template);
          return template;
        }),
      );
    },
  };
}

import { canTransitionTournament } from '@/domain/tournament';
import type { Tournament } from '@/domain/types';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { findTemplate, infoFromInput, initialRules, normalizeInfo, patchInfo } from './info';
import { refreshTournamentProjection } from './matchEffects';
import { readEvaluated } from './snapshots';
import { guardContext } from './status';

type LifecycleOperations = Pick<TournamentService, 'create' | 'updateInfo' | 'setStatus'>;

export function createTournamentLifecycle(ctx: ServiceContext): LifecycleOperations {
  return {
    create(input) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const info = normalizeInfo(infoFromInput(input));
          const template = input.templateId === null ? null : await findTemplate(repos, input.templateId);
          const now = ctx.clock.now();
          const id = ctx.ids();
          const tournament: Tournament = { id, ...info, status: 'draft', createdAt: now, updatedAt: now };
          await repos.tournaments.insert(tournament, await initialRules(repos, id, template, now));
          await writeAudit(
            ctx,
            repos,
            {
              tournamentId: id,
              action: 'tournament_created',
              entityType: 'tournament',
              entityId: id,
              summary: `${tournament.name} was created${template === null ? '' : ` from the template "${template.name}"`}.`,
              newValue: { name: tournament.name, structureKind: tournament.structureKind, templateId: input.templateId },
            },
            now,
          );
          return tournament;
        }),
      );
    },

    updateInfo(tournamentId, patch) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, policy } = await readEvaluated(ctx, repos, tournamentId);
          if (policy.info === 'forbidden') {
            throw failure('FORBIDDEN_STATE', 'This tournament is archived. Unarchive it before editing its information.');
          }
          const now = ctx.clock.now();
          const tournament: Tournament = { ...snapshot.tournament, ...normalizeInfo(patchInfo(snapshot.tournament, patch)), updatedAt: now };
          await repos.tournaments.update(tournament);
          await repos.tournaments.bumpRevision(tournamentId);
          if (tournament.status === 'active' || tournament.status === 'completed') {
            await writeAudit(
              ctx,
              repos,
              {
                tournamentId,
                action: 'tournament_info_changed',
                entityType: 'tournament',
                entityId: tournamentId,
                summary: `The information of ${tournament.name} was changed.`,
                previousValue: snapshot.tournament,
                newValue: tournament,
              },
              now,
            );
          }
          return tournament;
        }),
      );
    },

    setStatus(tournamentId, to, reason) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, evaluation } = await readEvaluated(ctx, repos, tournamentId);
          const from = snapshot.tournament.status;
          const guard = canTransitionTournament(from, to, guardContext(snapshot, evaluation));
          if (!guard.ok) {
            throw failure('FORBIDDEN_STATE', guard.reason);
          }
          const why = trimmedOrNull(reason);
          if (from === 'completed' && to === 'active' && why === null) {
            throw failure('CONFIRMATION_REQUIRED', 'Add a reason for reopening this tournament.');
          }
          const now = ctx.clock.now();
          const tournament: Tournament = { ...snapshot.tournament, status: to, updatedAt: now };
          await repos.tournaments.update(tournament);
          await refreshTournamentProjection(ctx, repos, tournamentId, now);
          await writeAudit(
            ctx,
            repos,
            {
              tournamentId,
              action: 'tournament_status_changed',
              entityType: 'tournament',
              entityId: tournamentId,
              summary: `${tournament.name} moved from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`,
              previousValue: { status: from },
              newValue: { status: to },
              reason: why,
            },
            now,
          );
          return tournament;
        }),
      );
    },
  };
}

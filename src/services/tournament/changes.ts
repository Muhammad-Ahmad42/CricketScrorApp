import { computeImpact, planChange } from '@/domain/tournament';
import type { ChangePlan, ImpactSummary, ProposedChange, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { auditForChange } from './changeAudit';
import { assertTournamentWritable, refreshTournamentProjection, syncStructureStatuses } from './matchEffects';
import { persistPlan } from './planPersistence';
import { readSnapshot } from './snapshots';

type ChangeOperations = Pick<TournamentService, 'previewChange' | 'applyChange' | 'applyOverride' | 'revokeOverride'>;

export interface ApplyOptions {
  readonly reason: string | null;
  readonly version: string;
  readonly previewed: ImpactSummary | null;
  readonly reasonOptional?: boolean;
  readonly adjustPlan?: (plan: ChangePlan) => ChangePlan;
}

function assertApplicable(change: ProposedChange): void {
  if (change.kind === 'match_result_change') {
    throw failure('VALIDATION', 'Correct match results from the match scorecard.');
  }
}

export async function applyProposedChange(
  ctx: ServiceContext,
  repos: Repositories,
  tournamentId: string,
  change: ProposedChange,
  options: ApplyOptions,
): Promise<TournamentSnapshot> {
  const snapshot = await readSnapshot(ctx, repos, tournamentId);
  if (snapshot.version !== options.version) {
    throw failure('CONFLICT', MESSAGES.tournamentConflict, {
      detail: `Previewed version ${options.version}, current version ${snapshot.version}.`,
    });
  }
  assertTournamentWritable(snapshot);
  assertApplicable(change);
  const now = ctx.clock.now();
  const impactContext = { ids: ctx.ids, now };
  const impact = computeImpact(change, snapshot, impactContext);
  if (impact.blocked !== null) {
    throw failure('FORBIDDEN_STATE', impact.blocked.reason);
  }
  const why = trimmedOrNull(options.reason);
  const reasonNeeded = options.reasonOptional !== true && (impact.requiresReason || options.previewed?.requiresReason === true);
  if (reasonNeeded && why === null) {
    throw failure('CONFIRMATION_REQUIRED', 'Add a reason for this change.');
  }
  const planned = planChange(snapshot, change, impactContext);
  await persistPlan(ctx, repos, snapshot, options.adjustPlan === undefined ? planned : options.adjustPlan(planned), now);
  await syncStructureStatuses(ctx, repos, await readSnapshot(ctx, repos, tournamentId), now);
  const after = await refreshTournamentProjection(ctx, repos, tournamentId, now);
  const audit = auditForChange(snapshot, change);
  await writeAudit(
    ctx,
    repos,
    {
      tournamentId,
      matchId: audit.matchId ?? null,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      summary: audit.summary,
      previousValue: audit.previousValue ?? null,
      newValue: change,
      reason: why,
      impact: options.previewed ?? impact,
    },
    now,
  );
  return after;
}

export function createChangeOperations(ctx: ServiceContext): ChangeOperations {
  return {
    previewChange(tournamentId, change) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          const snapshot = await readSnapshot(ctx, repos, tournamentId);
          assertApplicable(change);
          return { impact: computeImpact(change, snapshot, { ids: ctx.ids, now: ctx.clock.now() }), version: snapshot.version };
        }),
      );
    },

    applyChange(tournamentId, change, reason, confirmation) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, (repos) =>
          applyProposedChange(ctx, repos, tournamentId, change, { reason, version: confirmation.version, previewed: confirmation.impact }),
        ),
      );
    },

    applyOverride(tournamentId, override, expectedVersion) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const reason = trimmedOrNull(override.reason);
          if (reason === null) {
            throw failure('CONFIRMATION_REQUIRED', 'Add a reason for this override.');
          }
          if (override.tournamentId !== tournamentId) {
            throw failure('VALIDATION', 'This override belongs to another tournament.');
          }
          return applyProposedChange(ctx, repos, tournamentId, { kind: 'override_apply', override: { ...override, reason } }, {
            reason,
            version: expectedVersion,
            previewed: null,
          });
        }),
      );
    },

    revokeOverride(tournamentId, overrideId, reason, expectedVersion) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const snapshot = await readSnapshot(ctx, repos, tournamentId);
          const override = snapshot.overrides.find((entry) => entry.id === overrideId);
          if (override === undefined) {
            throw failure('NOT_FOUND', 'This override no longer exists.');
          }
          if (override.revokedAt !== null) {
            throw failure('VALIDATION', 'This override has already been revoked.');
          }
          const why = trimmedOrNull(reason);
          return applyProposedChange(ctx, repos, tournamentId, { kind: 'override_revoke', overrideId }, {
            reason: why,
            version: expectedVersion,
            previewed: null,
            adjustPlan: (plan) => ({
              ...plan,
              overrides: { ...plan.overrides, revoke: plan.overrides.revoke.map((entry) => ({ ...entry, reason: why })) },
            }),
          });
        }),
      );
    },
  };
}

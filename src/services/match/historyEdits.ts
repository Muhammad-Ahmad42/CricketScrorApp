import {
  logFingerprint,
  planHistoryEdit,
  summariesAffectStandingsEqually,
  type EditConflict,
  type EditSuccess,
  type HistoryEditOp,
  type PlannedHistoryEdit,
} from '@/domain/scoring';
import type { ImpactSummary, MatchSummary } from '@/domain/types';
import type { Repositories } from '@/db';
import type { HistoryEditPlan, HistoryEditPreview, MatchService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure, type ServiceFailure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { assertMatchTournamentWritable } from '../tournament/matchEffects';
import { commitLog } from './commit';
import { matchResultImpact } from './impact';
import { readMatchLog, type MatchLog } from './matchLog';
import { isTerminal, summaryOf } from './projection';

type EditOperations = Pick<MatchService, 'previewHistoryEdit' | 'planHistoryEdit' | 'applyHistoryEdit'>;
type ReadyEdit = Extract<PlannedHistoryEdit, { readonly ok: true }>;

interface EditDetails {
  readonly impact: ImpactSummary | null;
  readonly requiresReason: boolean;
  readonly standingsChanged: boolean;
}

function assertEditable(log: MatchLog): void {
  if (log.events.length === 0) {
    throw failure('FORBIDDEN_STATE', 'No balls have been recorded in this match yet.');
  }
}

function planEdit(ctx: ServiceContext, log: MatchLog, ops: readonly HistoryEditOp[]): PlannedHistoryEdit {
  return planHistoryEdit(log.setup, log.events, ops, { ids: ctx.ids, now: ctx.clock.now() });
}

function conflictFailure(conflict: EditConflict): ServiceFailure {
  return failure('VALIDATION', conflict.message, {
    domainCode: conflict.code,
    detail: `The edit no longer fits the entry at seq ${conflict.atSeq}: ${conflict.reason}`,
    ...(conflict.headline === undefined ? {} : { headline: conflict.headline, supporting: conflict.detail ?? null }),
  });
}

function requireReady(plan: PlannedHistoryEdit): ReadyEdit {
  if (plan.ok) {
    return plan;
  }
  if (plan.conflict !== null) {
    throw conflictFailure(plan.conflict);
  }
  throw failure('VALIDATION', plan.failure.message, {
    domainCode: plan.failure.code,
    detail: plan.failure.atSeq === null ? null : `The edit fails at seq ${plan.failure.atSeq}.`,
  });
}

async function editDetails(ctx: ServiceContext, repos: Repositories, log: MatchLog, outcome: EditSuccess): Promise<EditDetails> {
  const before: MatchSummary | null = summaryOf(log.setup, log.events, log.state);
  const after: MatchSummary | null = summaryOf(log.setup, outcome.events, outcome.after);
  const standingsChanged = !summariesAffectStandingsEqually(before, after);
  const impact = standingsChanged ? await matchResultImpact(ctx, repos, log.match, after) : null;
  const terminal = isTerminal(log.state) || isTerminal(outcome.after);
  return { impact, requiresReason: terminal || impact?.requiresReason === true, standingsChanged };
}

async function previewOf(ctx: ServiceContext, repos: Repositories, log: MatchLog, ready: ReadyEdit): Promise<HistoryEditPreview> {
  const details = await editDetails(ctx, repos, log, ready.outcome);
  return {
    outcome: ready.outcome,
    baseFingerprint: logFingerprint(log.events),
    impact: details.impact,
    requiresReason: details.requiresReason,
    ops: ready.ops,
    resolutions: ready.resolutions,
    consequences: ready.consequences,
  };
}

async function editableLog(repos: Repositories, matchId: string): Promise<MatchLog> {
  const log = await readMatchLog(repos, matchId);
  await assertMatchTournamentWritable(repos, log.match);
  assertEditable(log);
  return log;
}

export function createHistoryEditOperations(ctx: ServiceContext): EditOperations {
  return {
    previewHistoryEdit(matchId, ops) {
      return attempt(MESSAGES.loadMatch, () =>
        inTransaction(ctx, async (repos): Promise<HistoryEditPreview> => {
          const log = await editableLog(repos, matchId);
          return previewOf(ctx, repos, log, requireReady(planEdit(ctx, log, ops)));
        }),
      );
    },

    planHistoryEdit(matchId, ops) {
      return attempt(MESSAGES.loadMatch, () =>
        inTransaction(ctx, async (repos): Promise<HistoryEditPlan> => {
          const log = await editableLog(repos, matchId);
          const plan = planEdit(ctx, log, ops);
          if (!plan.ok && plan.conflict !== null) {
            return { status: 'conflict', conflict: plan.conflict, baseFingerprint: logFingerprint(log.events) };
          }
          return { status: 'ready', preview: await previewOf(ctx, repos, log, requireReady(plan)) };
        }),
      );
    },

    applyHistoryEdit(matchId, ops, reason, expectedFingerprint) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          if (logFingerprint(log.events) !== expectedFingerprint) {
            throw failure('CONFLICT', 'This match changed since the preview. Review the change again.');
          }
          assertEditable(log);
          const ready = requireReady(planEdit(ctx, log, ops));
          const outcome = ready.outcome;
          const details = await editDetails(ctx, repos, log, outcome);
          const why = trimmedOrNull(reason);
          if (details.requiresReason && why === null) {
            throw failure('CONFIRMATION_REQUIRED', 'Add a reason for correcting this match.');
          }
          await repos.events.replaceAll(matchId, outcome.events);
          const committed = await commitLog(ctx, repos, {
            before: log,
            match: log.match,
            setup: log.setup,
            events: outcome.events,
            state: outcome.after,
            now: ctx.clock.now(),
            appended: false,
            reason: why,
          });
          const replaced = new Set([...outcome.diff.removedIds, ...outcome.diff.replacedIds]);
          const inserted = new Set(outcome.diff.insertedIds);
          const reopened = isTerminal(log.state) && !isTerminal(outcome.after);
          const corrected = isTerminal(log.state) && details.standingsChanged;
          await writeAudit(ctx, repos, {
            tournamentId: log.match.tournamentId,
            matchId,
            action: reopened ? 'match_reopened' : corrected ? 'result_corrected' : 'match_history_edited',
            entityType: 'match',
            entityId: matchId,
            summary: reopened
              ? `${log.match.title}: recorded balls were edited and the match was reopened.`
              : corrected
                ? `${log.match.title}: the result was corrected.`
                : `${log.match.title}: recorded balls were edited.`,
            previousValue: log.events.filter((event) => replaced.has(event.id)),
            newValue: outcome.events.filter((event) => inserted.has(event.id)),
            reason: why,
            impact: details.impact,
          });
          return committed.live;
        }),
      );
    },
  };
}

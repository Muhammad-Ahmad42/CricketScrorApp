import { applyHistoryEdits, logFingerprint, summariesAffectStandingsEqually, type EditOutcome, type HistoryEditOp } from '@/domain/scoring';
import type { ImpactSummary, MatchSummary } from '@/domain/types';
import type { Repositories } from '@/db';
import type { HistoryEditPreview, MatchService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { assertMatchTournamentWritable } from '../tournament/matchEffects';
import { commitLog } from './commit';
import { matchResultImpact } from './impact';
import { readMatchLog, type MatchLog } from './matchLog';
import { isTerminal, summaryOf } from './projection';

type EditOperations = Pick<MatchService, 'previewHistoryEdit' | 'applyHistoryEdit'>;
type EditSuccess = Extract<EditOutcome, { readonly ok: true }>;

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

function computeEdit(ctx: ServiceContext, log: MatchLog, ops: readonly HistoryEditOp[]): EditSuccess {
  const outcome = applyHistoryEdits(log.setup, log.events, ops, { ids: ctx.ids, now: ctx.clock.now() });
  if (!outcome.ok) {
    throw failure('VALIDATION', outcome.message, {
      domainCode: outcome.code,
      detail: outcome.atSeq === null ? null : `The edit fails at seq ${outcome.atSeq}.`,
    });
  }
  return outcome;
}

async function editDetails(ctx: ServiceContext, repos: Repositories, log: MatchLog, outcome: EditSuccess): Promise<EditDetails> {
  const before: MatchSummary | null = summaryOf(log.setup, log.events, log.state);
  const after: MatchSummary | null = summaryOf(log.setup, outcome.events, outcome.after);
  const standingsChanged = !summariesAffectStandingsEqually(before, after);
  const impact = standingsChanged ? await matchResultImpact(ctx, repos, log.match, after) : null;
  const terminal = isTerminal(log.state) || isTerminal(outcome.after);
  return { impact, requiresReason: terminal || impact?.requiresReason === true, standingsChanged };
}

export function createHistoryEditOperations(ctx: ServiceContext): EditOperations {
  return {
    previewHistoryEdit(matchId, ops) {
      return attempt(MESSAGES.loadMatch, () =>
        inTransaction(ctx, async (repos): Promise<HistoryEditPreview> => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          assertEditable(log);
          const outcome = computeEdit(ctx, log, ops);
          const details = await editDetails(ctx, repos, log, outcome);
          return {
            outcome,
            baseFingerprint: logFingerprint(log.events),
            impact: details.impact,
            requiresReason: details.requiresReason,
          };
        }),
      );
    },

    applyHistoryEdit(matchId, ops, reason, expectedFingerprint) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          if (logFingerprint(log.events) !== expectedFingerprint) {
            throw failure('CONFLICT', 'This match changed since the preview. Review the change again before applying it.');
          }
          assertEditable(log);
          const outcome = computeEdit(ctx, log, ops);
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
          const corrected = isTerminal(log.state) && details.standingsChanged;
          await writeAudit(ctx, repos, {
            tournamentId: log.match.tournamentId,
            matchId,
            action: corrected ? 'result_corrected' : 'match_history_edited',
            entityType: 'match',
            entityId: matchId,
            summary: corrected ? `${log.match.title}: the result was corrected.` : `${log.match.title}: recorded balls were edited.`,
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

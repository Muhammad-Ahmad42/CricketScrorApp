import { buildEvents, redoAction, replayMatch, undoLastAction } from '@/domain/scoring';
import { canTransitionMatch } from '@/domain/tournament';
import type { ImpactSummary, MatchEndOutcome, MatchEvent, MatchEventInput, MatchId, Seq } from '@/domain/types';
import type { Repositories } from '@/db';
import type { LiveMatch, MatchService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { trimmedOrNull } from '../core/values';
import { assertMatchTournamentWritable } from '../tournament/matchEffects';
import { commitLog } from './commit';
import { matchResultImpact } from './impact';
import { appendPayloads, assertHealthy, assertTail, readMatchLog, type MatchLog } from './matchLog';
import { summaryOf } from './projection';
import { resultLine } from './resultText';

type ScoringOperations = Pick<MatchService, 'record' | 'undo' | 'redo' | 'endMatch'>;

const REASON_TO_REOPEN = 'Reopening a finished tournament match changes the standings. Add a reason to continue.';
const REASON_TO_CLOSE = 'Recording this tournament result changes the standings. Add a reason to continue.';
const REASON_TO_END = 'Add a reason for ending this tournament match this way.';

function endsMatch(events: readonly (MatchEvent | MatchEventInput)[]): boolean {
  return events.some((event) => event.kind === 'match_ended');
}

function endingOf(events: readonly MatchEvent[]): MatchEndOutcome | null {
  for (const event of events) {
    if (event.kind === 'match_ended') {
      return event.outcome;
    }
  }
  return null;
}

async function readWritableLog(repos: Repositories, matchId: MatchId, expectedLastSeq: Seq): Promise<MatchLog> {
  const log = await readMatchLog(repos, matchId);
  await assertMatchTournamentWritable(repos, log.match);
  assertTail(log, expectedLastSeq);
  return log;
}

async function auditResult(
  ctx: ServiceContext,
  repos: Repositories,
  log: MatchLog,
  live: LiveMatch,
  input: { readonly reason: string | null; readonly impactSummary: ImpactSummary | null; readonly redone: boolean },
): Promise<void> {
  await writeAudit(ctx, repos, {
    tournamentId: log.match.tournamentId,
    matchId: log.match.id,
    action: 'result_recorded',
    entityType: 'match',
    entityId: log.match.id,
    summary: `${log.match.title}: ${resultLine(live.setup, live.state)}${input.redone ? ' (redone)' : ''}`,
    previousValue: log.state.result,
    newValue: live.state.result,
    reason: input.reason,
    impact: input.impactSummary,
  });
}

export function createScoringOperations(ctx: ServiceContext): ScoringOperations {
  return {
    record(matchId, expectedLastSeq, payloads) {
      return attempt(MESSAGES.record, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readWritableLog(repos, matchId, expectedLastSeq);
          assertHealthy(log.state);
          const now = ctx.clock.now();
          const appended = appendPayloads(log.setup, log.state, payloads, { ids: ctx.ids, recordedAt: now });
          const events = [...log.events, ...appended.events];
          const ending = log.match.tournamentId === null ? null : endingOf(appended.events);
          const why = ending !== null && 'reason' in ending ? trimmedOrNull(ending.reason) : null;
          if (ending !== null && 'reason' in ending && why === null) {
            throw failure('CONFIRMATION_REQUIRED', REASON_TO_END);
          }
          const impact = ending === null ? null : await matchResultImpact(ctx, repos, log.match, summaryOf(log.setup, events, appended.state));
          await repos.events.append(appended.events);
          const committed = await commitLog(ctx, repos, {
            before: log,
            match: log.match,
            setup: log.setup,
            events,
            state: appended.state,
            now,
            appended: true,
            reason: why,
          });
          if (ending !== null) {
            await auditResult(ctx, repos, log, committed.live, { reason: why, impactSummary: impact, redone: false });
          }
          return { events: appended.events, state: appended.state, warnings: appended.warnings };
        }),
      );
    },

    undo(matchId, expectedLastSeq, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readWritableLog(repos, matchId, expectedLastSeq);
          const undone = undoLastAction(log.events);
          if (undone === null) {
            throw failure('VALIDATION', 'There is nothing to undo.');
          }
          const state = replayMatch(log.setup, undone.events);
          assertHealthy(state);
          const reopens = log.match.tournamentId !== null && endsMatch(undone.undone);
          const why = trimmedOrNull(reason);
          if (reopens && why === null) {
            throw failure('CONFIRMATION_REQUIRED', REASON_TO_REOPEN);
          }
          const impact = reopens ? await matchResultImpact(ctx, repos, log.match, summaryOf(log.setup, undone.events, state)) : null;
          await repos.events.truncateFrom(matchId, undone.undone[0].seq, expectedLastSeq);
          const now = ctx.clock.now();
          const committed = await commitLog(ctx, repos, {
            before: log,
            match: log.match,
            setup: log.setup,
            events: undone.events,
            state,
            now,
            appended: false,
            reason: why,
          });
          if (reopens) {
            await writeAudit(ctx, repos, {
              tournamentId: log.match.tournamentId,
              matchId,
              action: 'match_reopened',
              entityType: 'match',
              entityId: matchId,
              summary: `${log.match.title} was reopened.`,
              previousValue: log.state.result,
              newValue: { removedEvents: undone.undone },
              reason: why,
              impact,
            });
          }
          return { live: committed.live, undone: undone.undone };
        }),
      );
    },

    redo(matchId, expectedLastSeq, group, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readWritableLog(repos, matchId, expectedLastSeq);
          assertHealthy(log.state);
          const redone = redoAction(log.setup, log.events, group);
          if (!redone.ok) {
            throw redone.code === 'REDO_STALE'
              ? failure('CONFLICT', redone.message, { domainCode: redone.code })
              : failure('VALIDATION', redone.message, { domainCode: redone.code });
          }
          const closes = log.match.tournamentId !== null && endsMatch(group);
          const why = trimmedOrNull(reason);
          if (closes && why === null) {
            throw failure('CONFIRMATION_REQUIRED', REASON_TO_CLOSE);
          }
          const impact = closes ? await matchResultImpact(ctx, repos, log.match, summaryOf(log.setup, redone.events, redone.state)) : null;
          await repos.events.append(group);
          const committed = await commitLog(ctx, repos, {
            before: log,
            match: log.match,
            setup: log.setup,
            events: redone.events,
            state: redone.state,
            now: ctx.clock.now(),
            appended: true,
            reason: why,
          });
          if (closes) {
            await auditResult(ctx, repos, log, committed.live, { reason: why, impactSummary: impact, redone: true });
          }
          return committed.live;
        }),
      );
    },

    endMatch(matchId, expectedLastSeq, outcome: MatchEndOutcome, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readWritableLog(repos, matchId, expectedLastSeq);
          assertHealthy(log.state);
          const built = buildEvents(log.setup, log.state, { type: 'end_match', outcome });
          if (!built.ok) {
            throw failure('VALIDATION', built.message, { domainCode: built.code });
          }
          if (log.state.lifecycle === 'not_started') {
            const target = outcome.type === 'abandoned' ? 'abandoned' : 'completed';
            const guard = canTransitionMatch(log.match.status, target, { hasDeliveries: false });
            if (!guard.ok) {
              throw failure('FORBIDDEN_STATE', guard.reason);
            }
          }
          const tournament = log.match.tournamentId !== null;
          const why = trimmedOrNull(reason);
          if (tournament && outcome.type !== 'natural' && why === null) {
            throw failure('CONFIRMATION_REQUIRED', REASON_TO_END);
          }
          const now = ctx.clock.now();
          const appended = appendPayloads(log.setup, log.state, built.events, { ids: ctx.ids, recordedAt: now });
          const events = [...log.events, ...appended.events];
          const impact = tournament ? await matchResultImpact(ctx, repos, log.match, summaryOf(log.setup, events, appended.state)) : null;
          await repos.events.append(appended.events);
          const committed = await commitLog(ctx, repos, {
            before: log,
            match: log.match,
            setup: log.setup,
            events,
            state: appended.state,
            now,
            appended: true,
            reason: why,
          });
          if (tournament) {
            await auditResult(ctx, repos, log, committed.live, { reason: why, impactSummary: impact, redone: false });
          }
          return committed.live;
        }),
      );
    },
  };
}

import type { IsoDateTime, Match, MatchEvent, MatchSetup, MatchState, MatchStatus, MatchSummary, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import type { LiveMatch } from '../contracts';
import type { ServiceContext } from '../core/context';
import { deepEqual } from '../core/values';
import { applyMatchEffects } from '../tournament/matchEffects';
import { assertHealthy, type MatchLog } from './matchLog';
import { buildProjection, matchWithState, projectedStatus, summaryOf } from './projection';

export interface LogCommit {
  readonly before: MatchLog;
  readonly match: Match;
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
  readonly now: IsoDateTime;
  readonly appended: boolean;
  readonly stored?: { readonly status: MatchStatus; readonly summary: MatchSummary | null };
  readonly tournamentEffects?: boolean;
  readonly reason?: string | null;
}

const TERMINAL: readonly MatchStatus[] = ['completed', 'abandoned'];

export interface CommittedLog {
  readonly live: LiveMatch;
  readonly tournament: TournamentSnapshot | null;
  readonly summaryChanged: boolean;
  readonly statusChanged: boolean;
}

export async function commitLog(ctx: ServiceContext, repos: Repositories, commit: LogCommit): Promise<CommittedLog> {
  const { before, match, setup, events, state, now } = commit;
  assertHealthy(state);
  const projection = buildProjection({ match, setup, events, state, now });
  await repos.matches.writeProjection(projection);
  const dismissed = commit.appended && match.resumeDismissedAt !== null;
  if (dismissed) {
    await repos.matches.setResumeDismissed(match.id, null);
  }
  const previousSummary = commit.stored === undefined ? summaryOf(before.setup, before.events, before.state) : commit.stored.summary;
  const previousStatus = commit.stored === undefined ? projectedStatus(before.state, before.match.status) : commit.stored.status;
  const summaryChanged = !deepEqual(previousSummary, projection.summary);
  const statusChanged = previousStatus !== projection.status;
  const tournament =
    match.tournamentId !== null && commit.tournamentEffects !== false && (summaryChanged || statusChanged)
      ? await applyMatchEffects(ctx, repos, {
          tournamentId: match.tournamentId,
          matchId: match.id,
          fixtureId: match.fixtureId,
          matchStatus: projection.status,
          summaryChanged,
          reopened: TERMINAL.includes(previousStatus) && !TERMINAL.includes(projection.status),
          reason: commit.reason ?? null,
          now,
        })
      : null;
  const updated: Match = {
    ...matchWithState(match, events, state),
    updatedAt: now,
    resumeDismissedAt: dismissed ? null : match.resumeDismissedAt,
  };
  return { live: { match: updated, setup, events, state }, tournament, summaryChanged, statusChanged };
}

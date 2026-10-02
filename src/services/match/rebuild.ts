import { readMatchProjection, type Repositories, type SqlExecutor } from '@/db';
import type { MatchId, MatchState } from '@/domain/types';
import type { ServiceContext } from '../core/context';
import { commitLog } from './commit';
import { readMatchLog } from './matchLog';

export function repairMessage(state: MatchState): string | null {
  if (!state.needsRepair) {
    return null;
  }
  const issue = state.issues.find((entry) => entry.severity === 'error');
  return issue === undefined ? 'This match needs repair.' : `This match needs repair: ${issue.message}`;
}

export type RebuildOutcome = { readonly rebuilt: true } | { readonly rebuilt: false; readonly issue: string };

export async function rebuildProjection(
  ctx: ServiceContext,
  repos: Repositories,
  executor: SqlExecutor,
  matchId: MatchId,
  options: { readonly tournamentEffects?: boolean } = {},
): Promise<RebuildOutcome> {
  const log = await readMatchLog(repos, matchId);
  const issue = repairMessage(log.state);
  if (issue !== null) {
    return { rebuilt: false, issue };
  }
  const stored = await readMatchProjection(executor, matchId);
  await commitLog(ctx, repos, {
    before: log,
    match: log.match,
    setup: log.setup,
    events: log.events,
    state: log.state,
    now: ctx.clock.now(),
    appended: false,
    stored: stored === null ? undefined : { status: stored.status, summary: stored.summary },
    tournamentEffects: options.tournamentEffects,
  });
  return { rebuilt: true };
}

import { computeImpact } from '@/domain/tournament';
import type { ImpactSummary, Match, MatchSummary } from '@/domain/types';
import type { Repositories } from '@/db';
import type { ServiceContext } from '../core/context';
import { readSnapshot } from '../tournament/snapshots';

export async function matchResultImpact(
  ctx: ServiceContext,
  repos: Repositories,
  match: Match,
  summary: MatchSummary | null,
): Promise<ImpactSummary | null> {
  if (match.tournamentId === null) {
    return null;
  }
  const snapshot = await readSnapshot(ctx, repos, match.tournamentId);
  return computeImpact({ kind: 'match_result_change', matchId: match.id, summary }, snapshot, { ids: ctx.ids, now: ctx.clock.now() });
}

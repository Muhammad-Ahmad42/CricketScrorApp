/** @jest-environment node */
import type { MatchEvent } from '@/domain/types';
import { createRepositories } from '../repositories';
import type { MatchProjection } from '../repositories/contracts';
import { buildMatch, buildTeamSeed, isoAt, squadsFor } from '../testing/builders';
import { ball, goldenMatchEvents, goldenProjection, type GoldenMatchOptions } from '../testing/goldenMatch';
import { openTestRepositories } from '../testing/harness';
import { seedLibrary } from '../testing/tournamentScenario';

const BUDGET_MS = 10;
const ASSERTED_MS = BUDGET_MS * 3;
const SAMPLES = 50;

const lions = buildTeamSeed('lio', 'Lions', 'LIO');
const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');

const golden: GoldenMatchOptions = {
  matchId: 'm1',
  batFirst: { teamId: 'lio', playerIds: lions.players.map((p) => p.id) },
  bowlFirst: { teamId: 'tig', playerIds: tigers.players.map((p) => p.id) },
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function nextBall(seq: number): MatchEvent {
  const striker = lions.players[seq % 2].id;
  const nonStriker = lions.players[(seq + 1) % 2].id;
  return {
    ...ball(striker, nonStriker, tigers.players[6].id, { runs: seq % 3 }),
    id: `perf-${seq}`,
    matchId: 'm1',
    seq,
    actionId: `perf-a-${seq}`,
    recordedAt: isoAt(seq),
  };
}

function projectionAfter(base: MatchProjection, seq: number): MatchProjection {
  return {
    ...base,
    updatedAt: isoAt(seq),
    innings: base.innings.map((line, index) => (index === 1 ? { ...line, runs: seq, legalBalls: Math.min(seq, 18) } : line)),
  };
}

describe('performance (IT-DB-09)', () => {
  it(`appends a ball and rewrites the projection in one transaction within ${ASSERTED_MS} ms (median of ${SAMPLES}, budget ${BUDGET_MS} ms)`, async () => {
    const { db } = await openTestRepositories();
    await seedLibrary(db, [lions, tigers]);
    const opening = goldenMatchEvents(golden).slice(0, 23);
    await db.withTransactionAsync(async (tx) => {
      const repos = createRepositories(tx);
      await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', status: 'live' }), squadsFor(lions, tigers));
      await repos.events.append(opening);
    });
    const base = goldenProjection(golden, { projectionVersion: 1, teamAId: 'lio', at: isoAt(0), completed: false });
    const durations: number[] = [];
    for (let i = 0; i < SAMPLES + 5; i += 1) {
      const seq = opening.length + 1 + i;
      const started = performance.now();
      await db.withTransactionAsync(async (tx) => {
        const repos = createRepositories(tx);
        const lastSeq = await repos.events.lastSeq('m1');
        await repos.events.append([nextBall(lastSeq + 1)]);
        await repos.matches.writeProjection(projectionAfter(base, seq));
        await repos.matches.setResumeDismissed('m1', null);
      });
      if (i >= 5) {
        durations.push(performance.now() - started);
      }
    }
    const measured = median(durations);
    console.log(`IT-DB-09 append + projection write: median ${measured.toFixed(2)} ms over ${SAMPLES} samples (budget ${BUDGET_MS} ms, asserted ${ASSERTED_MS} ms)`);
    expect(measured).toBeLessThan(ASSERTED_MS);
    expect(await createRepositories(db).events.lastSeq('m1')).toBe(opening.length + SAMPLES + 5);
  });
});

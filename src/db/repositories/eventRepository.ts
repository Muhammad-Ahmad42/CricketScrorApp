import type { MatchEvent } from '@/domain/types';
import { InvalidRowsError, LogConflictError } from '../errors';
import { EVENT_COLUMNS, eventFromRow, eventToRecord, type EventRow } from '../mappers/event';
import type { SqlExecutor } from '../types';
import type { MatchEventRepository } from './contracts';
import { insertRow } from './sql';

function assertContiguous(events: readonly MatchEvent[], matchId: string, firstSeq: number): void {
  events.forEach((event, index) => {
    if (event.matchId !== matchId) {
      throw new InvalidRowsError(`Event ${event.id} belongs to match ${event.matchId}, not ${matchId}.`);
    }
    if (event.seq !== firstSeq + index) {
      throw new InvalidRowsError(`Event ${event.id} has seq ${event.seq}; expected ${firstSeq + index}.`);
    }
  });
}

async function readLastSeq(db: SqlExecutor, matchId: string): Promise<number> {
  const row = await db.getFirstAsync<{ readonly last_seq: number }>(
    'SELECT coalesce(max(seq), 0) AS last_seq FROM match_events WHERE match_id = ?',
    [matchId],
  );
  return row?.last_seq ?? 0;
}

async function insertEvents(db: SqlExecutor, events: readonly MatchEvent[]): Promise<void> {
  for (const event of events) {
    await insertRow(db, 'match_events', eventToRecord(event));
  }
}

export function createEventRepository(db: SqlExecutor): MatchEventRepository {
  return {
    async listByMatch(matchId) {
      const rows = await db.getAllAsync<EventRow>(`SELECT ${EVENT_COLUMNS} FROM match_events WHERE match_id = ? ORDER BY seq`, [
        matchId,
      ]);
      return rows.map(eventFromRow);
    },
    lastSeq(matchId) {
      return readLastSeq(db, matchId);
    },
    async append(events) {
      if (events.length === 0) {
        return;
      }
      const matchId = events[0].matchId;
      assertContiguous(events, matchId, events[0].seq);
      const lastSeq = await readLastSeq(db, matchId);
      if (events[0].seq > lastSeq + 1) {
        throw new LogConflictError(matchId, events[0].seq - 1, lastSeq, `appending seq ${events[0].seq} after ${lastSeq}`);
      }
      await insertEvents(db, events);
    },
    async truncateFrom(matchId, fromSeq, expectedLastSeq) {
      const lastSeq = await readLastSeq(db, matchId);
      if (lastSeq !== expectedLastSeq) {
        throw new LogConflictError(matchId, expectedLastSeq, lastSeq, `tail is ${lastSeq}, expected ${expectedLastSeq}`);
      }
      const expectedCount = expectedLastSeq - fromSeq + 1;
      const existing = await db.getFirstAsync<{ readonly n: number }>(
        'SELECT count(*) AS n FROM match_events WHERE match_id = ? AND seq >= ?',
        [matchId, fromSeq],
      );
      if ((existing?.n ?? 0) !== expectedCount) {
        throw new LogConflictError(
          matchId,
          expectedLastSeq,
          lastSeq,
          `${existing?.n ?? 0} events from seq ${fromSeq}, expected ${expectedCount}`,
        );
      }
      const deleted = await db.runAsync('DELETE FROM match_events WHERE match_id = ? AND seq >= ?', [matchId, fromSeq]);
      if (deleted.changes !== expectedCount) {
        throw new LogConflictError(matchId, expectedLastSeq, lastSeq, `deleted ${deleted.changes}, expected ${expectedCount}`);
      }
      return deleted.changes;
    },
    async replaceAll(matchId, events) {
      assertContiguous(events, matchId, 1);
      await db.runAsync('DELETE FROM match_events WHERE match_id = ?', [matchId]);
      await insertEvents(db, events);
    },
  };
}

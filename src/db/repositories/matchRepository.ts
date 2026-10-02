import type { MatchRules, MatchSetup, MatchTeam, TossDecision } from '@/domain/types';
import { SquadPlayerInUseError, sqliteErrorKind } from '../errors';
import {
  matchColumns,
  matchConfigRecord,
  matchFromRow,
  matchPlayerFromRow,
  matchToRecord,
  squadEntryToRecord,
  type MatchPlayerDetailRow,
  type MatchRow,
} from '../mappers/match';
import { parseJson } from '../mappers/values';
import type { SqlExecutor } from '../types';
import type { MatchRepository } from './contracts';
import { findResumableMatches, listMatches } from './matchQueries';
import { writeMatchProjection } from './matchProjection';
import { execute, insertRow, updateStatement } from './sql';

interface SetupRow {
  readonly id: string;
  readonly rules_json: string;
  readonly team_a_players: number | null;
  readonly team_b_players: number | null;
  readonly toss_winner_team_id: string | null;
  readonly toss_decision: TossDecision | null;
  readonly team_a_id: string;
  readonly team_a_name: string;
  readonly team_a_short: string;
  readonly team_b_id: string;
  readonly team_b_name: string;
  readonly team_b_short: string;
}

const SETUP_SQL = `SELECT m.id, m.rules_json, m.team_a_players, m.team_b_players, m.toss_winner_team_id, m.toss_decision,
  ta.id AS team_a_id, ta.name AS team_a_name, ta.short_name AS team_a_short,
  tb.id AS team_b_id, tb.name AS team_b_name, tb.short_name AS team_b_short
FROM matches m
JOIN teams ta ON ta.id = m.team_a_id
JOIN teams tb ON tb.id = m.team_b_id
WHERE m.id = ?`;

const SQUAD_SQL = `SELECT mp.match_id, mp.player_id, mp.team_id, mp.batting_order, mp.is_captain, mp.is_wicket_keeper,
  mp.is_substitute, p.name, p.jersey_number, p.role
FROM match_players mp
JOIN players p ON p.id = mp.player_id
JOIN matches m ON m.id = mp.match_id
WHERE mp.match_id = ?
ORDER BY CASE WHEN mp.team_id = m.team_a_id THEN 0 ELSE 1 END, mp.is_substitute, mp.batting_order IS NULL,
  mp.batting_order, p.name COLLATE NOCASE, mp.player_id`;

const PAYLOAD_ARRAY_USE_SQL = `SELECT 1 AS used FROM match_events e
WHERE e.match_id = ? AND e.payload_json IS NOT NULL AND (
  EXISTS (SELECT 1 FROM json_each(e.payload_json, '$.absentees') a WHERE json_extract(a.value, '$.playerId') = ?)
  OR EXISTS (SELECT 1 FROM json_each(e.payload_json, '$.fielderIds') f WHERE f.value = ?)
)
LIMIT 1`;

function matchTeam(id: string, name: string, shortName: string, players: number | null, rules: MatchRules): MatchTeam {
  return { id, name, shortName, playersInSide: players ?? rules.playersPerSide };
}

const SUPERSEDED_SQL =
  'SELECT EXISTS (SELECT 1 FROM matches m JOIN fixtures f ON f.id = m.fixture_id AND f.tournament_id = m.tournament_id ' +
  'WHERE m.id = ? AND f.match_id IS NOT m.id) AS superseded';

export function createMatchRepository(db: SqlExecutor): MatchRepository {
  return {
    async get(id) {
      const row = await db.getFirstAsync<MatchRow>(`SELECT ${matchColumns('m')} FROM matches m WHERE m.id = ?`, [id]);
      return row === null ? null : matchFromRow(row);
    },
    async isSuperseded(id) {
      const row = await db.getFirstAsync<{ readonly superseded: number }>(SUPERSEDED_SQL, [id]);
      return row !== null && row.superseded === 1;
    },
    async getSetup(id): Promise<MatchSetup | null> {
      const row = await db.getFirstAsync<SetupRow>(SETUP_SQL, [id]);
      if (row === null) {
        return null;
      }
      const rules = parseJson<MatchRules>(row.rules_json);
      const players = await db.getAllAsync<MatchPlayerDetailRow>(SQUAD_SQL, [id]);
      const toss =
        row.toss_winner_team_id !== null && row.toss_decision !== null
          ? { winnerTeamId: row.toss_winner_team_id, decision: row.toss_decision }
          : null;
      return {
        matchId: row.id,
        rules,
        teams: [
          matchTeam(row.team_a_id, row.team_a_name, row.team_a_short, row.team_a_players, rules),
          matchTeam(row.team_b_id, row.team_b_name, row.team_b_short, row.team_b_players, rules),
        ],
        players: players.map(matchPlayerFromRow),
        toss,
      };
    },
    async insert(match, squads) {
      await insertRow(db, 'matches', matchToRecord(match));
      for (const squad of squads) {
        for (const entry of squad.players) {
          await insertRow(db, 'match_players', squadEntryToRecord(match.id, squad.teamId, entry));
        }
      }
    },
    async update(match) {
      await execute(db, updateStatement('matches', matchConfigRecord(match), 'id = ?', [match.id]));
      await db.runAsync(
        'UPDATE matches SET status = ? WHERE id = ? AND status <> ? AND NOT EXISTS (SELECT 1 FROM match_events WHERE match_id = ?)',
        [match.status, match.id, match.status, match.id],
      );
    },
    async addSquadPlayer(matchId, teamId, entry) {
      await insertRow(db, 'match_players', squadEntryToRecord(matchId, teamId, entry));
    },
    async removeSquadPlayer(matchId, playerId) {
      const used = await db.getFirstAsync<{ readonly used: number }>(PAYLOAD_ARRAY_USE_SQL, [matchId, playerId, playerId]);
      if (used !== null) {
        throw new SquadPlayerInUseError(matchId, playerId);
      }
      try {
        await db.runAsync('DELETE FROM match_players WHERE match_id = ? AND player_id = ?', [matchId, playerId]);
      } catch (error) {
        if (sqliteErrorKind(error) === 'foreign_key') {
          throw new SquadPlayerInUseError(matchId, playerId);
        }
        throw error;
      }
    },
    list(query) {
      return listMatches(db, query);
    },
    findResumable(opts = {}) {
      return findResumableMatches(db, opts.forPrompt ?? false);
    },
    async setResumeDismissed(matchId, at) {
      await db.runAsync('UPDATE matches SET resume_dismissed_at = ? WHERE id = ?', [at, matchId]);
    },
    async listStaleProjections(version) {
      const rows = await db.getAllAsync<{ readonly id: string }>(
        'SELECT m.id FROM matches m WHERE m.projection_version < ? ' +
          'AND EXISTS (SELECT 1 FROM match_events e WHERE e.match_id = m.id) ORDER BY m.created_at, m.rowid',
        [version],
      );
      return rows.map((row) => row.id);
    },
    writeProjection(projection) {
      return writeMatchProjection(db, projection);
    },
    async delete(id) {
      await db.runAsync('DELETE FROM matches WHERE id = ?', [id]);
    },
  };
}

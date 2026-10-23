/** @jest-environment node */
import {
  BASE_MATCH_RULES,
  formatBowlingFigures,
  legBye,
  noBall,
  scoreRuns,
  SCORING_PROJECTION_VERSION,
  selectBowler,
  validateLog,
  wicket,
  wide,
} from '@/domain/scoring';
import { M3_RULES } from '@/domain/scoring/testing';
import { foreignKeyCheck, LATEST_SCHEMA_VERSION } from '@/db';
import type { DeliveryPayload, MatchEvent, MatchRules, MatchState, NewMatchInput, Venue } from '@/domain/types';
import type { HistoryEditOp } from '@/domain/scoring';
import { coldRestart, expectFailure, expectOk, openHarness, rowCount, warmRestart, type Harness } from './support/app';
import { live, score, scoreAll } from './support/scoring';
import { createSide, LION_NAMES, squadOf, TIGER_NAMES, type Side } from './support/sides';

const M3: MatchRules = { ...BASE_MATCH_RULES, ...M3_RULES };

let harness: Harness;
let lions: Side;
let tigers: Side;
let venue: Venue;
let matchId: string;
let stateAfterOver1: MatchState;
let stateAfterWicket: MatchState;
let stateBeforeColdRestart: MatchState;
let undone: readonly MatchEvent[];
let editOps: readonly HistoryEditOp[];

function input(): NewMatchInput {
  return {
    title: 'Lions v Tigers',
    teamAId: lions.team.id,
    teamBId: tigers.team.id,
    venueId: venue.id,
    scheduledDate: '2026-05-01',
    scheduledTime: null,
    formatId: 'custom',
    rules: M3,
    squads: [
      { teamId: lions.team.id, players: squadOf(lions, { substitutes: [12], keeper: 6 }) },
      { teamId: tigers.team.id, players: squadOf(tigers, { substitutes: [12], keeper: 1 }) },
    ],
    toss: { winnerTeamId: lions.team.id, decision: 'bat' },
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
  };
}

async function inningsRows(): Promise<readonly { runs: number; wickets: number; legal_balls: number; status: string; completion_reason: string | null; extras_json: string }[]> {
  return harness.db.getAllAsync('SELECT runs, wickets, legal_balls, status, completion_reason, extras_json FROM innings WHERE match_id = ? ORDER BY innings_index', [matchId]);
}

async function matchRow(): Promise<{ status: string; result_json: string | null; summary_json: string | null; winner_team_id: string | null; completed_at: string | null; updated_at: string; resume_dismissed_at: string | null; projection_version: number }> {
  const row = await harness.db.getFirstAsync<{
    status: string;
    result_json: string | null;
    summary_json: string | null;
    winner_team_id: string | null;
    completed_at: string | null;
    updated_at: string;
    resume_dismissed_at: string | null;
    projection_version: number;
  }>('SELECT status, result_json, summary_json, winner_team_id, completed_at, updated_at, resume_dismissed_at, projection_version FROM matches WHERE id = ?', [matchId]);
  if (row === null) {
    throw new Error('match missing');
  }
  return row;
}

function bowledDelivery(events: readonly MatchEvent[]): MatchEvent & DeliveryPayload {
  const found = events.find((event): event is MatchEvent & DeliveryPayload => event.kind === 'delivery' && event.wicket?.type === 'bowled');
  if (found === undefined) {
    throw new Error('bowled delivery missing');
  }
  return found;
}

function lbwOps(events: readonly MatchEvent[]): readonly HistoryEditOp[] {
  const bowled = bowledDelivery(events);
  if (bowled.wicket === null || bowled.call === 'wide') {
    throw new Error('unexpected delivery');
  }
  const replacement: DeliveryPayload = {
    kind: 'delivery',
    strikerId: bowled.strikerId,
    nonStrikerId: bowled.nonStrikerId,
    bowlerId: bowled.bowlerId,
    runsRun: 0,
    shortRuns: 0,
    boundary: 0,
    call: 'fair',
    runsTo: 'bat',
    wicket: { ...bowled.wicket, type: 'lbw' },
  };
  return [{ op: 'replace', seq: bowled.seq, with: [replacement] }];
}

describe('IT-M standalone match lifecycle (§91)', () => {
  it('IT-M-01 bootstraps a fresh database to the latest schema', async () => {
    harness = await openHarness();
    const report = expectOk(await harness.app.bootstrap());
    expect(report).toEqual({
      schemaVersion: LATEST_SCHEMA_VERSION,
      resumable: [],
      projectionsRebuilt: 0,
      integrityIssues: [],
      pragmas: { foreignKeys: 1, journalMode: expect.any(String), synchronous: expect.any(Number) },
    });
    expect(await rowCount(harness.db, 'schema_migrations')).toBe(1);
    expect(await harness.db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  });

  it('IT-M-02 creates the team library and a venue', async () => {
    lions = await createSide(harness.app, 'Lions', 'LIO', LION_NAMES);
    tigers = await createSide(harness.app, 'Tigers', 'TIG', TIGER_NAMES);
    venue = expectOk(await harness.app.teams.createVenue({ name: 'Gaddafi Stadium', location: 'Lahore' }));
    expect(await rowCount(harness.db, 'teams')).toBe(2);
    expect(await rowCount(harness.db, 'players')).toBe(24);
    expect(await rowCount(harness.db, 'venues')).toBe(1);
  });

  it('IT-M-03 creates the match, squads and opening event in one transaction', async () => {
    const created = expectOk(
      await harness.app.matches.createMatch(input(), [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: lions.team.id, strikerId: lions.p(1), nonStrikerId: lions.p(2), bowlerId: tigers.p(7) },
      ]),
    );
    matchId = created.match.id;
    expect(created.state.lifecycle).toBe('live');
    expect(created.state.lastSeq).toBe(1);
    const row = await matchRow();
    expect(row.status).toBe('live');
    expect(row.projection_version).toBe(SCORING_PROJECTION_VERSION);
    expect(row.result_json).toBeNull();
    expect(await rowCount(harness.db, 'match_players')).toBe(24);
    expect(await rowCount(harness.db, 'match_players', 'is_substitute = 1')).toBe(2);
    const event = await harness.db.getFirstAsync<{ seq: number; kind: string; p_striker_id: string }>('SELECT seq, kind, p_striker_id FROM match_events WHERE match_id = ?', [matchId]);
    expect(event).toEqual({ seq: 1, kind: 'innings_started', p_striker_id: lions.p(1) });
    const innings = await inningsRows();
    expect(innings).toHaveLength(1);
    expect(innings[0]).toMatchObject({ runs: 0, wickets: 0, legal_balls: 0, status: 'in_progress' });
  });

  it('IT-M-04 scores the first over, one transaction per ball', async () => {
    stateAfterOver1 = await scoreAll(harness.app, matchId, [scoreRuns(1), scoreRuns(4), wide(), scoreRuns(0), scoreRuns(2), scoreRuns(6), scoreRuns(1)]);
    expect(await rowCount(harness.db, 'match_events', 'match_id = ?', [matchId])).toBe(8);
    const innings = await inningsRows();
    expect(innings[0]).toMatchObject({ runs: 15, wickets: 0, legal_balls: 6 });
    expect(JSON.parse(innings[0].extras_json)).toMatchObject({ wides: 1 });
    expect(stateAfterOver1.pendingAction?.type).toBe('select_next_bowler');
    const t7 = stateAfterOver1.innings[0].bowling.find((row) => row.playerId === tigers.p(7));
    expect(t7 === undefined ? null : formatBowlingFigures(t7, 6)).toBe('1-0-15-0');
    const actions = await harness.db.getAllAsync<{ action_id: string }>("SELECT DISTINCT action_id FROM match_events WHERE match_id = ? AND kind = 'delivery'", [matchId]);
    expect(actions).toHaveLength(7);
  });

  it('IT-M-05 resumes identically after a warm restart', async () => {
    const restarted = await warmRestart(harness);
    harness = restarted;
    expect(restarted.report.resumable.map((item) => item.id)).toEqual([matchId]);
    expect(restarted.report.resumable[0].innings[0]).toMatchObject({ runs: 15, wickets: 0, legalBalls: 6 });
    const loaded = await live(harness.app, matchId);
    expect(loaded.state).toEqual(stateAfterOver1);
    expect(loaded.state.lastSeq).toBe(8);
  });

  it('IT-M-06 records a wicket and the incoming batter as one action', async () => {
    await score(harness.app, matchId, selectBowler(tigers.p(8)));
    await score(harness.app, matchId, scoreRuns(0));
    stateAfterWicket = await score(harness.app, matchId, wicket({ dismissal: 'bowled', nextBatterId: lions.p(3) }));
    const tail = await harness.db.getAllAsync<{ action_id: string; kind: string; p_player_id: string | null }>(
      'SELECT action_id, kind, p_player_id FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT 2',
      [matchId],
    );
    expect(tail[0].action_id).toBe(tail[1].action_id);
    expect(tail[0]).toMatchObject({ kind: 'batter_in', p_player_id: lions.p(3) });
    expect(stateAfterWicket.innings[0]).toMatchObject({ runs: 15, wickets: 1, strikerId: lions.p(3) });
  });

  it('IT-M-07 undoes the whole action group', async () => {
    const result = expectOk(await harness.app.matches.undo(matchId, stateAfterWicket.lastSeq));
    undone = result.undone;
    expect(undone).toHaveLength(2);
    expect(await rowCount(harness.db, 'match_events', 'match_id = ?', [matchId])).toBe(10);
    expect((await inningsRows())[0]).toMatchObject({ runs: 15, wickets: 0 });
    expect(result.live.state.innings[0].strikerId).toBe(lions.p(2));
  });

  it('IT-M-08 redoes the same events', async () => {
    const before = await live(harness.app, matchId);
    const redone = expectOk(await harness.app.matches.redo(matchId, before.state.lastSeq, undone));
    expect(redone.events.slice(-2)).toEqual(undone);
    expect(redone.state).toEqual(stateAfterWicket);
  });

  it('IT-M-09 refuses a stale writer with CONFLICT', async () => {
    const before = await live(harness.app, matchId);
    const rowBefore = await matchRow();
    const result = await harness.app.matches.record(matchId, before.state.lastSeq - 1, [
      {
        kind: 'delivery',
        strikerId: lions.p(3),
        nonStrikerId: lions.p(1),
        bowlerId: tigers.p(8),
        runsRun: 0,
        shortRuns: 0,
        boundary: 0,
        wicket: null,
        call: 'fair',
        runsTo: 'bat',
      },
    ]);
    expectFailure(result, 'CONFLICT');
    expect(await rowCount(harness.db, 'match_events', 'match_id = ?', [matchId])).toBe(12);
    expect((await matchRow()).updated_at).toBe(rowBefore.updated_at);
  });

  it('IT-M-10 completes the first innings', async () => {
    await scoreAll(harness.app, matchId, [scoreRuns(1), noBall({ runsRun: 1 }), scoreRuns(0), legBye(1), scoreRuns(2)]);
    await score(harness.app, matchId, selectBowler(tigers.p(7)));
    const state = await scoreAll(harness.app, matchId, Array.from({ length: 6 }, () => scoreRuns(1)));
    expect(state.innings[0]).toMatchObject({ runs: 27, wickets: 1, legalBalls: 18, status: 'complete' });
    const innings = await inningsRows();
    expect(innings[0]).toMatchObject({ status: 'complete', completion_reason: 'overs_complete' });
    const partnerships = await harness.db.getAllAsync<{ runs: number; balls: number }>(
      'SELECT runs, balls FROM partnerships WHERE match_id = ? ORDER BY innings_index, partnership_index',
      [matchId],
    );
    expect(partnerships).toEqual([
      { runs: 15, balls: 8 },
      { runs: 12, balls: 10 },
    ]);
    expect(state.pendingAction).toMatchObject({ type: 'start_next_innings', inningsIndex: 1 });
    stateBeforeColdRestart = state;
  });

  it('IT-M-11 survives a cold restart with the pending action intact', async () => {
    const restarted = await coldRestart(harness);
    harness = restarted;
    expect(restarted.report.resumable.map((item) => item.id)).toEqual([matchId]);
    expect((await live(harness.app, matchId)).state).toEqual(stateBeforeColdRestart);
    expect(expectOk(await harness.app.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual([matchId]);
  });

  it('IT-M-12 SAVE & EXIT hides the match from the startup prompt only', async () => {
    expectOk(await harness.app.matches.dismissResume(matchId));
    expect((await matchRow()).resume_dismissed_at).not.toBeNull();
    expect(expectOk(await harness.app.matches.findResumable({ forPrompt: true }))).toEqual([]);
    expect(expectOk(await harness.app.matches.findResumable()).map((item) => item.id)).toEqual([matchId]);
    const restarted = await warmRestart(harness);
    harness = restarted;
    expect(restarted.report.resumable).toEqual([]);
  });

  it('IT-M-13 the next event clears SAVE & EXIT', async () => {
    const state = await score(harness.app, matchId, {
      type: 'start_innings',
      strikerId: tigers.p(1),
      nonStrikerId: tigers.p(2),
      bowlerId: lions.p(10),
      battingTeamId: tigers.team.id,
    });
    expect((await matchRow()).resume_dismissed_at).toBeNull();
    expect(expectOk(await harness.app.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual([matchId]);
    expect(await inningsRows()).toHaveLength(2);
    expect(state.chase).toMatchObject({ target: 28, runsRequired: 28, ballsRemaining: 18 });
  });

  it('IT-M-14 scores the first chase over', async () => {
    const state = await scoreAll(harness.app, matchId, [scoreRuns(4), scoreRuns(4), scoreRuns(1), scoreRuns(1), scoreRuns(2), scoreRuns(6)]);
    expect(state.innings[1]).toMatchObject({ runs: 18, wickets: 0 });
    expect(state.chase).toEqual({ target: 28, runsRequired: 10, ballsRemaining: 12, requiredRunRate: 5 });
  });

  it('IT-M-15 reaches the target but waits for confirmation before writing the result', async () => {
    await score(harness.app, matchId, selectBowler(lions.p(11)));
    await scoreAll(harness.app, matchId, [scoreRuns(1), scoreRuns(0)]);
    await score(harness.app, matchId, wicket({ dismissal: 'caught', fielderIds: [lions.p(7)], nextBatterId: tigers.p(3) }));
    await scoreAll(harness.app, matchId, [scoreRuns(2), scoreRuns(1), scoreRuns(4)]);
    await score(harness.app, matchId, selectBowler(lions.p(10)));
    const state = await scoreAll(harness.app, matchId, [scoreRuns(1), scoreRuns(1)]);
    expect(state.innings[1]).toMatchObject({ runs: 28, wickets: 1, legalBalls: 14 });
    expect(state.pendingAction).toEqual(expect.objectContaining({ type: 'confirm_result', text: 'Tigers won by 9 wickets (4 balls left)' }));
    const row = await matchRow();
    expect(row.status).toBe('live');
    expect(row.result_json).toBeNull();
    expect(row.summary_json).toBeNull();
  });

  it('IT-M-16 undo and redo around the winning run', async () => {
    const before = await live(harness.app, matchId);
    const undoneRun = expectOk(await harness.app.matches.undo(matchId, before.state.lastSeq));
    expect(undoneRun.live.state.pendingAction).toBeNull();
    expect(undoneRun.live.state.chase).toMatchObject({ runsRequired: 1, ballsRemaining: 5 });
    const redone = expectOk(await harness.app.matches.redo(matchId, undoneRun.live.state.lastSeq, undoneRun.undone));
    expect(redone.state.pendingAction?.type).toBe('confirm_result');
  });

  it('IT-M-17 confirms the result and writes the projections', async () => {
    const before = await live(harness.app, matchId);
    expectOk(await harness.app.matches.record(matchId, before.state.lastSeq, [{ kind: 'match_ended', outcome: { type: 'natural' } }]));
    const row = await matchRow();
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.result_json ?? 'null')).toMatchObject({
      type: 'win',
      winnerTeamId: tigers.team.id,
      margin: { kind: 'wickets', wickets: 9, ballsRemaining: 4 },
    });
    expect(row.winner_team_id).toBe(tigers.team.id);
    expect(row.completed_at).not.toBeNull();
    const summary = JSON.parse(row.summary_json ?? 'null');
    expect(summary).toMatchObject({ summaryVersion: 2, status: 'completed', winnerTeamId: tigers.team.id, ballsPerOver: 6, superOvers: [] });
    expect(summary.innings[0]).toMatchObject({ runs: 27, wickets: 1, legalBalls: 18, allottedBalls: 18, allOut: false, completion: 'overs_complete', extras: 3, fours: 1, sixes: 1 });
    expect(summary.innings[1]).toMatchObject({ runs: 28, wickets: 1, legalBalls: 14, completion: 'target_reached', target: 28, targetRevised: false });
    expect(summary.squads.flatMap((squad: { playerIds: string[] }) => squad.playerIds)).not.toContain(lions.p(12));
    expect(expectOk(await harness.app.matches.findResumable())).toEqual([]);
    expect(await rowCount(harness.db, 'audit_events')).toBe(0);
  });

  it('IT-M-18 exports the scorecard HTML with escaped names', async () => {
    const team = expectOk(await harness.app.teams.get(lions.team.id)).team;
    expectOk(await harness.app.teams.update({ ...team, name: 'Lions & <Co>' }));
    const pdf = expectOk(await harness.app.export.scorecardPdf(matchId));
    expect(pdf.fileUri).toBe('file:///cache/exports/scorecard-lions-v-tigers-2026-05-01.pdf');
    const html = harness.app.deps.printer.printed[harness.app.deps.printer.printed.length - 1];
    expect(html).toContain('Tigers won by 9 wickets (4 balls left)');
    expect(html).toContain('b Shaheen');
    expect(html).toContain('c Amir b Abdul');
    expect(html).toContain('Gaddafi Stadium');
    expect(html).toContain('Tigers');
    expect(html).toContain('Lions &amp; &lt;Co&gt;');
    expect(html).not.toContain('Lions & <Co>');
    expectOk(await harness.app.teams.update({ ...team, name: 'Lions' }));
  });

  it('IT-M-19 shows the completed match in history after a cold restart', async () => {
    const restarted = await coldRestart(harness);
    harness = restarted;
    expect(restarted.report.resumable).toEqual([]);
    const [item] = expectOk(await harness.app.matches.list({ sort: 'recent' }));
    expect(item.status).toBe('completed');
    expect(item.innings.map((line) => [line.runs, line.wickets, line.legalBalls])).toEqual([
      [27, 1, 18],
      [28, 1, 14],
    ]);
    expect(item.result).toMatchObject({ type: 'win', winnerTeamId: tigers.team.id });
  });

  it('IT-M-20 previews a historical edit of a completed match', async () => {
    const loaded = await live(harness.app, matchId);
    editOps = lbwOps(loaded.events);
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, editOps));
    expect(preview.requiresReason).toBe(true);
    expect(preview.impact).toBeNull();
    expect(preview.baseFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(preview.outcome.resultChanged).toBe(false);
  });

  it('IT-M-21 refuses to apply without a reason', async () => {
    const loaded = await live(harness.app, matchId);
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, editOps));
    expectFailure(await harness.app.matches.applyHistoryEdit(matchId, editOps, null, preview.baseFingerprint), 'CONFIRMATION_REQUIRED');
    expect((await live(harness.app, matchId)).events).toEqual(loaded.events);
  });

  it('IT-M-22 refuses a stale fingerprint, then applies after a new preview', async () => {
    const stale = expectOk(await harness.app.matches.previewHistoryEdit(matchId, editOps)).baseFingerprint;
    const loaded = await live(harness.app, matchId);
    const reopened = expectOk(await harness.app.matches.undo(matchId, loaded.state.lastSeq));
    expect(reopened.live.state.lifecycle).toBe('live');
    expectFailure(await harness.app.matches.applyHistoryEdit(matchId, editOps, 'Umpire signal misread', stale), 'CONFLICT');
    expectOk(await harness.app.matches.redo(matchId, reopened.live.state.lastSeq, reopened.undone));
    const fresh = expectOk(await harness.app.matches.previewHistoryEdit(matchId, editOps));
    const applied = expectOk(await harness.app.matches.applyHistoryEdit(matchId, editOps, 'Umpire signal misread', fresh.baseFingerprint));
    expect(applied.state.lifecycle).toBe('completed');
  });

  it('IT-M-23 audits the edit with the removed and inserted events', async () => {
    const rows = await harness.db.getAllAsync<{ action: string; tournament_id: string | null; match_id: string | null; previous_json: string; new_json: string; reason: string }>(
      'SELECT action, tournament_id, match_id, previous_json, new_json, reason FROM audit_events',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'match_history_edited', tournament_id: null, match_id: matchId, reason: 'Umpire signal misread' });
    const previous = JSON.parse(rows[0].previous_json);
    const inserted = JSON.parse(rows[0].new_json);
    expect(previous).toHaveLength(1);
    expect(previous[0].wicket.type).toBe('bowled');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].wicket.type).toBe('lbw');
    const loaded = await live(harness.app, matchId);
    expect(loaded.state.innings[0].batting.find((row) => row.playerId === lions.p(2))?.dismissalText).toBe('lbw b Shaheen');
    expect(JSON.parse((await matchRow()).summary_json ?? 'null').innings[0].batting.find((line: { playerId: string }) => line.playerId === lions.p(2)).dismissalType).toBe('lbw');
  });

  it('IT-M-24 previews an edit that breaks the confirmed result as reopening the match, saving nothing', async () => {
    const loaded = await live(harness.app, matchId);
    const chaseStart = loaded.events.find((event) => event.kind === 'innings_started' && event.inningsIndex === 1)?.seq ?? 0;
    const two = [...loaded.events]
      .reverse()
      .find((event) => event.seq < chaseStart && event.kind === 'delivery' && event.call === 'fair' && event.runsRun === 2 && event.boundary === 0);
    if (two === undefined || two.kind !== 'delivery' || two.call === 'wide') {
      throw new Error('two missing');
    }
    const ops: readonly HistoryEditOp[] = [{ op: 'replace', seq: two.seq, with: [{ ...stripEnvelope(two), runsRun: 3 }] }];
    const preview = expectOk(await harness.app.matches.previewHistoryEdit(matchId, ops));
    expect(preview.resolutions?.map((resolution) => resolution.kind)).toEqual(['reopen_match']);
    expect(preview.ops).toEqual([...ops, { op: 'delete', seq: loaded.events[loaded.events.length - 1].seq }]);
    expect(preview.outcome.after.lifecycle).toBe('live');
    expect(preview.consequences?.reopensMatch).toBe(true);
    expect(preview.requiresReason).toBe(true);
    expect((await live(harness.app, matchId)).events).toEqual(loaded.events);
  });

  it('IT-M-25 discards an unfinished second match completely', async () => {
    const second = expectOk(
      await harness.app.matches.createMatch(input(), [
        { kind: 'innings_started', inningsIndex: 0, battingTeamId: lions.team.id, strikerId: lions.p(1), nonStrikerId: lions.p(2), bowlerId: tigers.p(7) },
      ]),
    );
    await scoreAll(harness.app, second.match.id, [scoreRuns(1), scoreRuns(2), scoreRuns(0)]);
    expectOk(await harness.app.matches.discard(second.match.id));
    for (const table of ['matches', 'match_players', 'match_events', 'innings', 'partnerships']) {
      const column = table === 'matches' ? 'id' : 'match_id';
      expect(await rowCount(harness.db, table, `${column} = ?`, [second.match.id])).toBe(0);
    }
    expect((await live(harness.app, matchId)).state.lifecycle).toBe('completed');
  });

  it('IT-M-26 leaves a consistent database', async () => {
    expect(await foreignKeyCheck(harness.db)).toEqual([]);
    for (const item of expectOk(await harness.app.matches.list({}))) {
      const loaded = await live(harness.app, item.id);
      expect(validateLog(loaded.setup, loaded.events).ok).toBe(true);
    }
  });
});

function stripEnvelope(event: MatchEvent & DeliveryPayload): DeliveryPayload {
  const { id: _id, matchId: _match, seq: _seq, actionId: _action, recordedAt: _recorded, ...payload } = event;
  return payload;
}

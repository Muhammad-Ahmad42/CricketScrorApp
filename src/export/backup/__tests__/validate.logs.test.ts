/** @jest-environment node */
import { validateLog } from '@/domain/scoring';
import type { BackupData, MatchEvent, MatchSetup, ReplayIssue } from '@/domain/types';
import { engineLogChecker, matchLogJobs, type MatchLogChecker } from '../validation/eventLogs';
import { IDS, LIONS_SUB, tournamentBackup } from './fixtures/backupData';
import { deepFreeze, engineReady } from './support/freeze';
import { codes, exportText, previewText, validateText } from './support/files';

function onlyMatch1(data: BackupData): BackupData {
  return {
    ...data,
    matches: data.matches.filter((row) => row.id === IDS.match1),
    matchPlayers: data.matchPlayers.filter((row) => row.matchId === IDS.match1),
    matchEvents: data.matchEvents.filter((row) => row.matchId === IDS.match1),
  };
}

function issue(event: MatchEvent, message: string): ReplayIssue {
  return { seq: event.seq, eventId: event.id, severity: 'error', code: 'PLAYER_NOT_IN_SQUAD', message };
}

describe('event logs (stage 9)', () => {
  it('FR-04k rejects a log with a gap and names the match', () => {
    const data = tournamentBackup();
    const text = exportText({ ...data, matchEvents: data.matchEvents.filter((event) => event.id !== `${IDS.match1}-e3`) });
    const preview = previewText(text);
    const found = preview.issues.filter((entry) => entry.code === 'INVALID_EVENT_LOG');
    expect(preview.ok).toBe(false);
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe('Lions v Tigers: the ball-by-ball record has a gap or repeat after event 2.');
    expect(found[0].path).toBe('data.matchEvents[2]');
  });

  it('rejects a log that does not start at the first event', () => {
    const data = tournamentBackup();
    const text = exportText({ ...data, matchEvents: data.matchEvents.filter((event) => event.id !== `${IDS.match1}-e1`) });
    expect(previewText(text).issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_EVENT_LOG', message: 'Lions v Tigers: the ball-by-ball record does not start at the beginning of the match.' }),
    );
  });

  it('FR-04k rejects an invalid delivery reported by the engine with its path', () => {
    const checker: MatchLogChecker = (setup, events) => ({
      events,
      corrected: 0,
      errors: setup.matchId === IDS.match1 ? [issue(events[3], 'Fakhar is not in the squad.'), issue(events[5], 'Another problem.')] : [],
      state: null,
    });
    const preview = previewText(exportText(tournamentBackup()), { checker });
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual({
      severity: 'error',
      code: 'INVALID_EVENT_LOG',
      message: "Lions v Tigers: event 4 of the ball-by-ball record can't be replayed. Fakhar is not in the squad. 1 other event has problems too.",
      path: 'data.matchEvents[3]',
    });
  });

  it('warns about corrected stamps and returns the corrected log for import', () => {
    const checker: MatchLogChecker = (setup, events) => ({
      events: setup.matchId === IDS.match1 ? events.map((event) => (event.kind === 'delivery' ? { ...event, recordedAt: '2026-09-02T00:00:00.000Z' } : event)) : events,
      corrected: setup.matchId === IDS.match1 ? 3 : 0,
      errors: [],
      state: null,
    });
    const result = validateText(exportText(tournamentBackup()), { checker });
    expect(result.preview.ok).toBe(true);
    expect(result.preview.issues).toEqual([
      {
        severity: 'warning',
        code: 'INVALID_EVENT_LOG',
        message: '3 deliveries in Lions v Tigers had outdated batter or bowler names and will be corrected.',
        path: null,
      },
    ]);
    const corrected = result.envelope?.data.matchEvents.filter((event) => event.matchId === IDS.match1 && event.kind === 'delivery') ?? [];
    expect(corrected.length).toBeGreaterThan(0);
    expect(corrected.every((event) => event.recordedAt === '2026-09-02T00:00:00.000Z')).toBe(true);
    expect(result.logChecks.get(IDS.match1)?.issues).toHaveLength(1);
  });

  it('reports a log the engine could not check instead of crashing', () => {
    const checker: MatchLogChecker = () => {
      throw new Error('boom');
    };
    const preview = previewText(exportText(tournamentBackup()), { checker });
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_EVENT_LOG', message: "Friendly: the ball-by-ball record couldn't be checked." }),
    );
    expect(preview.issues.some((entry) => entry.message.includes('boom'))).toBe(false);
  });

  it('skips the replay of matches whose rows are already broken', () => {
    const seen: string[] = [];
    const checker: MatchLogChecker = (setup, events) => {
      seen.push(setup.matchId);
      return { events, corrected: 0, errors: [], state: null };
    };
    const data = tournamentBackup();
    const text = exportText({
      ...data,
      matchEvents: data.matchEvents.map((event) => (event.id === `${IDS.match2}-e2` ? { ...event, seq: 0 } : event)),
    });
    previewText(text, { checker });
    expect(seen).toEqual([IDS.match1]);
  });

  it('gives the engine the match setup rebuilt from the backup rows', () => {
    const setups: MatchSetup[] = [];
    const orders: number[][] = [];
    const checker: MatchLogChecker = (setup, events) => {
      setups.push(setup);
      orders.push(events.map((event) => event.seq));
      return { events, corrected: 0, errors: [], state: null };
    };
    const data = tournamentBackup();
    const shuffled = { ...data, matches: data.matches.map((row, i) => (i === 0 ? { ...row, teamBPlayers: 4 } : row)), matchEvents: [...data.matchEvents].reverse() };
    previewText(exportText(shuffled), { checker });
    const setup = setups.find((entry) => entry.matchId === IDS.match1);
    expect(setup?.teams.map((team) => [team.id, team.name, team.shortName, team.playersInSide])).toEqual([
      [IDS.lions, 'Lions', 'LIO', 3],
      [IDS.tigers, 'Tigers', 'TIG', 4],
    ]);
    expect(setup?.toss).toEqual({ winnerTeamId: IDS.lions, decision: 'bat' });
    expect(setup?.rules).toEqual(data.matches[0].rules);
    expect(setup?.players.find((player) => player.playerId === LIONS_SUB)).toMatchObject({ name: 'Usman', isSubstitute: true, role: 'unknown' });
    expect(setup?.players).toHaveLength(7);
    orders.forEach((order) => expect(order).toEqual([...order].sort((a, b) => a - b)));
  });

  it('builds one job per match with events and remembers each event path', () => {
    const data = deepFreeze(tournamentBackup());
    const jobs = matchLogJobs(data);
    expect(jobs.map((job) => job.matchId)).toEqual([IDS.match1, IDS.match2]);
    expect(jobs[1].label).toBe('Friendly');
    expect(jobs[0].paths.get(`${IDS.match1}-e1`)).toBe('data.matchEvents[0]');
    expect(matchLogJobs(data, new Set([IDS.match2])).map((job) => job.matchId)).toEqual([IDS.match1]);
  });

  const ready = engineReady(() => validateLog(matchLogJobs(tournamentBackup())[0].setup, []));

  (ready ? it : it.skip)('accepts a valid match log with the real scoring engine', () => {
    const preview = previewText(exportText(onlyMatch1(tournamentBackup())), { checker: engineLogChecker });
    expect(codes(preview, 'error')).toEqual([]);
    expect(preview.ok).toBe(true);
  });

  (ready ? it : it.skip)('rejects an impossible delivery with the real scoring engine', () => {
    const data = onlyMatch1(tournamentBackup());
    const broken = {
      ...data,
      matchEvents: data.matchEvents.map((event) =>
        event.kind === 'delivery' && event.wicket !== null ? { ...event, runsRun: 2 } : event,
      ),
    };
    const preview = previewText(exportText(broken), { checker: engineLogChecker });
    expect(preview.ok).toBe(false);
    expect(codes(preview, 'error')).toContain('INVALID_EVENT_LOG');
  });
});

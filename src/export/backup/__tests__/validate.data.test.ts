/** @jest-environment node */
import type { BackupData } from '@/domain/types';
import { EMPTY_LOCAL_DATA, type LocalData } from '../validation/context';
import { IDS, tournamentBackup } from './fixtures/backupData';
import { codes, exportText, previewText } from './support/files';

function edited(change: (data: BackupData) => BackupData): string {
  return exportText(change(tournamentBackup()));
}

function issueAt(text: string, path: string, local: LocalData = EMPTY_LOCAL_DATA) {
  return previewText(text, { local }).issues.filter((issue) => issue.path === path);
}

function indexOfKind(data: BackupData, kind: string): number {
  return data.matchEvents.findIndex((event) => event.kind === kind);
}

describe('structure (stage 5)', () => {
  it('FR-04g reports a badly formatted date with its path', () => {
    const text = edited((data) => ({ ...data, matches: data.matches.map((row, i) => (i === 0 ? { ...row, scheduledDate: '31/12/2026' } : row)) }));
    const preview = previewText(text);
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual({
      severity: 'error',
      code: 'INVALID_VALUE',
      message: 'Expected a date like 2026-09-30, found "31/12/2026".',
      path: 'data.matches[0].scheduledDate',
    });
  });

  it('FR-04g reports a delivery with negative runs', () => {
    const data = tournamentBackup();
    const k = data.matchEvents.findIndex((event) => event.kind === 'delivery');
    const text = exportText({
      ...data,
      matchEvents: data.matchEvents.map((event, i) => (i === k ? { ...event, runsRun: -1 } : event)),
    });
    expect(issueAt(text, `data.matchEvents[${k}].runsRun`)).toEqual([
      expect.objectContaining({ severity: 'error', code: 'INVALID_VALUE', message: 'Expected a whole number from 0 to 9, found -1.' }),
    ]);
  });

  it.each([
    ['an impossible calendar date', (data: BackupData): BackupData => ({ ...data, tournaments: [{ ...data.tournaments[0], startDate: '2026-02-30' }] }), 'data.tournaments[0].startDate'],
    ['an unknown match status', (data: BackupData): BackupData => ({ ...data, matches: [{ ...data.matches[0], status: 'finished' as 'completed' }, data.matches[1]] }), 'data.matches[0].status'],
    ['a short name that is too long', (data: BackupData): BackupData => ({ ...data, teams: [{ ...data.teams[0], shortName: 'LIONSXI' }, ...data.teams.slice(1)] }), 'data.teams[0].shortName'],
    ['a time with seconds', (data: BackupData): BackupData => ({ ...data, fixtures: [{ ...data.fixtures[0], scheduledTime: '10:00:00' }, ...data.fixtures.slice(1)] }), 'data.fixtures[0].scheduledTime'],
    ['balls per over out of range', (data: BackupData): BackupData => ({ ...data, matches: [{ ...data.matches[0], rules: { ...data.matches[0].rules, ballsPerOver: 13 } }, data.matches[1]] }), 'data.matches[0].rules.ballsPerOver'],
    ['an unknown slot source', (data: BackupData): BackupData => ({ ...data, slots: [{ ...data.slots[0], source: { kind: 'lucky_dip' } as unknown as BackupData['slots'][number]['source'] }, ...data.slots.slice(1)] }), 'data.slots[0].source.kind'],
    ['an unknown entry rule field', (data: BackupData): BackupData => ({ ...data, stages: [data.stages[0], { ...data.stages[1], config: { ...data.stages[1].config, entryRules: [{ kind: 'top_per_pool', sourceStageId: IDS.groups, count: 0, fromPosition: 1 }] } }] }), 'data.stages[1].config.entryRules[0].count'],
    ['a malformed override', (data: BackupData): BackupData => ({ ...data, overrides: [{ ...data.overrides[0], reason: '  ' }, ...data.overrides.slice(1)] }), 'data.overrides[0].reason'],
    ['an audit entry with an unknown action', (data: BackupData): BackupData => ({ ...data, auditEvents: [{ ...data.auditEvents[0], action: 'hacked' as 'tournament_created' }, ...data.auditEvents.slice(1)] }), 'data.auditEvents[0].action'],
    ['a template stage without a key', (data: BackupData): BackupData => ({ ...data, templates: [{ ...data.templates[0], stages: [{ ...data.templates[0].stages[0], key: '' }] }] }), 'data.templates[0].stages[0].key'],
    ['settings with an unknown theme', (data: BackupData): BackupData => ({ ...data, settings: data.settings === null ? null : { ...data.settings, theme: 'blue' as 'dark' } }), 'data.settings.theme'],
  ])('rejects %s', (_label, change, path) => {
    const issues = issueAt(edited(change), path);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'INVALID_VALUE' });
  });

  it.each(['normal', 'revised_target', 'par_score', 'penalty_runs'] as const)('accepts a stored win by method %s', (method) => {
    const text = edited((data) => ({
      ...data,
      matches: data.matches.map((row, i) =>
        i === 0 ? { ...row, result: { type: 'win', winnerTeamId: IDS.tigers, loserTeamId: IDS.lions, margin: { kind: 'runs', runs: 3 }, method } } : row,
      ),
    }));
    expect(issueAt(text, 'data.matches[0].result.method')).toEqual([]);
  });

  it('accepts settings with or without a scoring pad hand and rejects an unknown one', () => {
    const withHand = (padHand: unknown) =>
      edited((data) => ({
        ...data,
        settings: data.settings === null ? null : { ...data.settings, scoring: { ...data.settings.scoring, padHand: padHand as 'left' } },
      }));
    expect(issueAt(withHand('left'), 'data.settings.scoring.padHand')).toEqual([]);
    expect(issueAt(withHand(undefined), 'data.settings.scoring.padHand')).toEqual([]);
    expect(issueAt(withHand('middle'), 'data.settings.scoring.padHand')).toEqual([expect.objectContaining({ severity: 'error', code: 'INVALID_VALUE' })]);
  });

  it('accepts settings with or without the reduce transparency switch and rejects a non-boolean one (§106)', () => {
    const withSwitch = (reduceTransparency: unknown) =>
      edited((data) => ({
        ...data,
        settings: data.settings === null ? null : { ...data.settings, reduceTransparency: reduceTransparency as boolean },
      }));
    expect(issueAt(withSwitch(true), 'data.settings.reduceTransparency')).toEqual([]);
    expect(issueAt(withSwitch(false), 'data.settings.reduceTransparency')).toEqual([]);
    expect(issueAt(withSwitch(undefined), 'data.settings.reduceTransparency')).toEqual([]);
    expect(issueAt(withSwitch('on'), 'data.settings.reduceTransparency')).toEqual([expect.objectContaining({ severity: 'error', code: 'INVALID_VALUE' })]);
  });

  it('rejects an unknown win method', () => {
    const text = edited((data) => ({
      ...data,
      matches: data.matches.map((row, i) =>
        i === 0 && row.result !== null && row.result.type === 'win' ? { ...row, result: { ...row.result, method: 'dls' as 'normal' } } : row,
      ),
    }));
    expect(issueAt(text, 'data.matches[0].result.method')).toEqual([expect.objectContaining({ severity: 'error', code: 'INVALID_VALUE' })]);
  });

  it('rejects a wide that says who the runs went to, and a six off byes', () => {
    const data = tournamentBackup();
    const wide = data.matchEvents.findIndex((event) => event.kind === 'delivery' && event.call === 'wide');
    const fair = data.matchEvents.findIndex((event) => event.kind === 'delivery' && event.call === 'fair');
    const text = exportText({
      ...data,
      matchEvents: data.matchEvents.map((event, i) => {
        if (i === wide) {
          return { ...event, runsTo: 'bat' } as typeof event;
        }
        return i === fair ? ({ ...event, runsTo: 'bye', boundary: 6 } as typeof event) : event;
      }),
    });
    expect(issueAt(text, `data.matchEvents[${wide}].runsTo`)).toHaveLength(1);
    expect(issueAt(text, `data.matchEvents[${fair}].boundary`)).toHaveLength(1);
  });

  it('rejects a collection that is not a list and ignores unknown collections with a warning', () => {
    const text = exportText({ ...tournamentBackup(), venues: 'none' as unknown as BackupData['venues'] });
    const withExtra = JSON.stringify({ ...JSON.parse(text), data: { ...JSON.parse(text).data, scorers: [] } });
    const preview = previewText(withExtra);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_VALUE', path: 'data.venues', severity: 'error' }));
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_VALUE', path: 'data.scorers', severity: 'warning' }));
  });

  it('caps repeated problems and summarises the rest', () => {
    const data = tournamentBackup();
    const broken = Array.from({ length: 80 }, (_, index) => ({ ...data.venues[0], id: `v-${index}`, name: '' }));
    const preview = previewText(exportText({ ...data, venues: [...data.venues, ...broken] }));
    const invalid = preview.issues.filter((issue) => issue.code === 'INVALID_VALUE' && issue.severity === 'error');
    expect(invalid).toHaveLength(51);
    expect(invalid[50]).toMatchObject({ path: null, message: '30 more problems like the ones above were found.' });
  });
});

describe('identity (stage 6)', () => {
  it('FR-04h rejects the same team id twice', () => {
    const text = edited((data) => ({ ...data, teams: [...data.teams, { ...data.teams[0], name: 'Lions Again' }] }));
    const preview = previewText(text);
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual({
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: 'Two teams in this file have the same id.',
      path: 'data.teams[5].id',
    });
  });

  it('rejects two events of one match at the same position and a player listed twice in a squad', () => {
    const text = edited((data) => ({
      ...data,
      matchEvents: [...data.matchEvents, { ...data.matchEvents[1], id: 'extra-event' }],
      matchPlayers: [...data.matchPlayers, data.matchPlayers[0]],
    }));
    const preview = previewText(text);
    expect(codes(preview, 'error').filter((code) => code === 'DUPLICATE_ID')).toHaveLength(2);
  });

  it('rejects the same venue linked twice to one tournament', () => {
    const text = edited((data) => ({ ...data, tournaments: [{ ...data.tournaments[0], venueIds: [IDS.venue2, IDS.venue2] }, ...data.tournaments.slice(1)] }));
    expect(previewText(text).ok).toBe(false);
    expect(issueAt(text, 'data.tournaments[0].venueIds[1]')).toEqual([
      { severity: 'error', code: 'DUPLICATE_ID', message: 'The same venue is listed twice for this tournament.', path: 'data.tournaments[0].venueIds[1]' },
    ]);
  });

  it('rejects two rule sets for one tournament', () => {
    const text = edited((data) => ({ ...data, tournamentRules: [...data.tournamentRules, data.tournamentRules[0]] }));
    expect(issueAt(text, 'data.tournamentRules[1].tournamentId')[0]).toMatchObject({ code: 'DUPLICATE_ID' });
  });
});

describe('references (stage 7)', () => {
  it('FR-04i rejects a team that is neither in the file nor on the device', () => {
    const text = edited((data) => ({ ...data, matches: [{ ...data.matches[0], teamAId: 'team-ghost' }, data.matches[1]] }));
    expect(issueAt(text, 'data.matches[0].teamAId')).toContainEqual({
      severity: 'error',
      code: 'MISSING_REFERENCE',
      message: 'This refers to a team that is not in the file or on this device.',
      path: 'data.matches[0].teamAId',
    });
  });

  it('accepts a library reference that exists on the device', () => {
    const text = edited((data) => ({ ...data, venues: data.venues.filter((venue) => venue.id !== IDS.venue2) }));
    expect(issueAt(text, 'data.tournaments[0].venueIds[1]')).toHaveLength(1);
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { venue: new Set([IDS.venue2]) } };
    expect(issueAt(text, 'data.tournaments[0].venueIds[1]', local)).toHaveLength(0);
    expect(previewText(text, { local }).ok).toBe(true);
  });

  it('never resolves tournament-internal references on the device', () => {
    const text = edited((data) => ({ ...data, pools: [] }));
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { tournament: new Set([IDS.tournament]) } };
    expect(issueAt(text, 'data.poolEntries[0].poolId', local)).toEqual([
      expect.objectContaining({ code: 'MISSING_REFERENCE', message: 'This refers to a pool that is not in the file.' }),
    ]);
  });

  it('FR-04j rejects an unknown fielder inside an event payload', () => {
    const data = tournamentBackup();
    const k = indexOfKind(data, 'batter_dismissed');
    const text = exportText({
      ...data,
      matchEvents: data.matchEvents.map((event, i) => (i === k && event.kind === 'batter_dismissed' ? { ...event, fielderIds: ['p-nobody'] } : event)),
    });
    const preview = previewText(text);
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REFERENCE', path: `data.matchEvents[${k}].fielderIds[0]` }),
    );
  });

  it('accepts overrides whose stage, pool or slot no longer exists (history, like the database keeps it)', () => {
    const text = edited((data) => ({
      ...data,
      overrides: data.overrides.map((row) => {
        switch (row.kind) {
          case 'qualification':
            return { ...row, stageId: 'stage-deleted', slotId: 'slot-deleted', poolId: 'pool-deleted' };
          case 'slot_assignment':
            return { ...row, slotId: 'slot-re-expanded' };
          case 'tie_resolution':
          case 'points_adjustment':
            return { ...row, stageId: 'stage-deleted', poolId: 'pool-deleted' };
          default:
            return row;
        }
      }),
    }));
    const preview = previewText(text);
    expect(preview.issues.filter((issue) => issue.code === 'MISSING_REFERENCE')).toEqual([]);
    expect(preview.ok).toBe(true);
  });

  it('still requires the teams named by an override', () => {
    const text = edited((data) => ({ ...data, overrides: data.overrides.map((row) => (row.kind === 'slot_assignment' ? { ...row, teamId: 'team-ghost' } : row)) }));
    const at = tournamentBackup().overrides.findIndex((row) => row.kind === 'slot_assignment');
    expect(issueAt(text, `data.overrides[${at}].teamId`)).toEqual([expect.objectContaining({ code: 'MISSING_REFERENCE' })]);
  });

  it('checks references inside slot sources, entry rules and overrides', () => {
    const text = edited((data) => ({ ...data, fixtures: data.fixtures.filter((row) => row.id !== IDS.fixture1), stages: data.stages }));
    const paths = previewText(text)
      .issues.filter((issue) => issue.code === 'MISSING_REFERENCE')
      .map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['data.slots[7].source.fixtureId', 'data.slots[8].source.fixtureId']));
  });
});

describe('semantics (stage 8)', () => {
  it('rejects fixture and pool sides that are not entered in the tournament', () => {
    const outsider = edited((data) => ({
      ...data,
      tournamentTeams: data.tournamentTeams.filter((row) => row.teamId !== IDS.eagles),
    }));
    const preview = previewText(outsider);
    expect(preview.ok).toBe(false);
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.fixtures[1].sideA.teamId', message: 'This team is not entered in the tournament.' }));
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.poolEntries[2].side.teamId' }));
  });

  it('rejects squad players of a team that is not playing and event players outside the squad', () => {
    const data = tournamentBackup();
    const k = data.matchEvents.findIndex((event) => event.kind === 'batter_in' && event.matchId === IDS.match1);
    const text = exportText({
      ...data,
      matchPlayers: data.matchPlayers.map((row, i) => (i === 0 ? { ...row, teamId: IDS.eagles } : row)),
      matchEvents: data.matchEvents.map((event, i) => (i === k && event.kind === 'batter_in' ? { ...event, playerId: 'p-eagles-1' } : event)),
    });
    const preview = previewText(text);
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.matchPlayers[0].teamId', code: 'INVALID_VALUE' }));
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ path: `data.matchEvents[${k}].playerId`, message: 'This player is not in the squad for the match.' }),
    );
  });

  it('rejects a second final, a shared bracket place and a progression slot fed by a pool', () => {
    const text = edited((data) => ({
      ...data,
      fixtures: [...data.fixtures, { ...data.fixtures[2], id: 'fx-final-2', matchNumber: 4 }],
      slots: data.slots.map((slot, i) => (i === 5 ? { ...slot, source: data.slots[0].source } : slot)),
    }));
    const messages = previewText(text).issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'A stage can only have one final.',
        'Two fixtures share the same place in the bracket.',
        'A progression slot must be filled by the winner or loser of a match.',
      ]),
    );
  });

  it('rejects mismatched status and result, and a toss won by an outsider', () => {
    const text = edited((data) => ({
      ...data,
      matches: [
        { ...data.matches[0], status: 'live' },
        { ...data.matches[1], toss: { winnerTeamId: IDS.tigers, decision: 'bat' } },
      ],
    }));
    const preview = previewText(text);
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.matches[0].result', message: 'Only a finished match can have a result.' }));
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ path: 'data.matches[1].toss.winnerTeamId', message: 'The toss was won by a team that is not playing this match.' }),
    );
  });

  it('rejects a fixture whose match was played for another fixture, and pools of another stage', () => {
    const text = edited((data) => ({
      ...data,
      fixtures: data.fixtures.map((row) => (row.id === IDS.fixture2 ? { ...row, matchId: IDS.match1, status: 'completed' } : row)),
      poolEntries: data.poolEntries.map((row, i) => (i === 0 ? { ...row, stageId: IDS.knockout } : row)),
    }));
    const preview = previewText(text);
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.fixtures[1].matchId' }));
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'data.poolEntries[0].poolId', message: 'This pool belongs to a different stage.' }));
  });

  it('rejects a replacement team that is not entered', () => {
    const broken = edited((data) => ({
      ...data,
      teams: [...data.teams, { ...data.teams[0], id: 'team-new', name: 'New' }],
      tournamentTeams: data.tournamentTeams.map((row) => (row.id === 'tt-hawks' ? { ...row, replacedByTeamId: 'team-new' } : row)),
    }));
    expect(issueAt(broken, 'data.tournamentTeams[3].replacedByTeamId')).toEqual([
      expect.objectContaining({ message: 'The replacement team is not entered in the tournament.' }),
    ]);
  });
});

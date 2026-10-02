/** @jest-environment node */
import type { BackupData, Id } from '@/domain/types';
import { parseBackupText } from '../parse';
import { EMPTY_LOCAL_DATA, type LocalData, type LocalFootprint } from '../validation/context';
import type { MatchLogCheck, MatchLogChecker } from '../validation/eventLogs';
import { planLocalLookup, validateBackup, validateBackupAsync } from '../validation/validate';
import { IDS, tournamentBackup } from './fixtures/backupData';
import { acceptAll, exportText, PARSE, previewText } from './support/files';
import { sha256Hex } from './support/sha256';

function sameDevice(data: BackupData, footprints: Readonly<Record<Id, LocalFootprint>> = {}): LocalData {
  return {
    existingIds: {
      tournament: new Set(data.tournaments.map((row) => row.id)),
      match: new Set(data.matches.map((row) => row.id)),
      team: new Set(data.teams.map((row) => row.id)),
      player: new Set(data.players.map((row) => row.id)),
      venue: new Set(data.venues.map((row) => row.id)),
      template: new Set(data.templates.map((row) => row.id)),
      preset: new Set(data.formatPresets.map((row) => row.id)),
    },
    footprint: (_entity, id) => footprints[id] ?? null,
    previouslyImportedAt: null,
  };
}

const data = tournamentBackup();
const text = exportText(data);
const match1Events = data.matchEvents.filter((event) => event.matchId === IDS.match1);

describe('conflicts per aggregate (stage 10)', () => {
  it('FR-06a lists every aggregate that already exists and still allows the import', () => {
    const local = sameDevice(data, {
      [IDS.tournament]: { matchIds: [IDS.match1], events: match1Events.length },
      [IDS.match2]: { matchIds: [IDS.match2], events: data.matchEvents.length - match1Events.length },
    });
    const preview = previewText(text, { local });
    expect(preview.ok).toBe(true);
    const byKind = (kind: string) => preview.conflicts.filter((conflict) => conflict.entity === kind);
    expect(byKind('tournament')).toEqual([{ entity: 'tournament', id: IDS.tournament, label: 'Spring Cup', localOnly: { matches: 0, events: 0 } }]);
    expect(byKind('match')).toEqual([{ entity: 'match', id: IDS.match2, label: 'Friendly', localOnly: { matches: 0, events: 0 } }]);
    expect(byKind('team')).toHaveLength(5);
    expect(byKind('player')).toHaveLength(data.players.length);
    expect(byKind('venue')).toHaveLength(2);
    expect(byKind('template')).toHaveLength(1);
    expect(byKind('preset')).toHaveLength(1);
    expect(preview.conflicts.map((conflict) => conflict.entity).slice(0, 3)).toEqual(['tournament', 'match', 'team']);
    expect(byKind('player')[0].label).toBe('Babar (Lions)');
    expect(preview.issues.every((issue) => issue.severity === 'warning' && issue.code === 'ID_CONFLICT')).toBe(true);
    expect(preview.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['The tournament "Spring Cup" is already on this device.', '5 teams in this file are already on this device.']),
    );
  });

  it('never lists a tournament match as a separate conflict', () => {
    const preview = previewText(text, { local: sameDevice(data) });
    expect(preview.conflicts.some((conflict) => conflict.id === IDS.match1)).toBe(false);
  });

  it('FR-06e counts local-only matches and events from the local event ids', () => {
    const local = sameDevice(data, {
      [IDS.tournament]: {
        matchIds: [IDS.match1, 'match-local'],
        events: match1Events.length + 3,
        eventIds: [...match1Events.map((event) => event.id), 'edit-1', 'edit-2', 'local-e1'],
      },
    });
    const conflict = previewText(text, { local }).conflicts.find((entry) => entry.entity === 'tournament');
    expect(conflict?.localOnly).toEqual({ matches: 1, events: 3 });
  });

  it('estimates local-only events from the count when event ids are not given', () => {
    const local = sameDevice(data, { [IDS.tournament]: { matchIds: [IDS.match1], events: match1Events.length + 8 } });
    expect(previewText(text, { local }).conflicts[0].localOnly).toEqual({ matches: 0, events: 8 });
    const fewer = sameDevice(data, { [IDS.tournament]: { matchIds: [IDS.match1], events: 2 } });
    expect(previewText(text, { local: fewer }).conflicts[0].localOnly).toEqual({ matches: 0, events: 0 });
  });

  it('reports no conflicts on an empty device and passes the previous import date through', () => {
    const preview = previewText(text, { local: { ...EMPTY_LOCAL_DATA, previouslyImportedAt: '2026-09-12T08:00:00.000Z' } });
    expect(preview.conflicts).toEqual([]);
    expect(preview.previouslyImportedAt).toBe('2026-09-12T08:00:00.000Z');
  });

  it('shows conflicts next to errors so nothing is silently merged', () => {
    const broken = exportText({ ...data, teams: [...data.teams, data.teams[0]] });
    const preview = previewText(broken, { local: sameDevice(data) });
    expect(preview.ok).toBe(false);
    expect(preview.conflicts.length).toBeGreaterThan(0);
  });
});

describe('planLocalLookup', () => {
  it('lists the aggregate roots and library ids to look up on the device', () => {
    const plan = planLocalLookup(parseBackupText(text, PARSE));
    expect(plan.tournament).toEqual([IDS.tournament]);
    expect(plan.match).toEqual([IDS.match2]);
    expect(plan.team).toEqual(data.teams.map((row) => row.id));
    expect(plan.player).toHaveLength(data.players.length);
    expect(plan.venue).toEqual([IDS.venue, IDS.venue2]);
    expect(plan.template).toEqual(['tpl-club']);
    expect(plan.preset).toEqual(['preset-club-6']);
  });

  it('includes library references that are missing from the file', () => {
    const partial = exportText({ ...data, venues: data.venues.slice(0, 1) });
    expect(planLocalLookup(parseBackupText(partial, PARSE)).venue).toEqual([IDS.venue, IDS.venue2]);
  });

  it('is empty for a file that could not be read', () => {
    expect(planLocalLookup(parseBackupText('nope', PARSE))).toEqual({ tournament: [], match: [], team: [], player: [], venue: [], template: [], preset: [] });
  });
});

describe('validateBackupAsync', () => {
  it('matches the synchronous result and yields between matches', async () => {
    const parsed = parseBackupText(text, PARSE);
    const checksum = parsed.ok ? sha256Hex(parsed.checksumInput) : null;
    const ctx = { checksum, local: EMPTY_LOCAL_DATA, logChecker: acceptAll };
    const progress: [number, number][] = [];
    let pauses = 0;
    const result = await validateBackupAsync(parsed, ctx, {
      pause: async () => {
        pauses += 1;
      },
      onProgress: (checked, total) => progress.push([checked, total]),
    });
    expect(result.preview).toEqual(validateBackup(parsed, ctx).preview);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(pauses).toBe(2);
    const batched = await validateBackupAsync(parsed, ctx, { pause: async () => undefined, yieldEvery: 5 });
    expect(batched.preview.ok).toBe(true);
  });

  it('returns the failed preview for an unreadable file', async () => {
    const result = await validateBackupAsync(parseBackupText('', PARSE), { checksum: null, local: EMPTY_LOCAL_DATA }, { pause: async () => undefined });
    expect(result.preview.ok).toBe(false);
    expect(result.envelope).toBeNull();
  });

  it('reuses log checks that were computed earlier', () => {
    const parsed = parseBackupText(text, PARSE);
    const calls: string[] = [];
    const checker: MatchLogChecker = (setup, events) => {
      calls.push(setup.matchId);
      return { events, corrected: 0, errors: [], state: null };
    };
    const cached: MatchLogCheck = { matchId: IDS.match1, issues: [], events: match1Events, state: null };
    const result = validateBackup(parsed, {
      checksum: parsed.ok ? sha256Hex(parsed.checksumInput) : null,
      local: EMPTY_LOCAL_DATA,
      logChecker: checker,
      logChecks: new Map([[IDS.match1, cached]]),
    });
    expect(result.preview.ok).toBe(true);
    expect(calls).toEqual([IDS.match2]);
    expect(result.logChecks.get(IDS.match1)).toBe(cached);
  });
});

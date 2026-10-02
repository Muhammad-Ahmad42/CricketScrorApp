/** @jest-environment node */
import type { AppSettings, AuditEvent, FormatPreset, ImpactSummary, TournamentTemplate } from '@/domain/types';
import { TEST_MATCH_RULES, buildMatch, buildTeamSeed, buildTournament, buildTournamentRules, isoAt } from '../testing/builders';
import { countRows, openTestRepositories } from '../testing/harness';
import { seedLibrary } from '../testing/tournamentScenario';

const SETTINGS: AppSettings = {
  theme: 'dark',
  hapticsEnabled: true,
  soundEnabled: false,
  reducedMotion: 'system',
  defaultFormatId: 'T20',
  scoring: { confirmInningsEnd: true, autoPromptBowler: false, dotStyle: 'dot', keepAwake: true },
};

function template(id: string, name: string, at: string): TournamentTemplate {
  const rules = buildTournamentRules('x');
  return {
    id,
    name,
    description: 'Two pools, semifinals and a final',
    builtin: false,
    teamCount: 8,
    structureKind: 'groups_knockout',
    pointsSystem: rules.pointsSystem,
    nrr: rules.nrr,
    tieBreakers: rules.tieBreakers,
    defaultFormatId: 'T20',
    defaultMatchRules: TEST_MATCH_RULES,
    stages: [
      {
        key: 'groups',
        name: 'Group stage',
        type: 'group',
        poolCount: 2,
        poolSizes: [4, 4],
        poolSlotIndexes: null,
        fixtureGeneration: { method: 'round_robin', legs: 1 },
        seeding: 'random',
        seedingNormalization: 'raw',
        entry: [],
        knockout: null,
        abandonedMatches: 'no_result',
        decidesChampion: false,
        headToHeadRequiresCompleteMiniLeague: false,
        formatId: null,
        matchRules: null,
        pointsSystem: null,
        tieBreakers: null,
        nrr: null,
      },
      {
        key: 'ko',
        name: 'Knockouts',
        type: 'knockout',
        poolCount: 0,
        poolSizes: null,
        poolSlotIndexes: null,
        fixtureGeneration: { method: 'knockout', legs: 1 },
        seeding: 'fixed',
        seedingNormalization: 'raw',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: 2, fromPosition: 1 }],
        knockout: { thirdPlacePlayoff: true, rounds: null, tiedMatch: 'super_over', noResult: 'higher_seed' },
        abandonedMatches: 'no_result',
        decidesChampion: true,
        headToHeadRequiresCompleteMiniLeague: false,
        formatId: 'T20',
        matchRules: { ...TEST_MATCH_RULES, oversPerInnings: 5 },
        pointsSystem: null,
        tieBreakers: null,
        nrr: null,
      },
    ],
    createdAt: at,
    updatedAt: at,
  };
}

const IMPACT: ImpactSummary = {
  severity: 'warning',
  headline: 'This change affects 2 fixtures, 1 of them completed.',
  lines: ['Hawks move to Pool B', 'Match 4 is removed'],
  fixtures: [{ fixtureId: 'f4', label: 'Match 4 · Hawks v Lions', change: 'removed', hasMatchData: false }],
  standings: [{ stageId: 's1', poolId: 'p1', teamId: 'haw', before: { position: 3, points: 2, nrr: -0.5 }, after: null }],
  qualification: [{ stageId: 's2', teamId: 'haw', before: 'in_contention', after: null }],
  slots: [{ slotId: 'sl1', label: 'A2', beforeTeamId: 'haw', afterTeamId: 'tig', playedFixtureIds: [] }],
  nrrChanged: true,
  completedMatchesAffected: 1,
  requiresConfirmation: true,
  requiresReason: true,
  blocked: null,
};

describe('SettingsRepository', () => {
  it('stores one row per key, returns only stored keys and upserts in place', async () => {
    const { db, repos } = await openTestRepositories();
    expect(await repos.settings.getAll()).toEqual({});
    await repos.settings.set('theme', 'light', isoAt(1));
    await repos.settings.set('scoring', SETTINGS.scoring, isoAt(2));
    expect(await repos.settings.getAll()).toEqual({ theme: 'light', scoring: SETTINGS.scoring });
    await repos.settings.set('theme', 'dark', isoAt(3));
    for (const key of ['hapticsEnabled', 'soundEnabled', 'reducedMotion', 'defaultFormatId'] as const) {
      await repos.settings.set(key, SETTINGS[key], isoAt(4));
    }
    expect(await repos.settings.getAll()).toEqual(SETTINGS);
    expect(await countRows(db, 'app_settings')).toBe(6);
    expect(await db.getFirstAsync("SELECT value_json, updated_at FROM app_settings WHERE key = 'theme'")).toEqual({
      value_json: '"dark"',
      updated_at: isoAt(3),
    });
    await db.runAsync("INSERT INTO app_settings (key, value_json, updated_at) VALUES ('legacyFlag', 'true', 'x')");
    expect(await repos.settings.getAll()).toEqual(SETTINGS);
    await expect(db.runAsync("UPDATE app_settings SET value_json = '{' WHERE key = 'theme'")).rejects.toThrow(/CHECK|JSON/i);
  });
});

describe('TemplateRepository', () => {
  it('round-trips user templates deep-equal, lists them by name and keeps created_at on update', async () => {
    const { db, repos } = await openTestRepositories();
    const eight = template('tpl-8', 'Eight team cup', isoAt(10));
    const six = { ...template('tpl-6', 'County six', isoAt(20)), teamCount: null, description: '' };
    await repos.templates.upsert(eight);
    await repos.templates.upsert(six);
    expect(await repos.templates.get('tpl-8')).toEqual(eight);
    expect(await repos.templates.list()).toEqual([six, eight]);
    const renamed = { ...eight, name: 'Autumn cup', createdAt: isoAt(99), updatedAt: isoAt(100) };
    await repos.templates.upsert(renamed);
    expect(await repos.templates.get('tpl-8')).toEqual({ ...renamed, createdAt: isoAt(10) });
    const stored = await db.getFirstAsync<{ readonly structure_json: string }>("SELECT structure_json FROM tournament_templates WHERE id = 'tpl-8'");
    expect(Object.keys(JSON.parse(stored?.structure_json ?? '{}'))).not.toEqual(expect.arrayContaining(['id', 'createdAt', 'updatedAt']));
    await repos.templates.delete('tpl-6');
    expect(await repos.templates.get('tpl-6')).toBeNull();
    expect(await repos.templates.list()).toHaveLength(1);
    await expect(repos.templates.upsert({ ...eight, id: 'tpl-bad', teamCount: 1 })).rejects.toThrow(/CHECK/);
  });
});

describe('FormatPresetRepository', () => {
  it('round-trips user presets deep-equal, lists them by label and never touches matches on delete', async () => {
    const { db, repos } = await openTestRepositories();
    const tape: FormatPreset = { id: 'user-tape', label: 'Tape ball 6', description: 'Street cricket', builtin: false, rules: { ...TEST_MATCH_RULES, oversPerInnings: 6, lastManStands: true } };
    const box: FormatPreset = { id: 'user-box', label: 'Box cricket', description: '', builtin: false, rules: { ...TEST_MATCH_RULES, playersPerSide: 8 } };
    await repos.presets.upsert(tape, isoAt(1));
    await repos.presets.upsert(box, isoAt(2));
    expect(await repos.presets.list()).toEqual([box, tape]);
    await repos.presets.upsert({ ...tape, label: 'Tape ball 8' }, isoAt(3));
    expect(await db.getFirstAsync("SELECT name, created_at, updated_at FROM match_format_presets WHERE id = 'user-tape'")).toEqual({
      name: 'Tape ball 8',
      created_at: isoAt(1),
      updated_at: isoAt(3),
    });
    await seedLibrary(db, [buildTeamSeed('lio', 'Lions', 'LIO', 2), buildTeamSeed('tig', 'Tigers', 'TIG', 2)]);
    const match = buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', formatId: 'user-box', rules: box.rules });
    await repos.matches.insert(match, []);
    await repos.presets.delete('user-box');
    expect(await repos.presets.list()).toEqual([{ ...tape, label: 'Tape ball 8' }]);
    expect(await repos.matches.get('m1')).toEqual(match);
  });
});

describe('AuditRepository', () => {
  function entry(id: string, seconds: number, overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
      id,
      tournamentId: 'cup',
      matchId: null,
      action: 'team_moved',
      entityType: 'team',
      entityId: 'haw',
      summary: `Entry ${id}`,
      previousValue: null,
      newValue: null,
      reason: null,
      impact: null,
      createdAt: isoAt(seconds),
      ...overrides,
    };
  }

  it('appends entries with JSON values and impact, and lists newest first with filters and keyset paging', async () => {
    const { repos } = await openTestRepositories();
    await repos.tournaments.insert(buildTournament({ id: 'cup' }), buildTournamentRules('cup'));
    await repos.tournaments.insert(buildTournament({ id: 'other' }), buildTournamentRules('other'));
    const detailed = entry('a1', 10, {
      previousValue: { poolId: 'p1', seeds: [1, 2], nested: { ok: true, note: null } },
      newValue: ['p2'],
      reason: 'Travel clash',
      impact: IMPACT,
    });
    const entries = [
      detailed,
      entry('a2', 20),
      entry('a3', 30, { tournamentId: 'other' }),
      entry('a4', 30),
      entry('a5', 40, { tournamentId: null, entityType: 'backup', entityId: 'export-1', action: 'backup_imported', newValue: 42 }),
    ];
    for (const event of entries) {
      await repos.audit.append(event);
    }
    expect((await repos.audit.list({ limit: 10 })).map((e) => e.id)).toEqual(['a5', 'a4', 'a3', 'a2', 'a1']);
    expect(await repos.audit.list({ tournamentId: 'cup', limit: 10 })).toEqual([entries[3], entries[1], detailed]);
    expect((await repos.audit.list({ tournamentId: 'cup', limit: 2 })).map((e) => e.id)).toEqual(['a4', 'a2']);
    expect((await repos.audit.list({ tournamentId: 'cup', limit: 2, before: isoAt(20) })).map((e) => e.id)).toEqual(['a1']);
    expect((await repos.audit.list({ limit: 10, before: isoAt(40) })).map((e) => e.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    expect(await repos.audit.list({ limit: 10, matchId: 'none' })).toEqual([]);
    expect((await repos.audit.list({ limit: 1 }))[0]).toEqual(entries[4]);
    await expect(repos.audit.append(entry('a1', 50))).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    await expect(repos.audit.append(entry('a6', 50, { tournamentId: 'ghost' }))).rejects.toThrow(/FOREIGN KEY/);
  });

  it('exposes no update or delete operations (append-only)', async () => {
    const { repos } = await openTestRepositories();
    expect(Object.keys(repos.audit).sort()).toEqual(['append', 'list']);
  });
});

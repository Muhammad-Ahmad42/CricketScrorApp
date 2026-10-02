/** @jest-environment node */
import {
  DEFAULT_IMPORT_POLICY,
  conflictLines,
  contentLines,
  localLoss,
  policyForImport,
  policyOptions,
  replaceConfirmation,
  selectImportPreview,
  sortIssues,
  summarizeCounts,
} from '../selectors/importPreview';
import { conflict, counts, importPreview, importSource, issue } from './support/fixtures';

describe('import preview view model (§84, BACKUP_RESTORE §10)', () => {
  it('lists errors before warnings and labels the severity in words, not colour alone', () => {
    const issues = sortIssues([
      issue('warning', 'CHECKSUM_MISSING', 'This file has no checksum.'),
      issue('error', 'SCHEMA_TOO_NEW', 'This backup was made by a newer version of Scorebook.'),
      issue('error', 'MISSING_REFERENCE', 'A match refers to a player that is not in the file.'),
    ]);
    expect(issues.map((entry) => [entry.severityLabel, entry.message])).toEqual([
      ['Problem', 'This backup was made by a newer version of Scorebook.'],
      ['Problem', 'A match refers to a player that is not in the file.'],
      ['Warning', 'This file has no checksum.'],
    ]);
    expect(new Set(issues.map((entry) => entry.key)).size).toBe(3);
  });

  it('never shows the technical JSON path of an issue', () => {
    const vm = selectImportPreview(importPreview({ ok: false, issues: [issue('error', 'INVALID_VALUE', 'A score is not a number.')] }), 'bad.json');
    expect(JSON.stringify(vm)).not.toContain('data.matches[0]');
  });

  it('summarises tournaments and matches first, otherwise the library', () => {
    expect(summarizeCounts(counts({ tournaments: 1, matches: 24, teams: 8 }))).toBe('1 tournament, 24 matches');
    expect(summarizeCounts(counts({ matches: 1, teams: 2 }))).toBe('1 match');
    expect(summarizeCounts(counts({ teams: 3, players: 33, venues: 1, templates: 1 }))).toBe('3 teams, 33 players, 1 venue');
    expect(summarizeCounts(counts({ settings: 1 }))).toBe('app settings only');
    expect(summarizeCounts(counts())).toBe('no data');
  });

  it('lists the contents of the file with every non-empty collection and the settings', () => {
    const lines = contentLines(counts({ tournaments: 1, fixtures: 28, matches: 24, matchEvents: 4210, teams: 8, settings: 1, slots: 4 }));
    expect(lines.map((line) => `${line.label}=${line.value}`)).toEqual([
      'Tournaments=1',
      'Fixtures=28',
      'Matches=24',
      'Scoring events=4,210',
      'Teams=8',
      'App settings=Included',
    ]);
  });

  it('describes each conflicting aggregate with what exists only on this phone', () => {
    const lines = conflictLines([
      conflict({ localOnly: { matches: 3, events: 240 } }),
      conflict({ entity: 'match', id: 'm-1', label: 'Lions v Tigers', localOnly: { matches: 1, events: 0 } }),
      conflict({ entity: 'match', id: 'm-2', label: 'Bulls v Bears' }),
      conflict({ entity: 'team', id: 't-1', label: 'Lions' }),
      conflict({ entity: 'preset', id: 'p-1', label: 'Gully 8' }),
      conflict({ entity: 'tournament', id: 'tour-2', label: 'Spring Cup', localOnly: { matches: 0, events: 12 } }),
    ]);
    expect(lines.map((line) => [line.title, line.detail, line.losesLocalData])).toEqual([
      ['Tournament City Cup 2026', '3 matches (240 scoring events) exist only on this phone', true],
      ['Match Lions v Tigers', '1 match exists only on this phone', true],
      ['Match Bulls v Bears', 'Already on this phone, with nothing extra recorded here', false],
      ['Team Lions', 'Already in your library', false],
      ['Format preset Gully 8', 'Already in your library', false],
      ['Tournament Spring Cup', '12 scoring events exist only on this phone', true],
    ]);
  });

  it('adds up what replacing would destroy', () => {
    expect(localLoss([conflict({ localOnly: { matches: 3, events: 240 } }), conflict({ localOnly: { matches: 1, events: 10 } })])).toEqual({
      matches: 4,
      events: 250,
    });
    expect(localLoss([])).toEqual({ matches: 0, events: 0 });
  });

  it('offers skip, copy and replace, with the replace consequence spelled out', () => {
    const lossy = policyOptions({ matches: 3, events: 240 });
    expect(lossy.map((option) => [option.policy, option.chip, option.title, option.destructive])).toEqual([
      ['skip_existing', 'skip', 'Skip them', false],
      ['import_as_copy', 'copy', 'Import as a copy', false],
      ['replace_existing', 'replace', 'Replace mine', true],
    ]);
    expect(lossy[2].detail).toBe('3 matches recorded only on this phone will be lost');
    expect(policyOptions({ matches: 0, events: 5 })[2].detail).toBe('5 scoring events recorded only on this phone will be lost');
    expect(policyOptions({ matches: 0, events: 0 })[2].detail).toBe("Items on this phone are replaced by the file's version");
  });

  it('builds the full preview for a valid duplicate file', () => {
    const vm = selectImportPreview(
      importPreview({
        previouslyImportedAt: '2026-09-29T12:00:00.000Z',
        conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })],
        issues: [issue('warning', 'CHECKSUM_MISSING', 'This file has no checksum.')],
        source: importSource(),
      }),
      'city-cup.json',
    );
    expect(vm.title).toBe('city-cup.json');
    expect(vm.scopeLabel).toBe('Tournament backup');
    expect(vm.importable).toBe(true);
    expect(vm.validity).toBe('File is valid · 1 tournament, 24 matches · 1 warning');
    expect(vm.source).toBe('Exported 28 Sep 2026 from Scorebook 1.0.0 on Android');
    expect(vm.versions).toBe('Backup format 1 · data version 1');
    expect(vm.previouslyImported).toBe('Imported before on 29 Sep 2026');
    expect(vm.conflicts).toHaveLength(1);
    expect(vm.policies).toHaveLength(3);
    expect(vm.localLoss).toEqual({ matches: 3, events: 240 });
  });

  it('hides versions when the preview carries no source details', () => {
    const vm = selectImportPreview(importPreview({ scope: { kind: 'full' } }), null);
    expect(vm.title).toBe('Backup file');
    expect(vm.scopeLabel).toBe('Full backup');
    expect(vm.source).toBeNull();
    expect(vm.versions).toBeNull();
    expect(vm.previouslyImported).toBeNull();
    expect(vm.policies).toEqual([]);
    expect(vm.validity).toBe('File is valid · 1 tournament, 24 matches');
  });

  it('omits a missing platform in the source line', () => {
    const vm = selectImportPreview(importPreview({ scope: { kind: 'match', matchId: 'm-1' }, source: importSource({ platform: null }) }), 'x.json');
    expect(vm.scopeLabel).toBe('Match backup');
    expect(vm.source).toBe('Exported 28 Sep 2026 from Scorebook 1.0.0');
  });

  it('makes an invalid file impossible to import and shows only its problems', () => {
    const vm = selectImportPreview(
      importPreview({
        ok: false,
        issues: [issue('error', 'INVALID_JSON', 'This file is not a Scorebook backup.')],
        conflicts: [conflict()],
      }),
      'notes.txt',
    );
    expect(vm.importable).toBe(false);
    expect(vm.validity).toBe("This file can't be imported. Nothing on this phone was changed.");
    expect(vm.issues).toHaveLength(1);
    expect(vm.contents).toEqual([]);
    expect(vm.conflicts).toEqual([]);
    expect(vm.policies).toEqual([]);
  });

  it('uses the chosen policy only when something already exists', () => {
    expect(DEFAULT_IMPORT_POLICY).toBe('skip_existing');
    expect(policyForImport(importPreview(), 'replace_existing')).toBe('skip_existing');
    expect(policyForImport(importPreview({ conflicts: [conflict()] }), 'replace_existing')).toBe('replace_existing');
    expect(policyForImport(importPreview({ conflicts: [conflict()] }), 'import_as_copy')).toBe('import_as_copy');
  });

  it('spells out the replacement and its losses before anything is overwritten', () => {
    expect(replaceConfirmation(importPreview({ conflicts: [conflict({ localOnly: { matches: 3, events: 240 } }), conflict({ id: 'x' })] }))).toBe(
      "2 items on this phone will be replaced by the version in the file. 3 matches and 240 scoring events that exist only on this phone will be deleted. This can't be undone.",
    );
    expect(replaceConfirmation(importPreview({ conflicts: [conflict()] }))).toBe(
      "1 item on this phone will be replaced by the version in the file. Nothing recorded only on this phone will be lost. This can't be undone.",
    );
  });
});

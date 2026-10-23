/** @jest-environment node */
import {
  checkResult,
  infoLines,
  NOT_AVAILABLE,
  pragmaText,
  rebuiltText,
  repairEntries,
  selectDiagnostics,
  technicalDetails,
  technicalLines,
  type DiagnosticsInput,
} from '../selectors/diagnostics';
import { exportedFileText, tournamentTargets } from '../selectors/exportTargets';
import { bootstrapReport, integrityReport, serviceError, tournamentItem } from './support/fixtures';

const BASE: DiagnosticsInput = {
  app: { version: '1.0.0', platform: 'android 35' },
  engine: { scoringProjection: 2, backupFormat: 1 },
  report: bootstrapReport({ schemaVersion: 3, projectionsRebuilt: 1200 }),
  check: null,
  errors: [],
};

describe('diagnostics view model (§86, W-X3)', () => {
  it('shows only the app version up front and keeps database, engine and backup internals as technical lines', () => {
    expect(infoLines(BASE).map((line) => [line.label, line.value, line.testID])).toEqual([['App version', '1.0.0', 'diag-text-app-version']]);
    expect(technicalLines(BASE).map((line) => [line.label, line.value, line.testID])).toEqual([
      ['Database version', '3', 'diag-text-schema-version'],
      ['Scoring engine', '2', 'diag-text-engine-version'],
      ['Backup format', '1', 'diag-text-backup-format'],
      ['Scores recalculated at start', '1,200 matches', 'diag-text-rebuilt'],
      ['Database settings', 'foreign_keys=1 journal_mode=wal synchronous=2', 'diag-text-pragmas'],
    ]);
    const unknown = technicalLines({ ...BASE, report: null });
    expect(unknown.map((line) => line.value)).toEqual(['Not available', '2', '1', 'Not available', 'Not available']);
    const vm = selectDiagnostics(BASE);
    expect(vm.info.map((line) => line.key)).toEqual(['app']);
    expect(vm.technical.map((line) => line.key)).toEqual(['schema', 'engine', 'backup', 'rebuilt', 'pragmas']);
    expect(rebuiltText(0)).toBe('None');
    expect(rebuiltText(1)).toBe('1 match');
  });

  it('shows the database pragmas the failure tests read, and says when start-up did not report them (AC-E1-02, FR-02b)', () => {
    expect(pragmaText({ foreignKeys: 1, journalMode: 'WAL', synchronous: 2 })).toBe('foreign_keys=1 journal_mode=wal synchronous=2');
    expect(pragmaText({ foreignKeys: 0, journalMode: 'delete', synchronous: 1 })).toBe('foreign_keys=0 journal_mode=delete synchronous=1');
    expect(pragmaText(null)).toBeNull();
    expect(pragmaText(undefined)).toBeNull();
    const pragmas = selectDiagnostics({ ...BASE, report: bootstrapReport({ pragmas: undefined }) }).technical.find((line) => line.key === 'pragmas');
    expect(pragmas?.value).toBe(NOT_AVAILABLE);
    expect(NOT_AVAILABLE).toBe('Not available');
  });

  it('lists matches needing repair from start-up, one row per match', () => {
    const report = bootstrapReport({
      integrityIssues: [
        { matchId: 'm-1', message: 'Lions v Tigers: event 214 cannot be replayed.' },
        { matchId: 'm-1', message: 'Event 215 refers to a missing batter.' },
        { matchId: 'm-2', message: 'Bulls v Bears: event 9 cannot be replayed.' },
      ],
    });
    const rows = repairEntries(report, null);
    expect(rows.map((row) => [row.matchId, row.title, row.testID])).toEqual([
      ['m-1', 'Lions v Tigers: event 214 cannot be replayed.', 'diag-row-repair-1'],
      ['m-2', 'Bulls v Bears: event 9 cannot be replayed.', 'diag-row-repair-2'],
    ]);
    expect(rows[0].detail).toBe('Event 215 refers to a missing batter. Fix it in the ball log.');
    expect(rows[1].detail).toBe('Fix it in the ball log.');
  });

  it('prefers the latest check over the start-up list', () => {
    const report = bootstrapReport({ integrityIssues: [{ matchId: 'm-1', message: 'Lions v Tigers: event 214.' }] });
    expect(repairEntries(report, integrityReport({ matchesNeedingRepair: [] }))).toEqual([]);
    const rows = repairEntries(report, integrityReport({ matchesNeedingRepair: ['m-3', 'm-1', 'm-3'] }));
    expect(rows.map((row) => [row.matchId, row.title])).toEqual([
      ['m-3', 'This match needs repair'],
      ['m-1', 'Lions v Tigers: event 214.'],
    ]);
    expect(repairEntries(null, null)).toEqual([]);
  });

  it('reports the data-link check as a short headline with at most one supporting line', () => {
    const clean = checkResult(integrityReport());
    expect(clean).toMatchObject({ healthy: true, headline: 'No problems found', supporting: null });
    expect(clean.checkedAt).toMatch(/^Last check: 30 Sep 2026, \d{2}:\d{2}$/);
    const oneRepair = checkResult(integrityReport({ matchesNeedingRepair: ['m-1'] }));
    expect(oneRepair).toMatchObject({ healthy: false, headline: '1 match needs repair', supporting: 'No broken links.' });
    const broken = checkResult(integrityReport({ foreignKeyViolations: 3, matchesNeedingRepair: ['m-1', 'm-2'] }));
    expect(broken).toMatchObject({ healthy: false, headline: '3 broken links found', supporting: '2 matches need repair. Share technical details for help.' });
    expect(checkResult(integrityReport({ foreignKeyViolations: 1 }))).toMatchObject({ headline: '1 broken link found', supporting: 'Share technical details for help.' });
    for (const result of [clean, oneRepair, broken]) {
      expect(result.headline.length).toBeLessThanOrEqual(40);
      expect((result.supporting ?? '').length).toBeLessThanOrEqual(80);
    }
  });

  it('combines everything for the screen', () => {
    const vm = selectDiagnostics({ ...BASE, check: integrityReport() });
    expect(vm.info).toHaveLength(1);
    expect(vm.technical).toHaveLength(5);
    expect(vm).not.toHaveProperty('safety');
    expect(vm).not.toHaveProperty('pragmas');
    expect(vm.repairs).toEqual([]);
    expect(vm.check?.healthy).toBe(true);
    expect(selectDiagnostics(BASE).check).toBeNull();
  });

  it('keeps codes and technical detail for the shared text only', () => {
    const input: DiagnosticsInput = {
      ...BASE,
      report: bootstrapReport({ integrityIssues: [{ matchId: 'm-1', message: 'Event 214 cannot be replayed.' }] }),
      check: integrityReport({ foreignKeyViolations: 2, matchesNeedingRepair: ['m-1'] }),
      errors: [
        { source: 'backup', error: serviceError({ code: 'IMPORT_INVALID', domainCode: 'SCHEMA_TOO_NEW', detail: 'schemaVersion 9 > 1' }) },
        { source: 'export', error: serviceError({ code: 'EXPORT_FAILED', message: "Couldn't share." }) },
      ],
    };
    const text = technicalDetails(input);
    expect(text.split('\n')).toEqual([
      'Scorebook diagnostics',
      'app_version=1.0.0',
      'platform=android 35',
      'schema_version=1',
      'scoring_projection_version=2',
      'backup_format_version=1',
      'projections_rebuilt_at_start=0',
      'pragmas=foreign_keys=1 journal_mode=wal synchronous=2',
      'resumable_matches=0',
      'integrity_issues_at_start=1',
      '- m-1: Event 214 cannot be replayed.',
      'integrity_check_at=2026-09-30T12:15:00.000Z',
      'foreign_key_violations=2',
      'matches_needing_repair=m-1',
      'errors=2',
      "- backup: IMPORT_INVALID/SCHEMA_TOO_NEW: Couldn't save the backup. Your data is safe. | schemaVersion 9 > 1",
      "- export: EXPORT_FAILED: Couldn't share.",
    ]);
    const empty = technicalDetails({ ...BASE, report: null });
    expect(empty).toContain('schema_version=unknown');
    expect(empty).toContain('pragmas=unknown');
    expect(empty).toContain('integrity_check=not run');
    expect(empty).toContain('errors=0');
    expect(technicalDetails({ ...BASE, check: integrityReport() })).toContain('matches_needing_repair=none');
  });
});

describe('export targets', () => {
  it('lists tournaments with their progress and positional test ids', () => {
    expect(tournamentTargets([tournamentItem(), tournamentItem({ id: 'tour-2', name: 'Spring Cup', season: null, teamCount: 1, fixturesDone: 0, fixturesTotal: 0 })])).toEqual([
      { id: 'tour-1', title: 'City Cup', detail: '2026 · 8 teams · 24/48 matches played', testID: 'backup-row-tournament-1' },
      { id: 'tour-2', title: 'Spring Cup', detail: '1 team · 0/0 matches played', testID: 'backup-row-tournament-2' },
    ]);
  });

  it('names the saved backup file', () => {
    expect(exportedFileText('file:///cache/exports/scorebook-backup-2026-09-30.json')).toBe('Saved as scorebook-backup-2026-09-30.json');
  });
});

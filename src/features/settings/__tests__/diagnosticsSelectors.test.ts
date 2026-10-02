/** @jest-environment node */
import { checkResult, infoLines, pragmaText, repairEntries, selectDiagnostics, technicalDetails, type DiagnosticsInput } from '../selectors/diagnostics';
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
  it('shows the app, database, engine and backup versions', () => {
    expect(infoLines(BASE).map((line) => [line.label, line.value, line.testID])).toEqual([
      ['App version', '1.0.0', 'diag-text-app-version'],
      ['Database version', '3', 'diag-text-schema-version'],
      ['Scoring engine version', '2', 'diag-text-engine-version'],
      ['Backup format', '1', 'diag-text-backup-format'],
      ['Results recalculated at start', '1,200', 'diag-text-rebuilt'],
      ['Database safety settings', 'foreign_keys=1 journal_mode=wal synchronous=2', 'diag-text-pragmas'],
    ]);
    const unknown = infoLines({ ...BASE, report: null });
    expect(unknown[1].value).toBe('Not available');
    expect(unknown[4].value).toBe('Not available');
    expect(unknown[5].value).toBe('Not available');
  });

  it('shows the database pragmas the failure tests read, and says when start-up did not report them (AC-E1-02, FR-02b)', () => {
    expect(pragmaText({ foreignKeys: 1, journalMode: 'WAL', synchronous: 2 })).toBe('foreign_keys=1 journal_mode=wal synchronous=2');
    expect(pragmaText({ foreignKeys: 0, journalMode: 'delete', synchronous: 1 })).toBe('foreign_keys=0 journal_mode=delete synchronous=1');
    expect(pragmaText(null)).toBeNull();
    expect(pragmaText(undefined)).toBeNull();
    const withoutPragmas = infoLines({ ...BASE, report: bootstrapReport({ pragmas: undefined }) });
    expect(withoutPragmas.find((line) => line.key === 'pragmas')?.value).toBe('Not available');
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
    expect(rows[0].detail).toBe('Event 215 refers to a missing batter. Open its ball log to correct the event that cannot be replayed.');
    expect(rows[1].detail).toBe('Open its ball log to correct the event that cannot be replayed.');
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

  it('explains the data-link check in plain language', () => {
    const clean = checkResult(integrityReport());
    expect(clean.healthy).toBe(true);
    expect(clean.message).toBe('All links between matches, teams and tournaments are intact.');
    expect(clean.checkedAt).toMatch(/^Last check: 30 Sep 2026, \d{2}:\d{2}$/);
    const oneRepair = checkResult(integrityReport({ matchesNeedingRepair: ['m-1'] }));
    expect(oneRepair.healthy).toBe(false);
    expect(oneRepair.message).toBe('All links between matches, teams and tournaments are intact. 1 match needs repair; open it below.');
    const broken = checkResult(integrityReport({ foreignKeyViolations: 3, matchesNeedingRepair: ['m-1', 'm-2'] }));
    expect(broken.healthy).toBe(false);
    expect(broken.message).toBe(
      'Found 3 broken links between matches, teams and tournaments. Nothing was changed. 2 matches need repair; open each one below. Share the technical details if you need help.',
    );
    expect(checkResult(integrityReport({ foreignKeyViolations: 1 })).message).toContain('Found 1 broken link between');
  });

  it('combines everything for the screen', () => {
    const vm = selectDiagnostics({ ...BASE, check: integrityReport() });
    expect(vm.info).toHaveLength(6);
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

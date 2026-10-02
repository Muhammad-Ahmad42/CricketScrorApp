/** @jest-environment node */
import { importReportText } from '../selectors/importReport';
import { importReport } from './support/fixtures';

describe('import report text', () => {
  it('reports what was imported and what was skipped', () => {
    expect(importReportText(importReport())).toBe('Imported 1 tournament, 24 matches. Skipped 2 teams already on this phone.');
  });

  it('accepts collection keys as well as aggregate kinds and merges them', () => {
    const text = importReportText(
      importReport({ imported: { matches: 2, match: 1, teams: 1, matchEvents: 480, matchPlayers: 44 }, skipped: {}, rebuiltMatches: 3 }),
    );
    expect(text).toBe('Imported 3 matches, 1 team. Recalculated 3 scorecards.');
  });

  it('says plainly when nothing new was imported', () => {
    expect(importReportText(importReport({ imported: { tournament: 0 }, skipped: { tournament: 1, team: 8 } }))).toBe(
      'Nothing new was imported. Everything in this file is already on this phone. Skipped 1 tournament, 8 teams already on this phone.',
    );
  });

  it('falls back to secondary collections and unknown keys in words', () => {
    expect(importReportText(importReport({ imported: { matchEvents: 1, auditEvents: 2, widgetThings: 4 }, skipped: {} }))).toBe(
      'Imported 2 change history entries, 1 scoring event, 4 widget things.',
    );
    expect(importReportText(importReport({ rebuiltMatches: 1, skipped: {} }))).toBe('Imported 1 tournament, 24 matches. Recalculated 1 scorecard.');
  });
});

/** @jest-environment node */
import { importReportLines } from '../selectors/importReport';
import { importReport } from './support/fixtures';

describe('import report lines', () => {
  it('leads with what was imported and puts what was skipped on one supporting line', () => {
    expect(importReportLines(importReport())).toEqual({
      headline: 'Imported 1 tournament, 24 matches',
      supporting: 'Skipped 2 teams already on this phone',
    });
  });

  it('accepts collection keys as well as aggregate kinds and merges them, without mentioning recalculation', () => {
    const lines = importReportLines(
      importReport({ imported: { matches: 2, match: 1, teams: 1, matchEvents: 480, matchPlayers: 44 }, skipped: {}, rebuiltMatches: 3 }),
    );
    expect(lines).toEqual({ headline: 'Imported 3 matches', supporting: 'Also 1 team' });
  });

  it('says plainly when nothing new was imported', () => {
    expect(importReportLines(importReport({ imported: { tournament: 0 }, skipped: { tournament: 1, team: 8 } }))).toEqual({
      headline: 'Nothing new was imported',
      supporting: 'Skipped 1 tournament, 8 teams already on this phone',
    });
  });

  it('falls back to secondary collections and unknown keys in words', () => {
    expect(importReportLines(importReport({ imported: { matchEvents: 1, auditEvents: 2, widgetThings: 4 }, skipped: {} }))).toEqual({
      headline: 'Imported 2 change history entries, 1 scoring event',
      supporting: 'Also 4 widget things',
    });
    expect(importReportLines(importReport({ rebuiltMatches: 1, skipped: {} }))).toEqual({ headline: 'Imported 1 tournament, 24 matches', supporting: null });
  });

  it('keeps the headline short enough to scan for a full backup, with the library on the supporting line', () => {
    const full = importReportLines(importReport({ imported: { tournament: 1, match: 8, team: 8, player: 64 }, skipped: {} }));
    expect(full).toEqual({ headline: 'Imported 1 tournament, 8 matches', supporting: 'Also 8 teams and 64 players' });
    expect(full.headline.length).toBeLessThanOrEqual(40);
    expect(importReportLines(importReport({ imported: { team: 2, player: 30, venue: 1 }, skipped: {} }))).toEqual({
      headline: 'Imported 2 teams, 30 players',
      supporting: 'Also 1 venue',
    });
  });
});

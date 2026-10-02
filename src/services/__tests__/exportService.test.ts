/** @jest-environment node */
import { expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';
import { createLeague, type League } from './support/league';
import { playFixture } from './support/tournament';

jest.setTimeout(60000);

describe('PDF export and sharing (§82, §83, FR-08)', () => {
  let harness: Harness;
  let league: League;
  let matchId: string;

  beforeAll(async () => {
    harness = await openHarness();
    league = await createLeague(harness.app);
    const fixture = await league.fixture('Lions', 'Tigers');
    const [sideA, sideB] = league.sidesOf(fixture);
    const played = await playFixture(
      harness.app,
      fixture,
      {
        battingFirst: league.sides.Lions,
        fieldingFirst: league.sides.Tigers,
        first: { line: { runs: 24, wickets: 1, balls: 12 } },
        second: { line: { runs: 18, wickets: 2, balls: 12 } },
      },
      sideA,
      sideB,
    );
    matchId = played.match.id;
  });

  it('prints a tournament scorecard with the pool standings', async () => {
    const result = expectOk(await harness.app.export.scorecardPdf(matchId));
    expect(result.fileUri).toMatch(/^file:\/\/\/cache\/exports\/Scorecard - .+\.pdf$/);
    expect(harness.app.deps.fileSystem.files.has(result.fileUri)).toBe(true);
    const html = harness.app.deps.printer.printed[harness.app.deps.printer.printed.length - 1];
    expect(html).toContain('Spring League');
    expect(html).toContain('Pool A standings');
    expect(html).toContain('won by 6 runs');
  });

  it('prints the tournament summary', async () => {
    const result = expectOk(await harness.app.export.tournamentPdf(league.tournamentId));
    expect(result.fileUri).toMatch(/Tournament - Spring League - \d{4}-\d{2}-\d{2}\.pdf$/);
    const html = harness.app.deps.printer.printed[harness.app.deps.printer.printed.length - 1];
    expect(html).toContain('Spring League');
    expect(html).toContain(league.sides.Lions.team.name);
  });

  it('FR-08a reports a failed print without touching the database', async () => {
    const revision = await harness.db.getFirstAsync('SELECT revision FROM tournaments');
    const audits = await rowCount(harness.db, 'audit_events');
    harness.app.deps.printer.failWith(new Error('WebView crashed'));
    const failure = expectFailure(await harness.app.export.scorecardPdf(matchId), 'EXPORT_FAILED');
    harness.app.deps.printer.failWith(null);
    expect(failure.message).toBe("Couldn't create the PDF. Your data is safe.");
    expect(failure.detail).toMatch(/WebView/);
    expect(await harness.db.getFirstAsync('SELECT revision FROM tournaments')).toEqual(revision);
    expect(await rowCount(harness.db, 'audit_events')).toBe(audits);
    expect(harness.app.deps.sharer.shared).toEqual([]);
  });

  it('keeps the printed file when it cannot be moved', async () => {
    harness.app.deps.fileSystem.failNext('move', new Error('EACCES'));
    const result = expectOk(await harness.app.export.scorecardPdf(matchId));
    expect(result.fileUri).toMatch(/^file:\/\/\/cache\/print-\d+\.pdf$/);
  });

  it('FR-08b shares files and reports an unavailable or failing share sheet', async () => {
    expectOk(await harness.app.export.share('file:///cache/exports/a.pdf', 'application/pdf'));
    expect(harness.app.deps.sharer.shared).toEqual([{ fileUri: 'file:///cache/exports/a.pdf', mimeType: 'application/pdf', dialogTitle: 'Share PDF' }]);
    harness.app.deps.sharer.failWith(new Error('Activity not found'));
    expectFailure(await harness.app.export.share('file:///cache/exports/a.pdf', 'application/pdf'), 'EXPORT_FAILED');
    harness.app.deps.sharer.failWith(null);
    harness.app.deps.sharer.setAvailable(false);
    const unavailable = expectFailure(await harness.app.export.share('file:///cache/exports/b.json', 'application/json'), 'EXPORT_FAILED');
    expect(unavailable.message).toMatch(/Sharing isn't available/);
  });

  it('reports a missing match', async () => {
    expectFailure(await harness.app.export.scorecardPdf('missing'), 'NOT_FOUND');
  });
});

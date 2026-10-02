/** @jest-environment node */
import { scoreRuns, validateLog } from '@/domain/scoring';
import { canonicalJson } from '@/export';
import { foreignKeyCheck } from '@/db';
import type { StandingRow, TournamentEvaluation } from '@/domain/types';
import { sha256Hex } from '../core/sha256';
import { expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';
import { createLeague, type League } from './support/league';
import { live, scoreAll } from './support/scoring';
import { standaloneWorld } from './support/standalone';
import { playFixture, type FixturePlay } from './support/tournament';

jest.setTimeout(90000);

interface Source {
  readonly harness: Harness;
  readonly league: League;
  readonly fileUri: string;
  readonly text: string;
  readonly exportId: string;
  readonly evaluation: TournamentEvaluation;
}

function quickPlay(league: League, batting: 'Lions' | 'Eagles', fielding: 'Tigers' | 'Hawks'): FixturePlay {
  return {
    battingFirst: league.sides[batting],
    fieldingFirst: league.sides[fielding],
    first: { line: { runs: 21, wickets: 2, balls: 12 } },
    second: { line: { runs: 17, wickets: 3, balls: 12 } },
  };
}

async function source(): Promise<Source> {
  const harness = await openHarness();
  const league = await createLeague(harness.app);
  for (const [a, b] of [
    ['Lions', 'Tigers'],
    ['Eagles', 'Hawks'],
  ] as const) {
    const fixture = await league.fixture(a, b);
    const [sideA, sideB] = league.sidesOf(fixture);
    await playFixture(harness.app, fixture, quickPlay(league, a, b), sideA, sideB);
  }
  const world = await standaloneWorld(harness.app);
  const standalone = await world.start(harness.app);
  await scoreAll(harness.app, standalone.match.id, [scoreRuns(1), scoreRuns(4)]);
  const exported = expectOk(await harness.app.backup.exportBackup({ kind: 'full' }));
  const text = harness.app.deps.fileSystem.files.get(exported.fileUri);
  if (text === undefined) {
    throw new Error('backup file missing');
  }
  return { harness, league, fileUri: exported.fileUri, text, exportId: exported.envelope.exportId, evaluation: (await league.evaluate()).evaluation };
}

function tableShape(evaluation: TournamentEvaluation, names: ReadonlyMap<string, string>): readonly (readonly [string, number, number | null])[] {
  return evaluation.stages[0].tables[0].rows.map((row: StandingRow) => [names.get(row.teamId ?? '') ?? '?', row.points, row.nrr] as const);
}

describe('backup export (§84)', () => {
  let data: Source;

  beforeAll(async () => {
    data = await source();
  });

  it('writes a checksummed file through a temporary name', async () => {
    expect(data.fileUri).toBe('file:///cache/exports/scorebook-backup-2026-05-01.json');
    expect([...data.harness.app.deps.fileSystem.files.keys()].some((uri) => uri.endsWith('.tmp'))).toBe(false);
    const envelope = JSON.parse(data.text);
    expect(envelope.format).toBe('scorebook-backup');
    expect(envelope.checksum).toBe(sha256Hex(canonicalJson(envelope.data)));
    expect(envelope.counts.matches).toBe(3);
  });

  it('names a tournament backup after the tournament', async () => {
    const exported = expectOk(await data.harness.app.backup.exportBackup({ kind: 'tournament', tournamentId: data.league.tournamentId }));
    expect(exported.fileUri).toMatch(/tournament-backup-spring-league-\d{4}-\d{2}-\d{2}\.json$/);
    expect(exported.envelope.data.matches).toHaveLength(2);
  });

  it('reports a failed write without leaving a temporary file', async () => {
    data.harness.app.deps.fileSystem.failNext('write', new Error('ENOSPC: no space left on device'));
    const failure = expectFailure(await data.harness.app.backup.exportBackup({ kind: 'full' }), 'EXPORT_FAILED');
    expect(failure.message).toBe("Couldn't save the backup. Your data is safe.");
    expect([...data.harness.app.deps.fileSystem.files.keys()].some((uri) => uri.endsWith('.tmp'))).toBe(false);
  });
});

describe('restore into an empty device (IT-BK-01)', () => {
  it('imports everything and evaluates exactly like the original', async () => {
    const data = await source();
    const target = await openHarness();
    target.app.deps.fileSystem.put('file:///picked/backup.json', data.text);
    const preview = expectOk(await target.app.backup.previewImport('file:///picked/backup.json'));
    expect(preview.ok).toBe(true);
    expect(preview.conflicts).toEqual([]);
    expect(preview.previouslyImportedAt).toBeNull();
    const report = expectOk(await target.app.backup.applyImport('file:///picked/backup.json', 'skip_existing'));
    expect(report.rebuiltMatches).toBe(3);
    expect(report.imported.matches).toBe(3);
    const evaluated = expectOk(await target.app.tournaments.evaluate(data.league.tournamentId));
    expect(evaluated.evaluation).toEqual(data.evaluation);
    expect(await foreignKeyCheck(target.db)).toEqual([]);
    const standalone = expectOk(await target.app.matches.list({ tournamentId: null }));
    expect(standalone).toHaveLength(1);
    expect((await live(target.app, standalone[0].id)).state.innings[0].runs).toBe(5);
    expect(await rowCount(target.db, 'audit_events', "action = 'backup_imported' AND entity_id = ?", [data.exportId])).toBe(1);
  });
});

describe('duplicate import into the same device (FR-06)', () => {
  let data: Source;

  beforeAll(async () => {
    data = await source();
  });

  it('FR-06a previews the conflicts per aggregate', async () => {
    const preview = expectOk(await data.harness.app.backup.previewImport(data.fileUri));
    expect(preview.ok).toBe(true);
    expect(preview.previouslyImportedAt).toBeNull();
    const tournament = preview.conflicts.find((conflict) => conflict.entity === 'tournament');
    expect(tournament).toMatchObject({ id: data.league.tournamentId, localOnly: { matches: 0, events: 0 } });
    expect(preview.conflicts.filter((conflict) => conflict.entity === 'team')).toHaveLength(6);
    expect(preview.conflicts.filter((conflict) => conflict.entity === 'match')).toHaveLength(1);
  });

  it('FR-06b skip_existing merges nothing and records the import', async () => {
    const before = await rowCount(data.harness.db, 'matches');
    const report = expectOk(await data.harness.app.backup.applyImport(data.fileUri, 'skip_existing'));
    expect(Object.values(report.imported).every((count) => count === 0)).toBe(true);
    expect(Object.values(report.skipped).some((count) => count > 0)).toBe(true);
    expect(await rowCount(data.harness.db, 'matches')).toBe(before);
    expect(await rowCount(data.harness.db, 'tournaments')).toBe(1);
    expect(await rowCount(data.harness.db, 'audit_events', "action = 'backup_imported' AND entity_type = 'backup' AND entity_id = ?", [data.exportId])).toBe(1);
  });

  it('FR-06c a second preview says the file was already imported', async () => {
    const preview = expectOk(await data.harness.app.backup.previewImport(data.fileUri));
    expect(preview.previouslyImportedAt).not.toBeNull();
  });

  it('FR-06d import_as_copy adds a separate tournament whose matches replay cleanly', async () => {
    expectOk(await data.harness.app.backup.previewImport(data.fileUri));
    const report = expectOk(await data.harness.app.backup.applyImport(data.fileUri, 'import_as_copy'));
    expect(report.rebuiltMatches).toBe(3);
    const tournaments = expectOk(await data.harness.app.tournaments.list());
    expect(tournaments.map((item) => item.name).sort()).toEqual(['Spring League', 'Spring League (copy)']);
    const copy = tournaments.find((item) => item.name === 'Spring League (copy)');
    if (copy === undefined) {
      throw new Error('copy missing');
    }
    const original = expectOk(await data.harness.app.tournaments.evaluate(data.league.tournamentId));
    const copied = expectOk(await data.harness.app.tournaments.evaluate(copy.id));
    const names = (snapshot: typeof original.snapshot) => new Map(snapshot.teams.map((view) => [view.team.id, view.team.name]));
    expect(tableShape(copied.evaluation, names(copied.snapshot))).toEqual(tableShape(original.evaluation, names(original.snapshot)));
    for (const item of expectOk(await data.harness.app.matches.list({}))) {
      const loaded = await live(data.harness.app, item.id);
      expect(validateLog(loaded.setup, loaded.events).ok).toBe(true);
    }
    expect(await foreignKeyCheck(data.harness.db)).toEqual([]);
  });

  it('FR-06e/f replace_existing reports local-only events first and then restores the file', async () => {
    const fixture = data.league;
    const { snapshot } = await fixture.evaluate();
    const played = snapshot.fixtures.find((entry) => entry.matchId !== null);
    if (played === undefined || played.matchId === null) {
      throw new Error('played fixture missing');
    }
    const loaded = await live(data.harness.app, played.matchId);
    const firstDelivery = loaded.events.find((event) => event.kind === 'delivery');
    if (firstDelivery === undefined || firstDelivery.kind !== 'delivery') {
      throw new Error('delivery missing');
    }
    const { id: _id, matchId: _matchId, seq: _seq, actionId: _actionId, recordedAt: _recordedAt, ...payload } = firstDelivery;
    const ops = [{ op: 'replace' as const, seq: firstDelivery.seq, with: [payload] }];
    const preview = expectOk(await data.harness.app.matches.previewHistoryEdit(played.matchId, ops));
    expectOk(await data.harness.app.matches.applyHistoryEdit(played.matchId, ops, 'Local correction', preview.baseFingerprint));
    const importPreview = expectOk(await data.harness.app.backup.previewImport(data.fileUri));
    const conflict = importPreview.conflicts.find((entry) => entry.entity === 'tournament' && entry.id === data.league.tournamentId);
    expect(conflict?.localOnly.events).toBeGreaterThan(0);
    expectOk(await data.harness.app.backup.applyImport(data.fileUri, 'replace_existing'));
    const restored = expectOk(await data.harness.app.tournaments.evaluate(data.league.tournamentId));
    expect(restored.evaluation).toEqual(data.evaluation);
    expect((await live(data.harness.app, played.matchId)).events.some((event) => event.id === firstDelivery.id)).toBe(true);
    expect(await foreignKeyCheck(data.harness.db)).toEqual([]);
  });
});

describe('invalid imports (FR-04)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await openHarness();
  });

  async function previewText(text: string) {
    const uri = `file:///picked/${harness.app.newId()}.json`;
    harness.app.deps.fileSystem.put(uri, text);
    return { uri, preview: expectOk(await harness.app.backup.previewImport(uri)) };
  }

  it('reports unreadable files as issues and refuses to apply them', async () => {
    const { uri, preview } = await previewText('{"format":');
    expect(preview.ok).toBe(false);
    expect(preview.issues[0].code).toBe('INVALID_JSON');
    expectFailure(await harness.app.backup.applyImport(uri, 'skip_existing'), 'IMPORT_INVALID');
    expect((await previewText(JSON.stringify({ format: 'other-app' }))).preview.issues[0].code).toBe('INVALID_FORMAT');
    expect(await rowCount(harness.db, 'audit_events')).toBe(0);
  });

  it('detects a file changed after export', async () => {
    const data = await source();
    const envelope = JSON.parse(data.text);
    envelope.data.teams[0].name = 'Changed';
    const { preview } = await previewText(JSON.stringify(envelope));
    expect(preview.ok).toBe(false);
    expect(preview.issues.map((issue) => issue.code)).toContain('CHECKSUM_MISMATCH');
  });

  it('needs a preview of the same file before applying', async () => {
    expectFailure(await harness.app.backup.applyImport('file:///never-previewed.json', 'skip_existing'), 'IMPORT_INVALID');
    expectFailure(await harness.app.backup.previewImport('file:///missing.json'), 'IMPORT_INVALID');
    const data = await source();
    const { uri } = await previewText(data.text);
    const envelope = JSON.parse(data.text);
    envelope.exportId = 'different-export';
    harness.app.deps.fileSystem.put(uri, JSON.stringify(envelope));
    expectFailure(await harness.app.backup.applyImport(uri, 'skip_existing'), 'CONFLICT');
  });
});

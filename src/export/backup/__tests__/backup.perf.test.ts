/** @jest-environment node */
import type { BackupData } from '@/domain/types';
import { emptyBackupData } from '../collections';
import { remapBackupIds } from '../remap';
import { IDS, tournamentBackup } from './fixtures/backupData';
import { buildBackupEnvelope, sealBackupEnvelope, serializeBackupEnvelope } from '../envelope';
import { parseBackupText } from '../parse';
import { EMPTY_LOCAL_DATA } from '../validation/context';
import { validateBackup } from '../validation/validate';
import { acceptAll, PARSE } from './support/files';
import { sha256Hex } from './support/sha256';

const COPIES = 1000;
const BUDGET_MS = 9000;

function standaloneMatch(): BackupData {
  const data = tournamentBackup();
  const match = data.matches.find((row) => row.id === IDS.match1);
  if (match === undefined) {
    throw new Error('fixture without match 1');
  }
  const teamIds = new Set<string>([IDS.lions, IDS.tigers]);
  return {
    ...emptyBackupData(),
    venues: data.venues.slice(0, 1),
    teams: data.teams.filter((row) => teamIds.has(row.id)),
    players: data.players.filter((row) => teamIds.has(row.teamId)),
    matches: [{ ...match, tournamentId: null, fixtureId: null }],
    matchPlayers: data.matchPlayers.filter((row) => row.matchId === IDS.match1),
    matchEvents: data.matchEvents.filter((row) => row.matchId === IDS.match1),
  };
}

function season(): BackupData {
  const base = standaloneMatch();
  const copies = Array.from({ length: COPIES }, (_, copy) => remapBackupIds(base, (entity, oldId) => `${oldId}~${copy}`));
  const merged = emptyBackupData();
  return {
    ...merged,
    venues: copies.flatMap((copy) => copy.venues),
    teams: copies.flatMap((copy) => copy.teams),
    players: copies.flatMap((copy) => copy.players),
    matches: copies.flatMap((copy) => copy.matches),
    matchPlayers: copies.flatMap((copy) => copy.matchPlayers),
    matchEvents: copies.flatMap((copy) => copy.matchEvents),
  };
}

describe('backup performance', () => {
  it(`exports, validates and remaps ${COPIES} matches well inside ${BUDGET_MS} ms`, () => {
    const data = season();
    const meta = { exportId: 'perf', exportedAt: '2026-09-30T13:41:00.000Z', schemaVersion: 1, appVersion: '1.0.0', platform: null, scope: { kind: 'full' as const } };
    const started = performance.now();
    const prepared = buildBackupEnvelope(data, meta);
    const built = performance.now();
    const checksum = sha256Hex(prepared.checksumInput);
    const hashed = performance.now();
    const text = serializeBackupEnvelope(sealBackupEnvelope(prepared.envelope, checksum));
    const parsed = parseBackupText(text, PARSE);
    const result = validateBackup(parsed, { checksum, local: EMPTY_LOCAL_DATA, logChecker: acceptAll });
    const validated = performance.now();
    const copy = remapBackupIds(data, (_entity, oldId) => `copy-${oldId}`);
    const remapped = performance.now();
    const measured = built - started + (remapped - hashed);
    console.log(
      `backup of ${data.matchEvents.length} events / ${text.length} chars: envelope ${Math.round(built - started)} ms, serialize + parse + validate ${Math.round(validated - hashed)} ms, remap ${Math.round(remapped - validated)} ms (test-only SHA-256 ${Math.round(hashed - built)} ms excluded)`,
    );
    expect(result.preview.ok).toBe(true);
    expect(result.preview.counts.matchEvents).toBe(COPIES * 12);
    expect(copy.matchEvents).toHaveLength(COPIES * 12);
    expect(measured).toBeLessThan(BUDGET_MS);
  });
});

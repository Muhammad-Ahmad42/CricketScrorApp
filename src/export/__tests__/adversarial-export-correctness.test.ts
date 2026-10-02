/** @jest-environment node */
import type {
  AuditEvent,
  BackupData,
  BackupIssue,
  FormatPreset,
  Match,
  MatchEvent,
  MatchPlayer,
  MatchSetup,
  MatchState,
  Player,
  StandingRow,
  StandingsTable,
  Team,
  TeamId,
  TournamentOverride,
  TournamentSnapshot,
  Venue,
} from '@/domain/types';
import { buildMatchSummary, formatResult } from '@/domain/scoring';
import { battersUnavailable, deepFreeze, endMatch, matchSetup, penalty, playScript, retire, type ScriptStep } from '@/domain/scoring/testing';
import { DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_STAGE_CONFIGS, DEFAULT_TIE_BREAKERS, evaluateTournament } from '@/domain/tournament';
import {
  EMPTY_LOCAL_DATA,
  backupFileName,
  buildBackupEnvelope,
  buildScorecardHtml,
  buildTournamentHtml,
  canonicalJson,
  collectIdReferences,
  escapeHtml,
  markAsCopies,
  parseBackupText,
  planLocalLookup,
  remapBackupIds,
  sealBackupEnvelope,
  serializeBackupEnvelope,
  validateBackup,
  validateBackupAsync,
  withoutAggregates,
  type BackupEntity,
  type BackupEnvelopeMeta,
  type BackupValidation,
  type LocalData,
  type ScorecardSource,
} from '@/export';

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return out;
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(text: string): string {
  const bytes = utf8(text);
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(length);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bits = bytes.length * 8;
  view.setUint32(length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(length - 4, bits >>> 0);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + k) >>> 0;
  }
  return h.map((word) => word.toString(16).padStart(8, '0')).join('');
}

const LIO: TeamId = 'team-lio';
const TIG: TeamId = 'team-tig';
const TRN = 'trn-spring';
const STG_GROUP = 'stg-group';
const STG_FINAL = 'stg-final';
const POOL_A = 'pool-a';
const VENUE = 'ven-gaddafi';
const M1 = 'match-0001';
const M2 = 'match-0002';
const STAMP = '2026-09-01T09:00:00.000Z';

interface Names {
  readonly lions: string;
  readonly tigers: string;
  readonly players: Readonly<Record<string, string>>;
}

const LION_ROSTER: readonly (readonly [string, string])[] = [
  ['plr-l01', 'Babar'],
  ['plr-l02', 'Fakhar'],
  ['plr-l03', 'Saim'],
  ['plr-l04', 'Imam'],
  ['plr-l05', 'Iftikhar'],
  ['plr-l06', 'Sarfraz'],
  ['plr-l07', 'Amir'],
  ['plr-l08', 'Wasim'],
  ['plr-l12', 'Usman'],
];

const TIGER_ROSTER: readonly (readonly [string, string])[] = [
  ['plr-t01', 'Rizwan'],
  ['plr-t02', 'Shan'],
  ['plr-t03', 'Saud'],
  ['plr-t04', 'Agha'],
  ['plr-t05', 'Azam'],
  ['plr-t06', 'Faheem'],
  ['plr-t07', 'Hassan'],
  ['plr-t08', 'Shaheen'],
  ['plr-t12', 'Ali'],
];

const PLAIN_NAMES: Names = {
  lions: 'Lions',
  tigers: 'Tigers',
  players: Object.fromEntries([...LION_ROSTER, ...TIGER_ROSTER]),
};

function squad(matchId: string, teamId: TeamId, roster: readonly (readonly [string, string])[], names: Names, keeperIndex: number): MatchPlayer[] {
  return roster.map(([playerId], index) => {
    const isSubstitute = index === roster.length - 1;
    return {
      matchId,
      playerId,
      teamId,
      name: names.players[playerId],
      jerseyNumber: index + 1,
      role: index === keeperIndex ? 'wicket_keeper' : 'batter',
      battingOrder: isSubstitute ? null : index + 1,
      isCaptain: index === 0,
      isWicketKeeper: index === keeperIndex,
      isSubstitute,
    };
  });
}

function setupFor(matchId: string, names: Names = PLAIN_NAMES): MatchSetup {
  return matchSetup({
    matchId,
    rules: { oversPerInnings: 3, maxOversPerBowler: 2, playersPerSide: 8, powerplays: [] },
    teamA: { id: LIO, name: names.lions, shortName: 'LIO' },
    teamB: { id: TIG, name: names.tigers, shortName: 'TIG' },
    players: [...squad(matchId, LIO, LION_ROSTER, names, 5), ...squad(matchId, TIG, TIGER_ROSTER, names, 0)],
    toss: { winnerTeamId: LIO, decision: 'bat' },
  });
}

const M1_SCRIPT: readonly ScriptStep[] = [
  'start:plr-l01:plr-l02:plr-t08',
  '1 4 wd W:c:plr-t12>plr-l03 . 2 lb1',
  '@plr-t07 nb 1',
  retire('plr-l01', 'retired_hurt', 'plr-l04'),
  'W:b>plr-l05 6 b1 . .',
  '@plr-t08 W:lbw>plr-l06 4 W:st:plr-t01>plr-l07',
  battersUnavailable([{ playerId: 'plr-l08', hurt: true }]),
  'start:plr-t01:plr-t02:plr-l07',
  '6 W:c:plr-l07>plr-t03 4 4 4 1',
  '@plr-l06 4',
  'end',
];

function renameEvents(matchId: string, events: readonly MatchEvent[]): MatchEvent[] {
  return events.map((event) => ({ ...event, id: `evt-${matchId}-${event.seq}`, actionId: `act-${matchId}-${event.actionId}` }) as MatchEvent);
}

interface Played {
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

function playM1(names: Names = PLAIN_NAMES): Played {
  const setup = setupFor(M1, names);
  const played = playScript(setup, M1_SCRIPT);
  return { setup, events: renameEvents(M1, played.events), state: played.state };
}

function playM2(names: Names = PLAIN_NAMES): Played {
  const setup = setupFor(M2, names);
  const played = playScript(setup, [endMatch({ type: 'walkover', winnerTeamId: TIG, reason: 'Lions could not raise a side' })]);
  return { setup, events: renameEvents(M2, played.events), state: played.state };
}

function matchRow(id: string, played: Played, extra: Partial<Match>): Match {
  const result = played.state.result;
  const winner = result !== null && 'winnerTeamId' in result ? result.winnerTeamId : null;
  return {
    id,
    title: 'Lions v Tigers',
    teamAId: LIO,
    teamBId: TIG,
    venueId: VENUE,
    scheduledDate: '2026-09-30',
    scheduledTime: '14:00',
    formatId: 'custom',
    rules: played.setup.rules,
    toss: played.setup.toss,
    status: 'completed',
    result,
    winnerTeamId: winner,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: '2026-09-30T09:00:00.000Z',
    completedAt: '2026-09-30T11:00:00.000Z',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function libraryPlayers(setup: MatchSetup): Player[] {
  return setup.players.map((player) => ({
    id: player.playerId,
    teamId: player.teamId,
    name: player.name,
    jerseyNumber: player.jerseyNumber,
    role: player.role,
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
  }));
}

function squadRows(setup: MatchSetup): BackupData['matchPlayers'][number][] {
  return setup.players.map((player) => ({
    matchId: player.matchId,
    playerId: player.playerId,
    teamId: player.teamId,
    battingOrder: player.battingOrder,
    isCaptain: player.isCaptain,
    isWicketKeeper: player.isWicketKeeper,
    isSubstitute: player.isSubstitute,
  }));
}

interface Fixture {
  readonly data: BackupData;
  readonly m1: Played;
  readonly m2: Played;
}

function buildFixture(names: Names = PLAIN_NAMES, venueName = 'Gaddafi Stadium', tournamentName = 'Spring Cup'): Fixture {
  const m1 = playM1(names);
  const m2 = playM2(names);
  const venue: Venue = { id: VENUE, name: venueName, location: 'Lahore', notes: null, createdAt: STAMP, updatedAt: STAMP, archivedAt: null };
  const teams: Team[] = [
    { id: LIO, name: names.lions, shortName: 'LIO', logoUri: null, captainId: 'plr-l01', createdAt: STAMP, updatedAt: STAMP, archivedAt: null },
    { id: TIG, name: names.tigers, shortName: 'TIG', logoUri: null, captainId: 'plr-t01', createdAt: STAMP, updatedAt: STAMP, archivedAt: null },
  ];
  const preset: FormatPreset = { id: 'preset-club8', label: 'Club 8s', description: '3 overs, 8 a side', builtin: false, rules: m1.setup.rules };
  const overrides: TournamentOverride[] = [
    {
      id: 'ovr-points',
      tournamentId: TRN,
      reason: 'Slow over rate',
      createdAt: STAMP,
      revokedAt: null,
      revokeReason: null,
      kind: 'points_adjustment',
      stageId: STG_GROUP,
      poolId: POOL_A,
      teamId: LIO,
      points: -1,
    },
    {
      id: 'ovr-tie',
      tournamentId: TRN,
      reason: 'Drawn by lots',
      createdAt: STAMP,
      revokedAt: STAMP,
      revokeReason: 'Entered by mistake',
      kind: 'tie_resolution',
      stageId: STG_GROUP,
      poolId: POOL_A,
      orderedTeamIds: [TIG, LIO],
      method: 'draw_lots',
      seed: 42,
    },
    {
      id: 'ovr-slot',
      tournamentId: TRN,
      reason: 'Organizer decision',
      createdAt: STAMP,
      revokedAt: STAMP,
      revokeReason: 'Entered by mistake',
      kind: 'slot_assignment',
      slotId: 'slot-a1',
      teamId: LIO,
    },
  ];
  const audit: AuditEvent[] = [
    {
      id: 'aud-created',
      tournamentId: TRN,
      matchId: null,
      action: 'tournament_created',
      entityType: 'tournament',
      entityId: TRN,
      summary: 'Created Spring Cup',
      previousValue: null,
      newValue: { name: 'Spring Cup', teamIds: [LIO, TIG] },
      reason: null,
      impact: null,
      createdAt: STAMP,
    },
    {
      id: 'aud-result',
      tournamentId: TRN,
      matchId: M1,
      action: 'result_recorded',
      entityType: 'match',
      entityId: M1,
      summary: 'Result recorded',
      previousValue: { winnerTeamId: LIO, fixtureId: 'fx-1' },
      newValue: { winnerTeamId: TIG },
      reason: 'Scorer error',
      impact: null,
      createdAt: STAMP,
    },
    {
      id: 'aud-deleted',
      tournamentId: TRN,
      matchId: null,
      action: 'fixture_deleted',
      entityType: 'fixture',
      entityId: 'fx-deleted-9',
      summary: 'Deleted Match 9',
      previousValue: { id: 'fx-deleted-9', sideA: LIO },
      newValue: null,
      reason: 'Duplicate fixture',
      impact: null,
      createdAt: STAMP,
    },
    {
      id: 'aud-backup',
      tournamentId: null,
      matchId: null,
      action: 'backup_imported',
      entityType: 'backup',
      entityId: 'exp-earlier-0001',
      summary: 'Imported a backup',
      previousValue: null,
      newValue: { policy: 'skip_existing' },
      reason: null,
      impact: null,
      createdAt: STAMP,
    },
  ];
  const data: BackupData = {
    venues: [venue],
    teams,
    players: libraryPlayers(m1.setup),
    tournaments: [
      {
        id: TRN,
        name: tournamentName,
        season: '2026',
        description: null,
        logoUri: null,
        organizer: 'Harris',
        contact: null,
        location: 'Lahore',
        notes: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        venueIds: [VENUE],
        structureKind: 'groups_knockout',
        status: 'active',
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
    tournamentRules: [
      {
        tournamentId: TRN,
        pointsSystem: DEFAULT_POINTS_SYSTEM,
        nrr: DEFAULT_NRR_CONFIG,
        tieBreakers: DEFAULT_TIE_BREAKERS,
        defaultFormatId: 'custom',
        defaultMatchRules: m1.setup.rules,
        updatedAt: STAMP,
      },
    ],
    tournamentTeams: [
      { id: 'tt-lio', tournamentId: TRN, teamId: LIO, seed: 1, status: 'active', replacedByTeamId: null, inheritsFromTeamId: null, joinedAt: STAMP },
      { id: 'tt-tig', tournamentId: TRN, teamId: TIG, seed: 2, status: 'active', replacedByTeamId: null, inheritsFromTeamId: null, joinedAt: STAMP },
    ],
    stages: [
      {
        id: STG_GROUP,
        tournamentId: TRN,
        name: 'Group stage',
        type: 'group',
        orderIndex: 0,
        status: 'active',
        config: DEFAULT_STAGE_CONFIGS.group,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
      {
        id: STG_FINAL,
        tournamentId: TRN,
        name: 'Final',
        type: 'knockout',
        orderIndex: 1,
        status: 'pending',
        config: {
          ...DEFAULT_STAGE_CONFIGS.knockout,
          entryRules: [{ kind: 'top_per_pool', sourceStageId: STG_GROUP, count: 2, fromPosition: 1 }],
          decidesChampion: true,
        },
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
    pools: [{ id: POOL_A, stageId: STG_GROUP, name: 'Pool A', orderIndex: 0, legs: null }],
    slots: [
      {
        id: 'slot-a1',
        stageId: STG_FINAL,
        index: 0,
        role: 'entry',
        label: 'A1',
        source: { kind: 'pool_position', stageId: STG_GROUP, poolId: POOL_A, position: 1 },
        seed: 1,
      },
      {
        id: 'slot-a2',
        stageId: STG_FINAL,
        index: 1,
        role: 'entry',
        label: 'A2',
        source: { kind: 'pool_position', stageId: STG_GROUP, poolId: POOL_A, position: 2 },
        seed: 2,
      },
    ],
    poolEntries: [
      { id: 'pe-lio', poolId: POOL_A, stageId: STG_GROUP, side: { kind: 'team', teamId: LIO }, seed: 1 },
      { id: 'pe-tig', poolId: POOL_A, stageId: STG_GROUP, side: { kind: 'team', teamId: TIG }, seed: 2 },
    ],
    fixtures: [
      {
        id: 'fx-1',
        tournamentId: TRN,
        stageId: STG_GROUP,
        poolId: POOL_A,
        matchNumber: 1,
        label: null,
        round: 1,
        leg: null,
        bracket: null,
        isFinal: false,
        sideA: { kind: 'team', teamId: LIO },
        sideB: { kind: 'team', teamId: TIG },
        scheduledDate: '2026-09-30',
        scheduledTime: '14:00',
        venueId: VENUE,
        status: 'completed',
        matchId: M1,
        matchSides: { teamAId: LIO, teamBId: TIG },
        formatId: null,
        matchRules: null,
        notes: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
      {
        id: 'fx-2',
        tournamentId: TRN,
        stageId: STG_FINAL,
        poolId: null,
        matchNumber: 2,
        label: 'Final',
        round: null,
        leg: null,
        bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' },
        isFinal: true,
        sideA: { kind: 'slot', slotId: 'slot-a1' },
        sideB: { kind: 'slot', slotId: 'slot-a2' },
        scheduledDate: '2026-10-01',
        scheduledTime: '14:00',
        venueId: VENUE,
        status: 'scheduled',
        matchId: null,
        matchSides: null,
        formatId: null,
        matchRules: null,
        notes: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
    matches: [
      matchRow(M1, m1, { tournamentId: TRN, fixtureId: 'fx-1' }),
      matchRow(M2, m2, { title: 'Lions v Tigers (friendly)', toss: null, startedAt: null }),
    ],
    matchPlayers: [...squadRows(m1.setup), ...squadRows(m2.setup)],
    matchEvents: [...m1.events, ...m2.events],
    overrides,
    auditEvents: audit,
    templates: [],
    formatPresets: [preset],
    settings: null,
  };
  return { data, m1, m2 };
}

const META: BackupEnvelopeMeta = {
  exportId: 'exp-0001',
  exportedAt: '2026-09-30T13:41:00.000Z',
  schemaVersion: 1,
  appVersion: '1.0.0',
  platform: 'android',
  scope: { kind: 'full' },
};

function exportText(data: BackupData, meta: BackupEnvelopeMeta = META): string {
  const prepared = buildBackupEnvelope(data, meta);
  return serializeBackupEnvelope(sealBackupEnvelope(prepared.envelope, sha256Hex(prepared.checksumInput)));
}

function rawExport(data: BackupData, meta: BackupEnvelopeMeta = META): string {
  const envelope = JSON.parse(exportText(buildFixture().data, meta)) as Json;
  envelope.data = data;
  envelope.checksum = sha256Hex(canonicalJson(data));
  return JSON.stringify(envelope);
}

function importText(text: string, local: LocalData = EMPTY_LOCAL_DATA): BackupValidation {
  const parsed = parseBackupText(text, { latestSchemaVersion: 1 });
  return validateBackup(parsed, { checksum: parsed.ok ? sha256Hex(parsed.checksumInput) : null, local });
}

function errorsOf(validation: BackupValidation): readonly BackupIssue[] {
  return validation.preview.issues.filter((issue) => issue.severity === 'error');
}

function describeIssues(validation: BackupValidation): string {
  return validation.preview.issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path ?? '-'} ${issue.message}`).join('\n');
}

type Json = { [key: string]: unknown };

function pathTokens(path: string): (string | number)[] {
  return Array.from(path.matchAll(/([^.[\]]+)|\[(\d+)\]/g), (match) => (match[2] !== undefined ? Number(match[2]) : match[1]));
}

function getAt(root: unknown, path: string): unknown {
  return pathTokens(path).reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
}

function setAt(root: unknown, path: string, value: unknown): void {
  const keys = pathTokens(path);
  const parent = keys.slice(0, -1).reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
  (parent as Record<string | number, unknown>)[keys[keys.length - 1]] = value;
}

function tamper(data: BackupData, edit: (draft: Json) => void): BackupData {
  const draft = JSON.parse(JSON.stringify(data)) as Json;
  edit(draft);
  return draft as unknown as BackupData;
}

function rows(draft: Json, key: keyof BackupData): Json[] {
  return draft[key] as Json[];
}

function eventIndex(data: BackupData, predicate: (event: MatchEvent) => boolean): number {
  const index = data.matchEvents.findIndex(predicate);
  if (index < 0) {
    throw new Error('fixture event not found');
  }
  return index;
}

const ENTITY_NAMES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  ndash: '–',
  mdash: '—',
  times: '×',
  bull: '•',
  hellip: '…',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(parseInt(body.slice(1), 10));
    }
    return ENTITY_NAMES[body.toLowerCase()] ?? whole;
  });
}

function withoutStyles(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function visibleText(html: string): string {
  return decodeEntities(withoutStyles(html).replace(/<head[\s\S]*?<\/head>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tableRows(html: string): string[][] {
  return Array.from(withoutStyles(html).matchAll(/<tr[\s\S]*?<\/tr>/gi), (row) =>
    Array.from(row[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi), (cell) => cellText(cell[1])),
  );
}

function rowWith(html: string, ...needles: string[]): string[] {
  const found = tableRows(html).find((cells) => needles.every((needle) => cells.some((cell) => cell.includes(needle))));
  if (found === undefined) {
    throw new Error(`no table row contains ${needles.join(' + ')}`);
  }
  return found;
}

function containsSequence(cells: readonly string[], sequence: readonly string[]): boolean {
  for (let start = 0; start + sequence.length <= cells.length; start += 1) {
    if (sequence.every((token, offset) => cells[start + offset] === token)) {
      return true;
    }
  }
  return false;
}

function styleBlocks(html: string): string[] {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]);
}

const CSS_STRING = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;

function standingRow(position: number, teamId: TeamId, won: number, lost: number, points: number, nrr: number): StandingRow {
  return {
    position,
    sharedPosition: false,
    side: { kind: 'team', teamId },
    slotLabel: null,
    teamId,
    provisional: false,
    membership: 'active',
    played: 1,
    won,
    lost,
    tied: 0,
    noResult: 0,
    points,
    pointsAdjustment: 0,
    bonusPoints: 0,
    runsScored: won === 1 ? 23 : 22,
    ballsFaced: won === 1 ? 7 : 18,
    runsConceded: won === 1 ? 22 : 23,
    ballsBowled: won === 1 ? 18 : 7,
    oversFaced: won === 1 ? 7 / 6 : 3,
    oversBowled: won === 1 ? 3 : 7 / 6,
    runRate: null,
    nrr,
    matchesRemaining: 0,
    form: [won === 1 ? 'W' : 'L'],
    qualification: null,
    tieBreak: null,
  };
}

function scorecardSource(played: Played, options: { readonly tournament: boolean; readonly names?: Names; readonly venueName?: string; readonly title?: string; readonly tournamentName?: string }): ScorecardSource {
  const names = options.names ?? PLAIN_NAMES;
  const table: StandingsTable = {
    stageId: STG_GROUP,
    poolId: POOL_A,
    rows: [standingRow(1, TIG, 1, 0, 2, 2.345), standingRow(2, LIO, 0, 1, 0, -2.345)],
    tieBreakers: DEFAULT_TIE_BREAKERS,
    complete: true,
    unresolvedTies: [],
    provisionalTies: [],
  };
  return {
    match: matchRow(M1, played, {
      title: options.title ?? 'Lions v Tigers',
      tournamentId: options.tournament ? TRN : null,
      fixtureId: options.tournament ? 'fx-1' : null,
    }),
    setup: played.setup,
    state: played.state,
    venue: { name: options.venueName ?? 'Gaddafi Stadium', location: 'Lahore' },
    tournament: options.tournament
      ? { tournamentName: options.tournamentName ?? 'Spring Cup', stageName: 'Group stage', poolName: 'Pool A', fixtureLabel: 'Match 1' }
      : null,
    standings: options.tournament
      ? [
          {
            title: 'Pool A standings',
            table,
            teams: [
              { id: LIO, name: names.lions, shortName: 'LIO' },
              { id: TIG, name: names.tigers, shortName: 'TIG' },
            ],
          },
        ]
      : [],
  };
}

const GENERATED_AT = '2026-09-30T14:05:00.000+05:00';

describe('test support sanity', () => {
  it('sha256 helper matches the FIPS 180-2 vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('the scripted match is accepted by the engine and ends "Tigers won by 6 wickets (11 balls left)"', () => {
    const { setup, state } = playM1();
    expect(state.result).not.toBeNull();
    expect(formatResult(state.result!, setup.teams)).toBe('Tigers won by 6 wickets (11 balls left)');
  });
});

describe('scorecard PDF (§83) for a scripted match', () => {
  const played = playM1();
  const html = buildScorecardHtml(scorecardSource(played, { tournament: true }), { generatedAt: GENERATED_AT });
  const text = visibleText(html);

  it('shows the title block: match title, both teams, venue, date, tournament/stage/pool/fixture context', () => {
    expect(text).toContain('Lions v Tigers');
    expect(text).toContain('Lions');
    expect(text).toContain('Tigers');
    expect(text).toContain('Gaddafi Stadium');
    expect(text).toContain('30 Sep 2026');
    expect(text).toContain('Spring Cup');
    expect(text).toContain('Group stage');
    expect(text).toContain('Pool A');
  });

  it('shows the toss and the engine result line verbatim', () => {
    expect(text).toMatch(/toss/i);
    expect(text).toMatch(/Lions[^.]{0,60}\bbat/i);
    expect(text).toContain('Tigers won by 6 wickets (11 balls left)');
  });

  it('batting card: "c sub (Ali) b Shaheen", "retired hurt", "absent hurt", lbw/stumped/bowled texts and figures', () => {
    const fakhar = rowWith(html, 'Fakhar', 'c sub (Ali) b Shaheen');
    expect(fakhar).toEqual(expect.arrayContaining(['4', '2', '200.00']));
    const babar = rowWith(html, 'Babar', 'retired hurt');
    expect(babar).toEqual(expect.arrayContaining(['1', '100.00']));
    const saim = rowWith(html, 'Saim', 'not out');
    expect(saim.some((cell) => /^3\*?$/.test(cell))).toBe(true);
    expect(saim).toEqual(expect.arrayContaining(['7', '42.86']));
    expect(rowWith(html, 'Imam', 'b Hassan')).toEqual(expect.arrayContaining(['0', '1']));
    expect(rowWith(html, 'Iftikhar', 'lbw b Shaheen')).toEqual(expect.arrayContaining(['6', '3', '200.00']));
    expect(rowWith(html, 'Sarfraz', 'st Rizwan b Shaheen')).toEqual(expect.arrayContaining(['4', '2']));
    expect(text).toMatch(/Wasim[^A-Za-z]{0,20}absent hurt/);
  });

  it('never gives the substitute fielder a batting row and never shows the retirement as a wicket', () => {
    expect(tableRows(html).some((cells) => cells[0] === 'Usman' || cells[0] === 'Ali')).toBe(false);
    expect(text).not.toMatch(/\d-\d+ \(Babar,/);
  });

  it('extras line uses the documented breakdown "b 1, lb 1, w 1, nb 1, p 0" and totals 4', () => {
    expect(text).toContain('b 1, lb 1, w 1, nb 1, p 0');
    expect(text).toMatch(/Extras[\s\S]{0,60}\)\s4\b/);
  });

  it('total shows 22 from 2.3 overs at RR 8.80', () => {
    expect(text).toMatch(/Total[\s\S]{0,60}\b22\/4\b/);
    expect(text).toMatch(/Total \(all out, 2\.3 ov/);
    expect(text).toContain('8.80');
  });

  it('fall of wickets lists every wicket with score, batter and over.ball', () => {
    expect(text).toMatch(/fall of wickets/i);
    for (const entry of ['1-6 (Fakhar, 0.3)', '2-11 (Imam, 1.2)', '3-18 (Iftikhar, 2.1)', '4-22 (Sarfraz, 2.3)']) {
      expect(text).toContain(entry);
    }
  });

  it('bowling card: Shaheen 1.3-0-12-3 with 1 wide, Hassan 1-0-8-1 with 1 no-ball, c & b credited in the chase', () => {
    const shaheen = rowWith(html, 'Shaheen', '1.3');
    expect(containsSequence(shaheen, ['1.3', '0', '12', '3', '8.00'])).toBe(true);
    const hassan = rowWith(html, 'Hassan', '8.00');
    expect(containsSequence(hassan, ['1', '0', '8', '1', '8.00'])).toBe(true);
    expect(rowWith(html, 'Rizwan', 'c & b Amir')).toEqual(expect.arrayContaining(['6', '2']));
    const amir = rowWith(html, 'Amir', '19');
    expect(containsSequence(amir, ['1', '0', '19', '1'])).toBe(true);
  });

  it('partnerships: a retirement splits the second-wicket stand (Babar & Saim 5, Saim & Imam 0) and the first stand is 6', () => {
    expect(text).toMatch(/partnership/i);
    expect(rowWith(html, 'Babar', 'Fakhar')).toEqual(expect.arrayContaining(['6', '3']));
    expect(rowWith(html, 'Babar', 'Saim')).toEqual(expect.arrayContaining(['5', '4']));
    expect(rowWith(html, 'Saim', 'Iftikhar')).toEqual(expect.arrayContaining(['7', '5']));
  });

  it('over-by-over summary uses the ballToken grammar with runs and score at the end of each over', () => {
    expect(text).toContain('1 Shaheen 1 4 WD W 0 2 LB1 9 1 9/1');
    expect(text).toContain('2 Hassan NB 1 W 6 B1 0 0 9 1 18/2');
    expect(text).toContain('3 Shaheen W 4 W 4 2 22/4');
    expect(text).toContain('1 Amir 6 W 4 4 4 1 19 1 19/1');
    expect(text).toContain('2 Sarfraz 4 4 0 23/1');
  });

  it('shows the pool standings after the match with signed NRR', () => {
    expect(text).toContain('Pool A standings');
    const tigers = rowWith(html, 'Tigers', '+2.345');
    expect(tigers).toContain('2');
    expect(rowWith(html, 'Lions', '-2.345')).toBeDefined();
  });

  it('carries the "Scored with Scorebook" footer with the generation date', () => {
    expect(html).toContain('Scorebook');
    expect(html).toContain('30 Sep 2026');
  });

  it('a standalone match has no standings section', () => {
    const standalone = buildScorecardHtml(scorecardSource(played, { tournament: false }), { generatedAt: GENERATED_AT });
    expect(visibleText(standalone)).not.toMatch(/standings/i);
    expect(visibleText(standalone)).not.toContain('+2.345');
    expect(visibleText(standalone)).toContain('Tigers won by 6 wickets (11 balls left)');
  });

  it('is a self-contained A4 print document: no scripts, no external resources, no theme media queries, repeating headers', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/prefers-color-scheme/i);
    expect(html).toMatch(/@page[^{]*\{[^}]*size:\s*A4/i);
    expect(html).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/i);
  });

  it('is deterministic for identical input', () => {
    expect(buildScorecardHtml(scorecardSource(played, { tournament: true }), { generatedAt: GENERATED_AT })).toBe(html);
  });
});

const HOSTILE: Names = {
  lions: '<script>alert("lions")</script>',
  tigers: 'Tigers & Co </td></tr></table><marquee>x</marquee>',
  players: {
    ...PLAIN_NAMES.players,
    'plr-t12': '<img src=x onerror=alert(1)>',
    'plr-t08': "Sha\"heen' onmouseover='alert(2)",
    'plr-l02': '<!-- Fakhar',
    'plr-l08': 'شاہین 🏏',
  },
};

const HOSTILE_VENUE = '"><svg onload=alert(3)>';
const HOSTILE_TITLE = '</style><script>alert(5)</script> & "Final"\n}body{display:none}';

function assertNoInjection(html: string): void {
  const lower = html.toLowerCase();
  for (const tag of ['<script', '<img', '<svg', '<iframe', '<marquee', '<!--', '<h1>pwn']) {
    expect(lower).not.toContain(tag);
  }
  expect((lower.match(/<\/style/g) ?? []).length).toBe((lower.match(/<style/g) ?? []).length);
  const body = withoutStyles(html);
  expect(body).not.toContain("onmouseover='");
  expect(body).not.toContain('"><svg');
}

function assertSafeCss(html: string): void {
  for (const block of styleBlocks(html)) {
    const outsideStrings = block.replace(CSS_STRING, '""');
    expect(outsideStrings).not.toMatch(/alert\(/);
    expect(outsideStrings).not.toMatch(/display:\s*none/);
    expect(outsideStrings).not.toContain('Tigers & Co');
    for (const literal of block.match(CSS_STRING) ?? []) {
      expect(literal).not.toMatch(/[\r\n]/);
      expect(literal).not.toMatch(/&(?:amp|lt|gt|quot|#39|#x27|apos);/);
    }
  }
}

describe('scorecard PDF escapes hostile names (§83, BACKUP_RESTORE §9.2)', () => {
  const played = playM1(HOSTILE);
  const html = buildScorecardHtml(
    scorecardSource(played, {
      tournament: true,
      names: HOSTILE,
      venueName: HOSTILE_VENUE,
      title: HOSTILE_TITLE,
      tournamentName: '<h1>pwn</h1> Cup',
    }),
    { generatedAt: GENERATED_AT },
  );

  it('no user-supplied markup survives as markup', () => {
    assertNoInjection(html);
  });

  it('the running footer / @page CSS cannot be broken out of and never shows HTML entities', () => {
    assertSafeCss(html);
  });

  it('hostile names are still displayed literally (escaped, not dropped)', () => {
    const text = visibleText(html);
    expect(text).toContain('<script>alert("lions")</script>');
    expect(text).toContain('c sub (<img src=x onerror=alert(1)>) b Sha"heen\' onmouseover=\'alert(2)');
    expect(text).toContain('"><svg onload=alert(3)>');
    expect(text).toContain('<h1>pwn</h1> Cup');
    expect(text).toContain('شاہین 🏏');
    expect(text).toContain('Tigers & Co </td></tr></table><marquee>x</marquee> won by 6 wickets (11 balls left)');
  });

  it('escapeHtml escapes & < > " \' and round-trips through an entity decoder', () => {
    const raw = `<a href="x" title='y'>Tom & Jerry</a>`;
    const escaped = escapeHtml(raw);
    expect(escaped).not.toMatch(/[<>"']/);
    expect(escaped).not.toMatch(/&(?!(?:amp|lt|gt|quot|#39|#x27|apos);)/);
    expect(decodeEntities(escaped)).toBe(raw);
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('tournament PDF (§82) escapes hostile names', () => {
  function snapshotOf(data: BackupData, played: Played): TournamentSnapshot {
    const summary = buildMatchSummary(played.setup, played.state, { completedAt: '2026-09-30T11:00:00.000Z' });
    if (summary === null) {
      throw new Error('scripted match must be terminal');
    }
    return {
      version: '1',
      tournament: data.tournaments[0],
      rules: data.tournamentRules[0],
      teams: data.tournamentTeams.map((membership) => ({ membership, team: data.teams.find((team) => team.id === membership.teamId)! })),
      stages: data.stages,
      pools: data.pools,
      poolEntries: data.poolEntries,
      slots: data.slots,
      fixtures: data.fixtures,
      summaries: { [M1]: summary },
      staleSummaryMatchIds: [],
      overrides: data.overrides,
    };
  }

  it('plain tournament summary lists the tournament, pool standings, the scheduled final and the result', () => {
    const fixture = buildFixture();
    const snapshot = snapshotOf(fixture.data, fixture.m1);
    const html = buildTournamentHtml(
      { snapshot, evaluation: evaluateTournament(snapshot), stats: null, venues: [{ id: VENUE, name: 'Gaddafi Stadium' }], playerNames: PLAIN_NAMES.players },
      { generatedAt: GENERATED_AT },
    );
    const text = visibleText(html);
    expect(text).toContain('Spring Cup');
    expect(text).toContain('Pool A');
    expect(text).toContain('Tigers');
    expect(text).toContain('Final');
    expect(text).toContain('Tigers won by 6 wickets (11 balls left)');
    expect(html).not.toMatch(/<script/i);
  });

  it('statistics leaders and records escape hostile player names and details', () => {
    const fixture = buildFixture(HOSTILE, HOSTILE_VENUE, HOSTILE_TITLE);
    const snapshot = snapshotOf(fixture.data, fixture.m1);
    const record = (playerId: string | null, value: number, detail: string) => ({ matchId: M1, teamId: TIG, playerId, value, detail });
    const player = (playerId: string, teamId: TeamId, runs: number, wickets: number) => ({
      playerId,
      teamId,
      matches: 1,
      innings: 1,
      runs,
      ballsFaced: 5,
      notOuts: 1,
      battingAverage: null,
      strikeRate: 340,
      fours: 4,
      sixes: 0,
      highestScore: { runs, notOut: true, matchId: M1 },
      ballsBowled: 9,
      runsConceded: 12,
      wickets,
      economy: 8,
      bestBowling: wickets > 0 ? { wickets, runs: 12, matchId: M1 } : null,
    });
    const html = buildTournamentHtml(
      {
        snapshot,
        evaluation: evaluateTournament(snapshot),
        stats: {
          totalMatches: 2,
          completedMatches: 1,
          totalRuns: 45,
          totalWickets: 5,
          totalFours: 7,
          totalSixes: 3,
          highestTeamScore: record(null, 23, '<b>23/1</b>'),
          highestIndividualScore: record('plr-t12', 17, '17* <i>(5)</i>'),
          bestBowling: record('plr-t08', 3, '3/12 <u>x</u>'),
          mostSixes: record('plr-t12', 1, '1'),
          mostFours: record('plr-t12', 4, '4'),
          highestPartnership: null,
          teams: [],
          players: [player('plr-t12', TIG, 17, 0), player('plr-t08', TIG, 0, 3)],
        },
        venues: [{ id: VENUE, name: HOSTILE_VENUE }],
        playerNames: HOSTILE.players,
      },
      { generatedAt: GENERATED_AT },
    );
    assertNoInjection(html);
    assertSafeCss(html);
    expect(html.toLowerCase()).not.toMatch(/<(?:i|u)>/);
    expect(visibleText(html)).toContain('<img src=x onerror=alert(1)>');
  });

  it('hostile tournament, team and venue names are escaped everywhere, including the CSS footer', () => {
    const fixture = buildFixture(HOSTILE, HOSTILE_VENUE, HOSTILE_TITLE);
    const snapshot = snapshotOf(fixture.data, fixture.m1);
    const html = buildTournamentHtml(
      { snapshot, evaluation: evaluateTournament(snapshot), stats: null, venues: [{ id: VENUE, name: HOSTILE_VENUE }], playerNames: HOSTILE.players },
      { generatedAt: GENERATED_AT },
    );
    assertNoInjection(html);
    assertSafeCss(html);
    expect(visibleText(html)).toContain('<script>alert("lions")</script>');
  });
});

describe('canonical JSON and envelope determinism (BACKUP_RESTORE §2)', () => {
  it('sorts keys by UTF-16 code unit order at every level, keeps array order, drops undefined, no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' }, u: undefined })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson({ a: 1, B: 2, _: 3 })).toBe('{"B":2,"_":3,"a":1}');
  });

  it('orders integer-like keys as strings, not numerically as JSON.stringify would', () => {
    expect(canonicalJson({ a: 3, 9: 'nine', 10: 'ten' })).toBe('{"10":"ten","9":"nine","a":3}');
  });

  it('orders astral-plane keys by UTF-16 code units (surrogates before U+FF5E)', () => {
    expect(canonicalJson({ '\uff5e': 1, '\ud83d\ude00': 2 })).toBe('{"\ud83d\ude00":2,"\uff5e":1}');
  });

  it('prints numbers and strings exactly as JSON.stringify does', () => {
    expect(canonicalJson({ n: 1e21, m: 0.1, z: -0, s: 'a\u2028b"\\', lone: '\ud800' })).toBe(
      `{"lone":${JSON.stringify('\ud800')},"m":0.1,"n":1e+21,"s":${JSON.stringify('a\u2028b"\\')},"z":0}`,
    );
  });

  it('identical data exported twice is byte-identical, and the checksum input is the canonical JSON of data', () => {
    const { data } = buildFixture();
    expect(exportText(data)).toBe(exportText(buildFixture().data));
    const prepared = buildBackupEnvelope(data, META);
    expect(prepared.checksumInput).toBe(canonicalJson(data));
    expect(prepared.envelope.checksum).toBeNull();
  });

  it('the same data with a different key insertion order has the same checksum input', () => {
    const { data } = buildFixture();
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(reverseKeys);
      }
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reverseKeys(inner)]));
      }
      return value;
    };
    const shuffled = reverseKeys(data) as BackupData;
    expect(buildBackupEnvelope(shuffled, META).checksumInput).toBe(buildBackupEnvelope(data, META).checksumInput);
  });

  it('envelope header carries format, versions, exportId, app, scope and counts equal to array lengths', () => {
    const { data } = buildFixture();
    const envelope = JSON.parse(exportText(data)) as Json;
    expect(envelope.format).toBe('scorebook-backup');
    expect(envelope.formatVersion).toBe(1);
    expect(envelope.exportId).toBe('exp-0001');
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.exportedAt).toBe('2026-09-30T13:41:00.000Z');
    expect(envelope.app).toEqual({ name: 'Scorebook', version: '1.0.0', platform: 'android' });
    expect(envelope.scope).toEqual({ kind: 'full' });
    expect(envelope.checksum).toMatch(/^[0-9a-f]{64}$/);
    const counts = envelope.counts as Record<string, number>;
    for (const key of Object.keys(data) as (keyof BackupData)[]) {
      const value = data[key];
      expect(counts[key]).toBe(Array.isArray(value) ? value.length : value === null ? 0 : 1);
    }
  });

  it('round-trips exactly: export → parse → validate gives ok and the original data', () => {
    const { data } = buildFixture();
    const validation = importText(exportText(data));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
    expect(validation.envelope?.data).toEqual(data);
    expect(validation.preview.scope).toEqual({ kind: 'full' });
    expect(validation.preview.counts.matchEvents).toBe(data.matchEvents.length);
  });

  it('async validation reports progress per match and agrees with the synchronous preview', async () => {
    const { data } = buildFixture();
    const text = exportText(data);
    const parsed = parseBackupText(text, { latestSchemaVersion: 1 });
    const checksum = parsed.ok ? sha256Hex(parsed.checksumInput) : null;
    const progress: [number, number][] = [];
    const asyncResult = await validateBackupAsync(parsed, { checksum, local: EMPTY_LOCAL_DATA }, { pause: () => Promise.resolve(), onProgress: (done, total) => progress.push([done, total]) });
    expect(asyncResult.preview).toEqual(validateBackup(parsed, { checksum, local: EMPTY_LOCAL_DATA }).preview);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toEqual([2, 2]);
  });

  it('file names follow §84 and hostile labels cannot escape the exports folder', () => {
    expect(backupFileName({ kind: 'full' }, '2026-09-30T13:41:00.000Z')).toBe('scorebook-backup-2026-09-30.json');
    expect(backupFileName({ kind: 'tournament', tournamentId: TRN }, '2026-09-30T13:41:00.000Z', 'Spring Cup')).toBe('tournament-backup-spring-cup-2026-09-30.json');
    expect(backupFileName({ kind: 'match', matchId: M1 }, '2026-09-30T13:41:00.000Z', 'Lions v Tigers')).toBe('match-backup-lions-v-tigers-2026-09-30.json');
    for (const label of ['../../etc/passwd', 'C:\\Windows\\cup', 'Cup: "A" <B> | C? *', '🏏🏏', '   ', 'con']) {
      const name = backupFileName({ kind: 'tournament', tournamentId: TRN }, '2026-09-30T13:41:00.000Z', label);
      expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(name).not.toContain('..');
      expect(name.endsWith('2026-09-30.json')).toBe(true);
      expect(name.startsWith('tournament-backup-')).toBe(true);
    }
  });
});

describe('import validation rejects hostile files (FR-04, BACKUP_RESTORE §4)', () => {
  const fixture = buildFixture();
  const validText = exportText(fixture.data);

  function withEnvelope(edit: (envelope: Json) => void): string {
    const envelope = JSON.parse(validText) as Json;
    edit(envelope);
    return JSON.stringify(envelope);
  }

  it.each([
    ['truncated JSON', '{"format":'],
    ['zero bytes', ''],
    ['binary garbage', '\u0000\u0001PK\u0003\u0004'],
  ])('%s → INVALID_JSON, import impossible', (_label, text) => {
    const validation = importText(text);
    expect(validation.preview.ok).toBe(false);
    expect(validation.envelope).toBeNull();
    expect(validation.preview.issues.map((issue) => issue.code)).toContain('INVALID_JSON');
  });

  it.each([['null'], ['[]'], ['42'], ['"scorebook-backup"'], ['{}']])('valid JSON that is not an envelope (%s) is refused without throwing', (text) => {
    const validation = importText(text);
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).length).toBeGreaterThan(0);
  });

  it('format "other-app" → INVALID_FORMAT', () => {
    const validation = importText(withEnvelope((envelope) => (envelope.format = 'other-app')));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_FORMAT');
  });

  it.each([[99], [2]])('formatVersion %p → UNSUPPORTED_FORMAT_VERSION', (version) => {
    const validation = importText(withEnvelope((envelope) => (envelope.formatVersion = version)));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('UNSUPPORTED_FORMAT_VERSION');
  });

  it.each([['"1"'], [1.5], [0], [-1], [null]])('malformed formatVersion %p is refused', (version) => {
    const validation = importText(withEnvelope((envelope) => (envelope.formatVersion = version === '"1"' ? '1' : version)));
    expect(validation.preview.ok).toBe(false);
  });

  it('schemaVersion newer than the app → SCHEMA_TOO_NEW; equal is accepted', () => {
    const tooNew = importText(withEnvelope((envelope) => (envelope.schemaVersion = 99)));
    expect(tooNew.preview.ok).toBe(false);
    expect(errorsOf(tooNew).map((issue) => issue.code)).toContain('SCHEMA_TOO_NEW');
    expect(importText(validText).preview.ok).toBe(true);
  });

  it('one value changed after export with the checksum kept → CHECKSUM_MISMATCH error', () => {
    const edited = withEnvelope((envelope) => setAt(envelope, 'data.teams[0].name', 'Lions (edited)'));
    const validation = importText(edited);
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('CHECKSUM_MISMATCH');
  });

  it('a reordered but otherwise identical file (whitespace, key order) still matches its checksum', () => {
    const envelope = JSON.parse(validText) as Json;
    const reordered = JSON.stringify({ data: envelope.data, ...envelope }, null, 2);
    const validation = importText(reordered);
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('checksum null → CHECKSUM_MISSING warning and ok', () => {
    const validation = importText(withEnvelope((envelope) => (envelope.checksum = null)));
    const missing = validation.preview.issues.filter((issue) => issue.code === 'CHECKSUM_MISSING');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('warning');
    expect(validation.preview.ok).toBe(true);
  });

  it('a counts header that disagrees with the arrays is only a warning', () => {
    const validation = importText(withEnvelope((envelope) => setAt(envelope, 'counts.teams', 99)));
    expect(validation.preview.ok).toBe(true);
    expect(validation.preview.issues.some((issue) => issue.severity === 'warning' && (issue.path ?? '').includes('counts'))).toBe(true);
  });

  it('a __proto__ key in the file cannot pollute Object.prototype', () => {
    const text = validText.replace('"venues":[{', '"venues":[{"__proto__":{"polluted":"yes"},');
    const validation = importText(text);
    expect(({} as Json).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(validation.preview).toBeDefined();
  });

  it.each([
    ['matches[0].scheduledDate', '31/12/2026'],
    ['matches[0].scheduledDate', '2026-02-30'],
    ['matches[0].scheduledTime', '24:30'],
    ['matches[0].status', 'finished'],
    ['matches[0].rules', 'T20'],
    ['teams[0].name', 42],
    ['players[0].jerseyNumber', 'seven'],
    ['tournaments[0].status', 'running'],
    ['fixtures[0].matchNumber', 1.5],
  ])('INVALID_VALUE with path data.%s', (path, value) => {
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, path, value))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => issue.code === 'INVALID_VALUE' && (issue.path ?? '').startsWith(`data.${path}`))).toBe(true);
  });

  it.each([[-1], [1.5], ['2'], [null]])('a delivery with runsRun %p → INVALID_VALUE at data.matchEvents[k].runsRun', (value) => {
    const k = eventIndex(fixture.data, (event) => event.kind === 'delivery' && event.runsRun === 2);
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${k}].runsRun`, value))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => issue.path === `data.matchEvents[${k}].runsRun`)).toBe(true);
  });

  it('an unknown event kind is INVALID_VALUE, not a crash', () => {
    const k = eventIndex(fixture.data, (event) => event.kind === 'strike_swapped' || event.kind === 'bowler_selected');
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${k}].kind`, 'teleport'))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => (issue.path ?? '').startsWith(`data.matchEvents[${k}]`))).toBe(true);
  });

  it.each([
    ['a collection is missing', (draft: Json) => delete (draft as { teams?: unknown }).teams, 'data.teams'],
    ['a collection is an object', (draft: Json) => (draft.teams = { 0: {} }), 'data.teams'],
    ['a row is null', (draft: Json) => (draft.venues = [null]), 'data.venues[0]'],
  ])('%s → INVALID_VALUE, no throw', (_label, edit, path) => {
    const validation = importText(rawExport(tamper(fixture.data, edit)));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => (issue.path ?? '').startsWith(path))).toBe(true);
  });
});

describe('identity and reference checks (FR-04h…j, BACKUP_RESTORE §4 stages 6–8)', () => {
  const fixture = buildFixture();

  function check(data: BackupData, local: LocalData = EMPTY_LOCAL_DATA): BackupValidation {
    return importText(exportText(data), local);
  }

  it('the untouched fixture is a valid, importable backup', () => {
    const validation = check(fixture.data);
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('the same team id twice → DUPLICATE_ID', () => {
    const validation = check(tamper(fixture.data, (draft) => rows(draft, 'teams').push({ ...rows(draft, 'teams')[0], name: 'Lions B' })));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('DUPLICATE_ID');
  });

  it('two events of one match with the same seq → DUPLICATE_ID', () => {
    const validation = check(
      tamper(fixture.data, (draft) => {
        const events = rows(draft, 'matchEvents');
        events.splice(6, 0, { ...events[5], id: 'evt-duplicate-seq' });
      }),
    );
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('DUPLICATE_ID');
  });

  it('the same event id in two different matches → DUPLICATE_ID', () => {
    const m2Index = eventIndex(fixture.data, (event) => event.matchId === M2);
    const validation = check(tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${m2Index}].id`, fixture.data.matchEvents[0].id)));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('DUPLICATE_ID');
  });

  it('a player listed twice in one squad is refused before it reaches the database', () => {
    const validation = check(tamper(fixture.data, (draft) => rows(draft, 'matchPlayers').push({ ...rows(draft, 'matchPlayers')[0] })));
    expect(validation.preview.ok).toBe(false);
  });

  it('two rule rows for one tournament are refused', () => {
    const validation = check(tamper(fixture.data, (draft) => rows(draft, 'tournamentRules').push({ ...rows(draft, 'tournamentRules')[0] })));
    expect(validation.preview.ok).toBe(false);
  });

  const sub = eventIndex(fixture.data, (event) => event.kind === 'delivery' && event.wicket !== null && event.wicket.fielderIds.includes('plr-t12'));
  const delivery = eventIndex(fixture.data, (event) => event.kind === 'delivery' && event.matchId === M1);
  const absentees = eventIndex(fixture.data, (event) => event.kind === 'innings_ended');
  const walkover = eventIndex(fixture.data, (event) => event.kind === 'match_ended' && event.matchId === M2);
  const inningsStart = eventIndex(fixture.data, (event) => event.kind === 'innings_started');

  it.each([
    ['matches[0].teamAId', 'team-ghost'],
    [`matchEvents[${sub}].wicket.fielderIds[0]`, 'plr-ghost'],
    [`matchEvents[${delivery}].bowlerId`, 'plr-ghost'],
    [`matchEvents[${delivery}].strikerId`, 'plr-ghost'],
    [`matchEvents[${absentees}].absentees[0].playerId`, 'plr-ghost'],
    [`matchEvents[${walkover}].outcome.winnerTeamId`, 'team-ghost'],
    [`matchEvents[${inningsStart}].battingTeamId`, 'team-ghost'],
    ['slots[0].source.poolId', 'pool-ghost'],
    ['slots[1].source.stageId', 'stg-ghost'],
    ['stages[1].config.entryRules[0].sourceStageId', 'stg-ghost'],
    ['poolEntries[0].side.teamId', 'team-ghost'],
    ['fixtures[1].sideA.slotId', 'slot-ghost'],
    ['fixtures[0].venueId', 'ven-ghost'],
    ['overrides[0].teamId', 'team-ghost'],
    ['overrides[1].orderedTeamIds[1]', 'team-ghost'],
    ['overrides[2].teamId', 'team-ghost'],
    ['tournaments[0].venueIds[0]', 'ven-ghost'],
    ['teams[0].captainId', 'plr-ghost'],
    ['players[0].teamId', 'team-ghost'],
    ['matchPlayers[0].playerId', 'plr-ghost'],
    ['auditEvents[1].matchId', 'match-ghost'],
  ])('dangling %s → MISSING_REFERENCE at that path', (path, value) => {
    const validation = check(tamper(fixture.data, (draft) => setAt(draft, path, value)));
    expect(validation.preview.ok).toBe(false);
    const missing = errorsOf(validation).filter((issue) => issue.code === 'MISSING_REFERENCE');
    expect(missing.map((issue) => issue.path)).toContain(`data.${path}`);
  });

  it('a direct-entry rule naming an unknown team → MISSING_REFERENCE inside stage config', () => {
    const validation = check(
      tamper(fixture.data, (draft) => setAt(draft, 'stages[1].config.entryRules', [{ kind: 'direct_entry', teamIds: [LIO, 'team-ghost'] }])),
    );
    expect(errorsOf(validation).filter((issue) => issue.code === 'MISSING_REFERENCE').map((issue) => issue.path)).toContain(
      'data.stages[1].config.entryRules[0].teamIds[1]',
    );
  });

  it('library references may resolve on the device (venue known locally is fine)', () => {
    const edited = tamper(fixture.data, (draft) => setAt(draft, 'matches[1].venueId', 'ven-local'));
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { venue: new Set(['ven-local']) } };
    const validation = check(edited, local);
    expect(errorsOf(validation).filter((issue) => issue.code === 'MISSING_REFERENCE')).toEqual([]);
    expect(check(edited).preview.ok).toBe(false);
  });

  it('tournament-internal references must resolve inside the file even if the id exists locally', () => {
    const edited = tamper(fixture.data, (draft) => setAt(draft, 'matches[1].tournamentId', 'trn-local'));
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { tournament: new Set(['trn-local']) } };
    const validation = check(edited, local);
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.path)).toContain('data.matches[1].tournamentId');
  });

  it('a fielder who exists on the device but is not in the match squad is still refused', () => {
    const edited = tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${sub}].wicket.fielderIds[0]`, 'plr-local'));
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { player: new Set(['plr-local']) } };
    const validation = check(edited, local);
    expect(validation.preview.ok).toBe(false);
  });

  it('an audit entry about a deleted row is history, not a dangling reference', () => {
    const validation = check(fixture.data);
    expect(validation.preview.issues.filter((issue) => (issue.path ?? '').startsWith('data.auditEvents'))).toEqual([]);
  });

  it('status "completed" without a result → INVALID_VALUE on that match', () => {
    const validation = check(tamper(fixture.data, (draft) => setAt(draft, 'matches[1].result', null)));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => issue.code === 'INVALID_VALUE' && (issue.path ?? '').startsWith('data.matches[1]'))).toBe(true);
  });

  it('a fixture side that is not a tournament member → INVALID_VALUE', () => {
    const edited = tamper(fixture.data, (draft) => {
      rows(draft, 'teams').push({ ...rows(draft, 'teams')[0], id: 'team-eag', name: 'Eagles', captainId: null });
      setAt(draft, 'fixtures[1].sideB', { kind: 'team', teamId: 'team-eag' });
    });
    const validation = check(edited);
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).some((issue) => (issue.path ?? '').startsWith('data.fixtures[1]'))).toBe(true);
  });

  it('a second final in the same stage → INVALID_VALUE', () => {
    const edited = tamper(fixture.data, (draft) => {
      const final = rows(draft, 'fixtures')[1];
      rows(draft, 'fixtures').push({ ...final, id: 'fx-3', matchNumber: 3, bracket: { kind: 'main', round: 1, position: 1, roundName: 'Final' } });
    });
    expect(check(edited).preview.ok).toBe(false);
  });

  it('a standalone match pointing at a tournament fixture → INVALID_VALUE', () => {
    const validation = check(tamper(fixture.data, (draft) => setAt(draft, 'matches[1].fixtureId', 'fx-2')));
    expect(validation.preview.ok).toBe(false);
  });

  it('a squad row for a team that is not playing the match → INVALID_VALUE', () => {
    const edited = tamper(fixture.data, (draft) => {
      rows(draft, 'teams').push({ ...rows(draft, 'teams')[0], id: 'team-eag', name: 'Eagles', captainId: null });
      rows(draft, 'players').push({ ...rows(draft, 'players')[0], id: 'plr-e01', teamId: 'team-eag', name: 'Eagle One' });
      rows(draft, 'matchPlayers').push({ ...rows(draft, 'matchPlayers')[0], playerId: 'plr-e01', teamId: 'team-eag', battingOrder: null });
    });
    expect(check(edited).preview.ok).toBe(false);
  });
});

describe('event log checks (FR-04k, BACKUP_RESTORE §4 stage 9)', () => {
  const fixture = buildFixture();

  it('a seq gap → INVALID_EVENT_LOG naming the match', () => {
    const gap = eventIndex(fixture.data, (event) => event.matchId === M1 && event.seq === 10);
    const validation = importText(exportText(tamper(fixture.data, (draft) => rows(draft, 'matchEvents').splice(gap, 1))));
    expect(validation.preview.ok).toBe(false);
    const logIssues = errorsOf(validation).filter((issue) => issue.code === 'INVALID_EVENT_LOG');
    expect(logIssues.length).toBeGreaterThan(0);
    expect(logIssues.some((issue) => issue.message.includes('Lions v Tigers'))).toBe(true);
  });

  it('a bowler from the batting side → INVALID_EVENT_LOG', () => {
    const k = eventIndex(fixture.data, (event) => event.kind === 'bowler_selected' && event.matchId === M1);
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${k}].bowlerId`, 'plr-l03'))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_EVENT_LOG');
  });

  it('a delivery recorded after match_ended → INVALID_EVENT_LOG', () => {
    const last = fixture.m1.events[fixture.m1.events.length - 1];
    const extra = { ...fixture.m1.events.find((event) => event.kind === 'delivery')!, id: 'evt-late', seq: last.seq + 1, actionId: 'act-late' };
    const validation = importText(
      exportText(
        tamper(fixture.data, (draft) => {
          const events = rows(draft, 'matchEvents');
          events.splice(fixture.m1.events.length, 0, extra as unknown as Json);
        }),
      ),
    );
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_EVENT_LOG');
  });

  it('a hand-edited striker stamp is repaired with a warning, the import stays possible and the data is corrected', () => {
    const k = eventIndex(fixture.data, (event) => event.kind === 'delivery' && event.matchId === M1 && event.runsRun === 2);
    const original = fixture.data.matchEvents[k];
    if (original.kind !== 'delivery' || original.nonStrikerId === null) {
      throw new Error('fixture delivery expected');
    }
    const edited = tamper(fixture.data, (draft) => {
      setAt(draft, `matchEvents[${k}].strikerId`, original.nonStrikerId);
      setAt(draft, `matchEvents[${k}].nonStrikerId`, original.strikerId);
    });
    const validation = importText(exportText(edited));
    expect(describeIssues(validation)).not.toMatch(/^error/m);
    expect(validation.preview.ok).toBe(true);
    expect(validation.preview.issues.some((issue) => issue.severity === 'warning')).toBe(true);
    const repaired = validation.envelope?.data.matchEvents.find((event) => event.id === original.id);
    expect(repaired).toMatchObject({ strikerId: original.strikerId, nonStrikerId: original.nonStrikerId });
  });
});

describe('duplicate import and conflicts (FR-06, BACKUP_RESTORE §5)', () => {
  const fixture = buildFixture();
  const text = exportText(fixture.data);
  const m1EventIds = fixture.m1.events.map((event) => event.id);
  const allPlayerIds = fixture.data.players.map((player) => player.id);

  function sameDevice(overrides: Partial<LocalData> = {}): LocalData {
    return {
      existingIds: {
        tournament: new Set([TRN]),
        match: new Set([M1, M2]),
        team: new Set([LIO, TIG]),
        player: new Set(allPlayerIds),
        venue: new Set([VENUE]),
        preset: new Set(['preset-club8']),
      },
      footprint: (entity, id) => {
        if (entity === 'tournament' && id === TRN) {
          return { matchIds: [M1], events: m1EventIds.length, eventIds: m1EventIds };
        }
        if (entity === 'match' && id === M2) {
          return { matchIds: [M2], events: fixture.m2.events.length, eventIds: fixture.m2.events.map((event) => event.id) };
        }
        return null;
      },
      previouslyImportedAt: null,
      ...overrides,
    };
  }

  it('planLocalLookup asks about every aggregate root in the file', () => {
    const parsed = parseBackupText(text, { latestSchemaVersion: 1 });
    const plan = planLocalLookup(parsed);
    expect(plan.tournament).toContain(TRN);
    expect(plan.match).toContain(M2);
    expect(plan.team).toEqual(expect.arrayContaining([LIO, TIG]));
    expect(plan.venue).toContain(VENUE);
    expect(plan.player).toEqual(expect.arrayContaining(allPlayerIds));
  });

  it('re-importing into the same device: ok, one conflict per aggregate with zero local-only data', () => {
    const validation = importText(text, sameDevice());
    expect(validation.preview.ok).toBe(true);
    expect(validation.preview.previouslyImportedAt).toBeNull();
    const conflicts = validation.preview.conflicts;
    expect(conflicts.find((conflict) => conflict.entity === 'tournament')).toEqual({ entity: 'tournament', id: TRN, label: 'Spring Cup', localOnly: { matches: 0, events: 0 } });
    expect(conflicts.find((conflict) => conflict.entity === 'match' && conflict.id === M2)).toMatchObject({ localOnly: { matches: 0, events: 0 } });
    expect(conflicts.filter((conflict) => conflict.entity === 'team').map((conflict) => conflict.label).sort()).toEqual(['Lions', 'Tigers']);
    expect(conflicts.filter((conflict) => conflict.entity === 'player')).toHaveLength(allPlayerIds.length);
    expect(conflicts.find((conflict) => conflict.entity === 'venue')).toMatchObject({ id: VENUE, label: 'Gaddafi Stadium' });
    expect(validation.preview.issues.filter((issue) => issue.code === 'ID_CONFLICT').every((issue) => issue.severity === 'warning')).toBe(true);
    expect(validation.preview.issues.some((issue) => issue.code === 'ID_CONFLICT')).toBe(true);
  });

  it('a tournament match is never reported as its own conflict (the unit is the aggregate)', () => {
    const conflicts = importText(text, sameDevice()).preview.conflicts;
    expect(conflicts.some((conflict) => conflict.entity === 'match' && conflict.id === M1)).toBe(false);
  });

  it('a second import shows when the same exportId was imported before', () => {
    const validation = importText(text, sameDevice({ previouslyImportedAt: '2026-09-12T10:00:00.000Z' }));
    expect(validation.preview.previouslyImportedAt).toBe('2026-09-12T10:00:00.000Z');
  });

  it('local-only matches and deliveries that replace_existing would destroy are counted exactly', () => {
    const localOnlyIds = Array.from({ length: 20 }, (_, index) => `evt-local-${index}`);
    const validation = importText(
      text,
      sameDevice({
        footprint: (entity, id) =>
          entity === 'tournament' && id === TRN ? { matchIds: [M1, 'match-local-9'], events: m1EventIds.length + 20, eventIds: [...m1EventIds, ...localOnlyIds] } : null,
      }),
    );
    expect(validation.preview.conflicts.find((conflict) => conflict.entity === 'tournament')?.localOnly).toEqual({ matches: 1, events: 20 });
  });

  it('a local history edit (new event ids in a match the file also has) shows local-only events > 0 (FR-06e)', () => {
    const edited = [...m1EventIds.slice(2), 'evt-edit-1', 'evt-edit-2', 'evt-edit-3'];
    const validation = importText(
      text,
      sameDevice({ footprint: (entity, id) => (entity === 'tournament' && id === TRN ? { matchIds: [M1], events: edited.length, eventIds: edited } : null) }),
    );
    expect(validation.preview.conflicts.find((conflict) => conflict.entity === 'tournament')?.localOnly).toEqual({ matches: 0, events: 3 });
  });

  it('with the repository footprint (counts only, no event ids) extra local deliveries are still counted', () => {
    const validation = importText(
      text,
      sameDevice({ footprint: (entity, id) => (entity === 'tournament' && id === TRN ? { matchIds: [M1], events: m1EventIds.length + 3 } : null) }),
    );
    expect(validation.preview.conflicts.find((conflict) => conflict.entity === 'tournament')?.localOnly).toEqual({ matches: 0, events: 3 });
  });

  it('an empty device has no conflicts and no ID_CONFLICT issues', () => {
    const validation = importText(text);
    expect(validation.preview.conflicts).toEqual([]);
    expect(validation.preview.issues.some((issue) => issue.code === 'ID_CONFLICT')).toBe(false);
  });

  it('skip_existing transform drops the whole tournament aggregate and leaves no dangling reference', () => {
    const kept = withoutAggregates(fixture.data, { tournamentIds: new Set([TRN]), matchIds: new Set() });
    expect(kept.tournaments).toEqual([]);
    expect(kept.tournamentRules).toEqual([]);
    expect(kept.tournamentTeams).toEqual([]);
    expect(kept.stages).toEqual([]);
    expect(kept.pools).toEqual([]);
    expect(kept.slots).toEqual([]);
    expect(kept.poolEntries).toEqual([]);
    expect(kept.fixtures).toEqual([]);
    expect(kept.overrides).toEqual([]);
    expect(kept.matches.map((match) => match.id)).toEqual([M2]);
    expect(kept.matchEvents.every((event) => event.matchId === M2)).toBe(true);
    expect(kept.matchPlayers.every((row) => row.matchId === M2)).toBe(true);
    expect(kept.auditEvents.some((event) => event.tournamentId === TRN)).toBe(false);
    expect(kept.teams).toEqual(fixture.data.teams);
    const validation = importText(exportText(kept));
    expect(describeIssues(validation)).toBe('');
  });

  it('import_as_copy naming: tournament and standalone match get " (copy)", tournament matches keep their titles', () => {
    const copies = markAsCopies(fixture.data, { tournamentIds: new Set([TRN]), matchIds: new Set([M2]) });
    expect(copies.tournaments[0].name).toBe('Spring Cup (copy)');
    expect(copies.matches.find((match) => match.id === M2)?.title).toBe('Lions v Tigers (friendly) (copy)');
    expect(copies.matches.find((match) => match.id === M1)?.title).toBe('Lions v Tigers');
    expect(fixture.data.tournaments[0].name).toBe('Spring Cup');
  });
});

describe('remapBackupIds / collectIdReferences (U-BKP-01…04, BACKUP_RESTORE §6)', () => {
  const fixture = buildFixture();
  const data = deepFreeze(fixture.data);
  const snapshotBefore = JSON.stringify(data);

  const calls = new Map<string, number>();
  const forward = new Map<string, string>();
  let counter = 0;
  const idFor = (entity: BackupEntity, oldId: string): string => {
    const key = `${entity}|${oldId}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    counter += 1;
    const next = `new-${String(counter).padStart(5, '0')}`;
    forward.set(key, next);
    return next;
  };
  const remapped = remapBackupIds(data, idFor);
  const references = collectIdReferences(data);

  function rowKeys(source: BackupData): Map<string, string> {
    const keys = new Map<string, string>();
    for (const key of Object.keys(source) as (keyof BackupData)[]) {
      const value = source[key];
      if (Array.isArray(value)) {
        value.forEach((row: { id?: unknown }, index) => {
          if (typeof row.id === 'string') {
            keys.set(row.id, `data.${key}[${index}].id`);
          }
        });
      }
    }
    return keys;
  }

  function strings(value: unknown, path: string, out: [string, string][]): [string, string][] {
    if (typeof value === 'string') {
      out.push([path, value]);
    } else if (Array.isArray(value)) {
      value.forEach((inner, index) => strings(inner, `${path}[${index}]`, out));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (/^data\.auditEvents\[\d+\]$/.test(path) && (key === 'previousValue' || key === 'newValue' || key === 'impact')) {
          continue;
        }
        strings(inner, `${path}.${key}`, out);
      }
    }
    return out;
  }

  it('does not mutate its (deep-frozen) input', () => {
    expect(JSON.stringify(data)).toBe(snapshotBefore);
  });

  it('collects references (not row keys) from every documented site, with the target collection', () => {
    const byPath = new Map(references.map((reference) => [reference.path, reference]));
    const sub = data.matchEvents.findIndex((event) => event.kind === 'delivery' && event.wicket !== null && event.wicket.fielderIds.includes('plr-t12'));
    const absent = data.matchEvents.findIndex((event) => event.kind === 'innings_ended');
    const walkover = data.matchEvents.findIndex((event) => event.kind === 'match_ended' && event.matchId === M2);
    const expected: [string, BackupEntity, string][] = [
      [`data.matchEvents[${sub}].wicket.fielderIds[0]`, 'players', 'plr-t12'],
      [`data.matchEvents[${sub}].wicket.playerOutId`, 'players', 'plr-l02'],
      [`data.matchEvents[${sub}].bowlerId`, 'players', 'plr-t08'],
      [`data.matchEvents[${sub}].matchId`, 'matches', M1],
      [`data.matchEvents[${absent}].absentees[0].playerId`, 'players', 'plr-l08'],
      [`data.matchEvents[${walkover}].outcome.winnerTeamId`, 'teams', TIG],
      ['data.teams[0].captainId', 'players', 'plr-l01'],
      ['data.players[0].teamId', 'teams', LIO],
      ['data.tournaments[0].venueIds[0]', 'venues', VENUE],
      ['data.tournamentRules[0].tournamentId', 'tournaments', TRN],
      ['data.tournamentTeams[0].teamId', 'teams', LIO],
      ['data.stages[1].config.entryRules[0].sourceStageId', 'stages', STG_GROUP],
      ['data.slots[0].source.stageId', 'stages', STG_GROUP],
      ['data.slots[0].source.poolId', 'pools', POOL_A],
      ['data.poolEntries[1].side.teamId', 'teams', TIG],
      ['data.fixtures[1].sideA.slotId', 'slots', 'slot-a1'],
      ['data.fixtures[0].matchId', 'matches', M1],
      ['data.matches[0].fixtureId', 'fixtures', 'fx-1'],
      ['data.matches[0].toss.winnerTeamId', 'teams', LIO],
      ['data.matches[0].result.winnerTeamId', 'teams', TIG],
      ['data.matchPlayers[0].playerId', 'players', 'plr-l01'],
      ['data.overrides[1].orderedTeamIds[0]', 'teams', TIG],
      ['data.auditEvents[1].matchId', 'matches', M1],
    ];
    for (const [path, entity, id] of expected) {
      expect({ path, found: byPath.get(path) }).toEqual({ path, found: { path, entity, id } });
    }
    for (const path of ['data.overrides[0].stageId', 'data.overrides[0].poolId', 'data.overrides[1].stageId', 'data.overrides[2].slotId']) {
      expect({ path, found: byPath.get(path) }).toEqual({ path, found: undefined });
    }
    expect(references.some((reference) => /\.(?:previousValue|newValue|impact)\b/.test(reference.path))).toBe(false);
    expect(references.some((reference) => /^data\.[A-Za-z]+\[\d+\]\.id$/.test(reference.path))).toBe(false);
  });

  it('lists references in document order (BackupData collection order, then row order)', () => {
    const order = Object.keys(data);
    const positions = references.map((reference) => {
      const match = /^data\.([A-Za-z]+)\[(\d+)\]/.exec(reference.path);
      return match === null ? [-1, -1] : [order.indexOf(match[1]), Number(match[2])];
    });
    for (let index = 1; index < positions.length; index += 1) {
      const [collection, row] = positions[index];
      const [previousCollection, previousRow] = positions[index - 1];
      expect(collection > previousCollection || (collection === previousCollection && row >= previousRow)).toBe(true);
    }
  });

  it('calls idFor exactly once per distinct (entity, oldId)', () => {
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
    for (const reference of references) {
      expect(calls.has(`${reference.entity}|${reference.id}`)).toBe(true);
    }
  });

  it('leaves no original row key, reference or action id anywhere outside audit values', () => {
    const originals = new Set<string>([...rowKeys(data).keys(), ...references.map((reference) => reference.id), ...data.matchEvents.map((event) => event.actionId)]);
    const leftovers = strings(remapped, 'data', []).filter(([, value]) => originals.has(value));
    expect(leftovers).toEqual([]);
  });

  it('keeps audit history values and non-collection audit entity ids untouched', () => {
    const result = remapped.auditEvents.find((event) => event.action === 'result_recorded')!;
    expect(result.previousValue).toEqual({ winnerTeamId: LIO, fixtureId: 'fx-1' });
    expect(result.newValue).toEqual({ winnerTeamId: TIG });
    expect(result.entityId).toBe(forward.get(`matches|${M1}`));
    expect(remapped.auditEvents.find((event) => event.action === 'backup_imported')!.entityId).toBe('exp-earlier-0001');
  });

  it('maps every reference through idFor at the same path (U-BKP-04)', () => {
    const after = collectIdReferences(remapped);
    expect(after.map((reference) => reference.path)).toEqual(references.map((reference) => reference.path));
    after.forEach((reference, index) => {
      expect(reference.entity).toBe(references[index].entity);
      expect(reference.id).toBe(forward.get(`${references[index].entity}|${references[index].id}`));
    });
  });

  it('is a bijection: new ids are distinct and the inverse mapping restores the original exactly', () => {
    const values = [...forward.values()];
    expect(new Set(values).size).toBe(values.length);
    const inverse = new Map([...forward.entries()].map(([key, value]) => [`${key.split('|')[0]}|${value}`, key.slice(key.indexOf('|') + 1)]));
    const restored = remapBackupIds(remapped, (entity, id) => {
      const back = inverse.get(`${entity}|${id}`);
      if (back === undefined) {
        throw new Error(`no inverse for ${entity} ${id}`);
      }
      return back;
    });
    expect(restored).toEqual(data);
  });

  it('keeps action groups intact: events that shared an actionId still share one, and only those', () => {
    const groups = (source: BackupData): string[] => {
      const seen = new Map<string, number>();
      return source.matchEvents.map((event) => {
        const key = `${event.matchId}|${event.actionId}`;
        if (!seen.has(key)) {
          seen.set(key, seen.size);
        }
        return String(seen.get(key));
      });
    };
    expect(groups(remapped)).toEqual(groups(data));
  });

  it('the remapped copy is a valid backup whose matches replay with zero issues (U-BKP-03)', () => {
    const validation = importText(exportText(remapped));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('the remapped copy does not conflict with the original already on the device', () => {
    const everyOriginal = new Set(rowKeys(data).keys());
    const local: LocalData = {
      existingIds: { tournament: everyOriginal, match: everyOriginal, team: everyOriginal, player: everyOriginal, venue: everyOriginal, template: everyOriginal, preset: everyOriginal },
      footprint: () => ({ matchIds: [M1], events: 10 }),
      previouslyImportedAt: null,
    };
    const validation = importText(exportText(remapped), local);
    expect(validation.preview.conflicts).toEqual([]);
  });

  it('tags entities correctly when two collections share the same raw id', () => {
    const shared = tamper(data, (draft) => {
      rows(draft, 'venues')[0].id = 'shared-1';
      setAt(draft, 'tournaments[0].venueIds[0]', 'shared-1');
      setAt(draft, 'fixtures[0].venueId', 'shared-1');
      setAt(draft, 'fixtures[1].venueId', 'shared-1');
      setAt(draft, 'matches[0].venueId', 'shared-1');
      setAt(draft, 'matches[1].venueId', 'shared-1');
      setAt(draft, 'pools[0].id', 'shared-1');
      setAt(draft, 'slots[0].source.poolId', 'shared-1');
      setAt(draft, 'slots[1].source.poolId', 'shared-1');
      setAt(draft, 'poolEntries[0].poolId', 'shared-1');
      setAt(draft, 'poolEntries[1].poolId', 'shared-1');
      setAt(draft, 'fixtures[0].poolId', 'shared-1');
      setAt(draft, 'overrides[0].poolId', 'shared-1');
      setAt(draft, 'overrides[1].poolId', 'shared-1');
    });
    const copy = remapBackupIds(shared, (entity, id) => `${entity}:${id}`);
    expect(copy.venues[0].id).toBe('venues:shared-1');
    expect(copy.pools[0].id).toBe('pools:shared-1');
    expect(copy.matches[0].venueId).toBe('venues:shared-1');
    expect(copy.fixtures[0].poolId).toBe('pools:shared-1');
    expect(copy.slots[0].source).toMatchObject({ poolId: 'pools:shared-1' });
    expect(copy.tournaments[0].venueIds).toEqual(['venues:shared-1']);
  });
});

describe('legitimate device data must stay importable (no false positives)', () => {
  const fixture = buildFixture();

  interface ExtraMatch {
    readonly match: Match;
    readonly squad: BackupData['matchPlayers'][number][];
    readonly events: MatchEvent[];
  }

  function extraMatch(id: string, steps: readonly ScriptStep[], extra: Partial<Match>): ExtraMatch {
    const setup = setupFor(id);
    const played = playScript(setup, steps);
    const events = renameEvents(id, played.events);
    return { match: matchRow(id, { setup, events, state: played.state }, { title: `Lions v Tigers ${id}`, ...extra }), squad: squadRows(setup), events };
  }

  function withMatches(extras: readonly ExtraMatch[]): BackupData {
    return {
      ...fixture.data,
      matches: [...fixture.data.matches, ...extras.map((extra) => extra.match)],
      matchPlayers: [...fixture.data.matchPlayers, ...extras.flatMap((extra) => extra.squad)],
      matchEvents: [...fixture.data.matchEvents, ...extras.flatMap((extra) => extra.events)],
    };
  }

  it('a revoked override whose slot was deleted by a re-draw (payload keeps the old id) does not block the import', () => {
    const data = tamper(fixture.data, (draft) => setAt(draft, 'overrides[2].slotId', 'slot-deleted-3'));
    const validation = importText(exportText(data));
    expect(errorsOf(validation)).toEqual([]);
    expect(validation.preview.ok).toBe(true);
  });

  it('a revoked override whose pool was replaced (payload keeps the old pool id) does not block the import', () => {
    const data = tamper(fixture.data, (draft) => setAt(draft, 'overrides[1].poolId', 'pool-replaced-1'));
    const validation = importText(exportText(data));
    expect(errorsOf(validation)).toEqual([]);
    expect(validation.preview.ok).toBe(true);
  });

  it('a guest player (home team differs from the side he plays for) is accepted', () => {
    const data = tamper(fixture.data, (draft) => {
      rows(draft, 'teams').push({ ...rows(draft, 'teams')[0], id: 'team-eag', name: 'Eagles', shortName: 'EAG', captainId: null });
      rows(draft, 'players').push({ ...rows(draft, 'players')[0], id: 'plr-g01', teamId: 'team-eag', name: 'Guest' });
      rows(draft, 'matchPlayers').push({ matchId: M1, playerId: 'plr-g01', teamId: TIG, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true });
    });
    const validation = importText(exportText(data));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('events of two matches interleaved in the file (rowid order of matches scored side by side) are accepted', () => {
    const [m2Event] = fixture.m2.events;
    const others = fixture.data.matchEvents.filter((event) => event.id !== m2Event.id);
    const data: BackupData = { ...fixture.data, matchEvents: [...others.slice(0, 7), m2Event, ...others.slice(7)] };
    const validation = importText(exportText(data));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('a match log stored in descending seq order is still one contiguous log', () => {
    const m1 = fixture.data.matchEvents.filter((event) => event.matchId === M1).reverse();
    const data: BackupData = { ...fixture.data, matchEvents: [...m1, ...fixture.m2.events] };
    const validation = importText(exportText(data));
    expect(errorsOf(validation)).toEqual([]);
  });

  it('scheduled, live, paused and abandoned matches in a full backup are accepted', () => {
    const scheduled = extraMatch('match-0003', [], { status: 'scheduled', result: null, winnerTeamId: null, startedAt: null, completedAt: null });
    const live = extraMatch('match-0004', ['start:plr-l01:plr-l02:plr-t08', '1 4 .'], { status: 'live', result: null, winnerTeamId: null, completedAt: null });
    const paused = extraMatch('match-0005', ['start:plr-l01:plr-l02:plr-t08', '1 . susp'], { status: 'paused', result: null, winnerTeamId: null, completedAt: null });
    const abandoned = extraMatch('match-0006', ['start:plr-l01:plr-l02:plr-t08', '1 .', endMatch({ type: 'abandoned', reason: 'Rain' })], {
      status: 'abandoned',
      result: { type: 'abandoned', reason: 'Rain' },
      winnerTeamId: null,
    });
    const validation = importText(exportText(withMatches([scheduled, live, paused, abandoned])));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('an abandoned final that was rescheduled for a replay keeps its fixtureId for history (fixture matchId null) and is accepted', () => {
    const old = extraMatch('match-0003', ['start:plr-l01:plr-l02:plr-t08', '1 .', endMatch({ type: 'abandoned', reason: 'Rain' })], {
      status: 'abandoned',
      result: { type: 'abandoned', reason: 'Rain' },
      winnerTeamId: null,
      tournamentId: TRN,
      fixtureId: 'fx-2',
      title: 'Final',
    });
    const data = tamper(withMatches([old]), (draft) => {
      setAt(draft, 'fixtures[1].status', 'rescheduled');
      setAt(draft, 'stages[1].status', 'active');
    });
    const validation = importText(exportText(data));
    expect(describeIssues(validation)).toBe('');
    expect(validation.preview.ok).toBe(true);
  });

  it('an empty full backup from a fresh device imports cleanly', () => {
    const empty: BackupData = {
      venues: [],
      teams: [],
      players: [],
      tournaments: [],
      tournamentRules: [],
      tournamentTeams: [],
      stages: [],
      pools: [],
      slots: [],
      poolEntries: [],
      fixtures: [],
      matches: [],
      matchPlayers: [],
      matchEvents: [],
      overrides: [],
      auditEvents: [],
      templates: [],
      formatPresets: [],
      settings: null,
    };
    const validation = importText(exportText(empty));
    expect(validation.preview.ok).toBe(true);
    expect(validation.preview.conflicts).toEqual([]);
  });

  it('settings round-trip in a full backup and count as 1', () => {
    const data: BackupData = {
      ...fixture.data,
      settings: {
        theme: 'dark',
        hapticsEnabled: true,
        soundEnabled: false,
        reducedMotion: 'system',
        defaultFormatId: 'T20',
        scoring: { confirmInningsEnd: true, autoPromptBowler: true, dotStyle: 'dot', keepAwake: false },
      },
    };
    const text = exportText(data);
    expect((JSON.parse(text) as { counts: { settings: number } }).counts.settings).toBe(1);
    const validation = importText(text);
    expect(validation.preview.ok).toBe(true);
    expect(validation.envelope?.data.settings).toEqual(data.settings);
  });

  it('non-ASCII names (Urdu, emoji, astral plane) round-trip and keep a matching checksum', () => {
    const data = tamper(fixture.data, (draft) => {
      setAt(draft, 'teams[0].name', 'لاہور قلندرز 🦁');
      setAt(draft, 'venues[0].name', 'Qaddafi \u{1F3DF}️');
    });
    const validation = importText(exportText(data));
    expect(describeIssues(validation)).toBe('');
    expect(validation.envelope?.data.teams[0].name).toBe('لاہور قلندرز 🦁');
  });

  it('library conflicts include presets with their label', () => {
    const local: LocalData = { ...EMPTY_LOCAL_DATA, existingIds: { preset: new Set(['preset-club8']) } };
    const conflicts = importText(exportText(fixture.data), local).preview.conflicts;
    expect(conflicts).toEqual([{ entity: 'preset', id: 'preset-club8', label: 'Club 8s', localOnly: { matches: 0, events: 0 } }]);
  });

  it('skip_existing of a standalone match also drops its audit entries (they would collide with the local ones)', () => {
    const data: BackupData = {
      ...fixture.data,
      auditEvents: [
        ...fixture.data.auditEvents,
        {
          id: 'aud-m2',
          tournamentId: null,
          matchId: M2,
          action: 'match_history_edited',
          entityType: 'match',
          entityId: M2,
          summary: 'Corrected a delivery',
          previousValue: null,
          newValue: null,
          reason: 'Typo',
          impact: null,
          createdAt: STAMP,
        },
      ],
    };
    const kept = withoutAggregates(data, { tournamentIds: new Set(), matchIds: new Set([M2]) });
    expect(kept.matches.map((match) => match.id)).toEqual([M1]);
    expect(kept.auditEvents.some((event) => event.matchId === M2 || event.entityId === M2)).toBe(false);
    expect(kept.matchEvents.some((event) => event.matchId === M2)).toBe(false);
  });

  it('async validation yields to the event loop between matches', async () => {
    const parsed = parseBackupText(exportText(fixture.data), { latestSchemaVersion: 1 });
    let pauses = 0;
    await validateBackupAsync(
      parsed,
      { checksum: parsed.ok ? sha256Hex(parsed.checksumInput) : null, local: EMPTY_LOCAL_DATA },
      {
        pause: () => {
          pauses += 1;
          return Promise.resolve();
        },
        yieldEvery: 1,
      },
    );
    expect(pauses).toBeGreaterThan(0);
  });
});

describe('constraints the database would reject at COMMIT are caught in the preview (§89, BACKUP_RESTORE §1)', () => {
  const fixture = buildFixture();

  function addEagles(draft: Json): void {
    rows(draft, 'teams').push({ ...rows(draft, 'teams')[0], id: 'team-eag', name: 'Eagles', shortName: 'EAG', captainId: null });
  }

  function firstSubstitute(draft: Json): number {
    return rows(draft, 'matchPlayers').findIndex((row) => row.isSubstitute === true);
  }

  it.each<[string, (draft: Json) => void]>([
    ['team short name longer than 5 characters', (draft) => setAt(draft, 'teams[0].shortName', 'LIONSX')],
    ['blank team name', (draft) => setAt(draft, 'teams[0].name', '   ')],
    ['blank player name', (draft) => setAt(draft, 'players[0].name', '')],
    ['jersey number 1000', (draft) => setAt(draft, 'players[0].jerseyNumber', 1000)],
    ['tournament start after end', (draft) => setAt(draft, 'tournaments[0].startDate', '2026-10-15')],
    ['the same venue linked twice to a tournament', (draft) => setAt(draft, 'tournaments[0].venueIds', [VENUE, VENUE])],
    ['a team entered twice in one tournament', (draft) => rows(draft, 'tournamentTeams').push({ ...rows(draft, 'tournamentTeams')[0], id: 'tt-lio-2' })],
    ['membership "replaced" without a replacement', (draft) => setAt(draft, 'tournamentTeams[1].status', 'replaced')],
    ['membership seed 0', (draft) => setAt(draft, 'tournamentTeams[0].seed', 0)],
    ['two stages with the same order index', (draft) => setAt(draft, 'stages[1].orderIndex', 0)],
    ['two pools with the same name in a stage', (draft) => rows(draft, 'pools').push({ id: 'pool-b', stageId: STG_GROUP, name: 'Pool A', orderIndex: 1, legs: null })],
    ['two slots with the same index in a stage', (draft) => setAt(draft, 'slots[1].index', 0)],
    [
      'a progression slot fed by a pool position',
      (draft) => {
        setAt(draft, 'slots[1].role', 'progression');
        setAt(draft, 'slots[1].seed', null);
      },
    ],
    ['one team in the same stage twice', (draft) => setAt(draft, 'poolEntries[1].side', { kind: 'team', teamId: LIO })],
    ['a fixture of a team against itself', (draft) => setAt(draft, 'fixtures[0].sideB', { kind: 'team', teamId: LIO })],
    ['two fixtures pointing at the same match', (draft) => setAt(draft, 'fixtures[1].matchId', M1)],
    ['a completed fixture without a match', (draft) => setAt(draft, 'fixtures[1].status', 'completed')],
    ['fixture round 0', (draft) => setAt(draft, 'fixtures[0].round', 0)],
    ['a side of 1 player', (draft) => setAt(draft, 'matches[0].teamAPlayers', 1)],
    ['a match of a team against itself', (draft) => setAt(draft, 'matches[1].teamBId', LIO)],
    ['status abandoned with a walkover result', (draft) => setAt(draft, 'matches[1].status', 'abandoned')],
    ['0 overs per innings', (draft) => setAt(draft, 'matches[0].rules.oversPerInnings', 0)],
    [
      'toss won by a team that is not playing',
      (draft) => {
        addEagles(draft);
        setAt(draft, 'matches[0].toss', { winnerTeamId: 'team-eag', decision: 'bat' });
      },
    ],
    [
      'a winner that is not playing',
      (draft) => {
        addEagles(draft);
        setAt(draft, 'matches[1].winnerTeamId', 'team-eag');
      },
    ],
    ['a substitute with a batting position', (draft) => setAt(draft, `matchPlayers[${firstSubstitute(draft)}].battingOrder`, 9)],
    ['a substitute as captain', (draft) => setAt(draft, `matchPlayers[${firstSubstitute(draft)}].isCaptain`, true)],
    ['an override without a reason', (draft) => setAt(draft, 'overrides[0].reason', '  ')],
    ['an audit entry with an unknown entity type', (draft) => setAt(draft, 'auditEvents[0].entityType', 'galaxy')],
    ['a preset with 0 balls per over', (draft) => setAt(draft, 'formatPresets[0].rules.ballsPerOver', 0)],
  ])('%s → import impossible', (_label, edit) => {
    const validation = importText(exportText(tamper(fixture.data, edit)));
    expect(validation.preview.ok).toBe(false);
  });

  it.each<[string, Readonly<Record<string, unknown>>]>([
    ['more short runs than runs run', { runsRun: 1, shortRuns: 2 }],
    ['a six off leg-byes', { runsTo: 'leg_bye', boundary: 6, runsRun: 0 }],
    ['a wide with runsTo bat', { call: 'wide', runsTo: 'bat' }],
  ])('delivery with %s → import impossible', (_label, patch) => {
    const k = eventIndex(fixture.data, (event) => event.kind === 'delivery' && event.matchId === M1 && event.runsRun === 1 && event.call === 'fair');
    const edited = tamper(fixture.data, (draft) => {
      for (const [key, value] of Object.entries(patch)) {
        setAt(draft, `matchEvents[${k}].${key}`, value);
      }
    });
    expect(importText(exportText(edited)).preview.ok).toBe(false);
  });

  it.each<[string, (envelope: Json) => void]>([
    ['exportId missing', (envelope) => delete envelope.exportId],
    ['exportedAt not a timestamp', (envelope) => (envelope.exportedAt = 'yesterday')],
    ['scope kind unknown', (envelope) => (envelope.scope = { kind: 'galaxy' })],
    ['tournament scope without id', (envelope) => (envelope.scope = { kind: 'tournament' })],
    ['data missing', (envelope) => delete envelope.data],
    ['data is an array', (envelope) => (envelope.data = [])],
  ])('envelope with %s is refused without throwing', (_label, edit) => {
    const envelope = JSON.parse(exportText(fixture.data)) as Json;
    edit(envelope);
    expect(importText(JSON.stringify(envelope)).preview.ok).toBe(false);
  });
});

describe('scorecard PDF: super overs, penalties and in-progress matches', () => {
  const TIE_SCRIPT: readonly ScriptStep[] = [
    ...M1_SCRIPT.slice(0, 8),
    '6 W:c:plr-l07>plr-t03 4 4 4 1',
    '@plr-l06 1 1 1 . . .',
    '@plr-l07 . . . . . .',
    'so',
    'start:plr-t03:plr-t02:plr-l05',
    '6 6 . . . .',
    'start:plr-l03:plr-l05:plr-t08',
    '1 1 1 1 1 1',
    'end',
  ];

  it('a tied match decided by a super over keeps the super over in its own section and out of the main innings', () => {
    const setup = setupFor(M1);
    const played = playScript(setup, TIE_SCRIPT);
    const result = formatResult(played.state.result!, setup.teams);
    expect(result).toBe('Match tied — Tigers won the Super Over');
    const html = buildScorecardHtml(scorecardSource({ setup, events: played.events, state: played.state }, { tournament: false }), { generatedAt: GENERATED_AT });
    const text = visibleText(html);
    expect(text).toContain(result);
    expect(text).toMatch(/super over/i);
    expect(text).toMatch(/Tigers innings 22\/1 \(3 ov\)/);
    const chaseStart = text.indexOf('Tigers innings 22/1');
    const superOverStart = chaseStart + text.slice(chaseStart).search(/super over/i);
    expect(superOverStart).toBeGreaterThan(chaseStart);
    expect(text.slice(chaseStart, superOverStart)).toMatch(/Saud not out 15\* 12\b/);
    expect(text.slice(superOverStart)).toMatch(/12\/0/);
    expect(text.slice(superOverStart)).toMatch(/6\/0/);
  });

  it('a walkover without toss or innings renders a result, no toss line and no empty innings tables', () => {
    const setup: MatchSetup = { ...setupFor(M2), toss: null };
    const played = playScript(setup, [endMatch({ type: 'walkover', winnerTeamId: TIG, reason: 'Lions could not raise a side' })]);
    const source = scorecardSource({ setup, events: played.events, state: played.state }, { tournament: false });
    const html = buildScorecardHtml({ ...source, match: { ...source.match, id: M2, toss: null } }, { generatedAt: GENERATED_AT });
    const text = visibleText(html);
    expect(text).toContain('Tigers won by walkover');
    expect(text).not.toMatch(/won the toss/i);
    expect(text).not.toMatch(/Fall of wickets/i);
  });

  it('a scheduled match with no events renders without throwing', () => {
    const setup = setupFor('match-0009');
    const played = playScript(setup, []);
    const source = scorecardSource({ setup, events: [], state: played.state }, { tournament: false });
    const html = buildScorecardHtml(
      { ...source, match: { ...source.match, id: 'match-0009', status: 'scheduled', result: null, winnerTeamId: null, startedAt: null, completedAt: null } },
      { generatedAt: GENERATED_AT },
    );
    expect(visibleText(html)).toContain('Lions v Tigers');
    expect(visibleText(html)).not.toContain('won by');
  });

  it('penalty runs appear as "p 5" in the extras and in the total of an in-progress innings', () => {
    const setup = setupFor(M1);
    const steps: ScriptStep[] = [...M1_SCRIPT.slice(0, 3), { type: 'penalty', teamId: LIO, runs: 5, reason: 'Ball tampering' }, ...M1_SCRIPT.slice(3, 5)];
    const played = playScript(setup, steps);
    const source = scorecardSource({ setup, events: played.events, state: played.state }, { tournament: false });
    const html = buildScorecardHtml({ ...source, match: { ...source.match, status: 'live', result: null, winnerTeamId: null, completedAt: null } }, { generatedAt: GENERATED_AT });
    const text = visibleText(html);
    expect(text).toContain('b 1, lb 1, w 1, nb 1, p 5');
    expect(text).toMatch(/\b23\/2\b/);
    expect(text).not.toContain('won by');
  });
});

function tablesOf(html: string): string[][][] {
  return Array.from(withoutStyles(html).matchAll(/<table[\s\S]*?<\/table>/gi), (table) => tableRows(table[0]));
}

function bowlingFigures(html: string, bowler: string): Record<string, string> {
  for (const table of tablesOf(html)) {
    const header = table.find((cells) => cells.some((cell) => /^wd$/i.test(cell)) && cells.some((cell) => /^nb$/i.test(cell)));
    if (header === undefined) {
      continue;
    }
    const row = table.find((cells) => cells !== header && cells.length === header.length && cells[0].startsWith(bowler));
    if (row !== undefined) {
      return Object.fromEntries(header.map((label, index) => [label.toUpperCase(), row[index]]));
    }
  }
  throw new Error(`no bowling row for ${bowler}`);
}

describe('adversarial: scorecard §83 details the first pass did not pin down', () => {
  const played = playM1();
  const html = buildScorecardHtml(scorecardSource(played, { tournament: true }), { generatedAt: GENERATED_AT });
  const text = visibleText(html);

  it.each<[string, Record<string, string>]>([
    ['Shaheen', { O: '1.3', M: '0', R: '12', W: '3', ECON: '8.00', WD: '1', NB: '0' }],
    ['Hassan', { O: '1', M: '0', R: '8', W: '1', ECON: '8.00', WD: '0', NB: '1' }],
    ['Amir', { O: '1', M: '0', R: '19', W: '1', ECON: '19.00', WD: '0', NB: '0' }],
    ['Sarfraz', { O: '0.1', M: '0', R: '4', W: '0', ECON: '24.00', WD: '0', NB: '0' }],
  ])('bowling table columns O, M, R, W, Econ, WD, NB for %s (byes and leg-byes never charged to the bowler)', (bowler, expected) => {
    expect(bowlingFigures(html, bowler)).toMatchObject(expected);
  });

  it('did not bat lists the chasing side unused batters and never the substitute fielder', () => {
    const chase = text.slice(text.indexOf('Tigers innings'));
    const dnb = /did not bat:?\s*(.{0,60})/i.exec(chase);
    expect(dnb).not.toBeNull();
    for (const name of ['Agha', 'Azam', 'Faheem', 'Hassan', 'Shaheen']) {
      expect(dnb![1]).toContain(name);
    }
    expect(dnb![1]).not.toContain('Ali');
  });

  it('a substitute only ever appears as "sub (Name)" and an unused substitute never appears at all (Law 24)', () => {
    expect((text.match(/Ali/g) ?? []).length).toBe((text.match(/sub \(Ali\)/g) ?? []).length);
    expect(text).not.toContain('Usman');
  });

  it('title block carries the fixture label and the scheduled date of the match, not only the generation date', () => {
    const source = scorecardSource(played, { tournament: true });
    const dated = buildScorecardHtml({ ...source, match: { ...source.match, scheduledDate: '2026-09-12' } }, { generatedAt: GENERATED_AT });
    const datedText = visibleText(dated);
    expect(datedText).toContain('12 Sep 2026');
    expect(datedText).toContain('Match 1');
    expect(datedText).toContain('Lahore');
  });

  it('footer reads "Scored with Scorebook · generated 30 Sep 2026, 14:05" in the wall time of generatedAt', () => {
    expect(text).toContain('Scored with Scorebook · generated 30 Sep 2026, 14:05');
  });

  it('retired out is a wicket: shown as "retired out", counted in the total and listed in the fall of wickets (Law 25.4.3)', () => {
    const setup = setupFor(M1);
    const script = M1_SCRIPT.map((step) => (step === M1_SCRIPT[3] ? retire('plr-l01', 'retired_out', 'plr-l04') : step));
    const retiredOut = playScript(setup, script);
    const outHtml = buildScorecardHtml(scorecardSource({ setup, events: retiredOut.events, state: retiredOut.state }, { tournament: false }), { generatedAt: GENERATED_AT });
    const outText = visibleText(outHtml);
    expect(rowWith(outHtml, 'Babar', 'retired out')).toEqual(expect.arrayContaining(['1']));
    expect(outText).not.toContain('retired hurt');
    expect(outText).toMatch(/\b22\/5\b/);
    expect(outText).toContain('2-11 (Babar, 1.1)');
    expect(outText).toContain('3-11 (Imam, 1.2)');
  });

  it.each<[string, Parameters<typeof endMatch>[0], Match['status']]>([
    ['abandoned', { type: 'abandoned', reason: 'Rain' }, 'abandoned'],
    ['no result', { type: 'no_result', reason: 'Bad light' }, 'completed'],
    ['awarded', { type: 'awarded', winnerTeamId: LIO, reason: 'Tigers conceded', margin: null }, 'completed'],
  ])('%s: the result line is the domain formatResult text verbatim', (_label, outcome, status) => {
    const setup = setupFor(M1);
    const ended = playScript(setup, ['start:plr-l01:plr-l02:plr-t08', '1 4 .', endMatch(outcome)]);
    expect(ended.state.result).not.toBeNull();
    const expected = formatResult(ended.state.result!, setup.teams);
    const source = scorecardSource({ setup, events: ended.events, state: ended.state }, { tournament: false });
    const endedHtml = buildScorecardHtml({ ...source, match: { ...source.match, status } }, { generatedAt: GENERATED_AT });
    expect(visibleText(endedHtml)).toContain(expected);
  });

  it('hostile stage, pool, fixture label and venue location are escaped in the title block', () => {
    const source = scorecardSource(played, { tournament: true });
    const hostile = buildScorecardHtml(
      {
        ...source,
        venue: { name: 'Ground', location: '<iframe src=//evil.example>' },
        tournament: { tournamentName: 'Cup', stageName: '<script>stage()</script>', poolName: '<img src=p onerror=1>', fixtureLabel: '<svg/onload=f()>' },
      },
      { generatedAt: GENERATED_AT },
    );
    assertNoInjection(hostile);
    assertSafeCss(hostile);
    const hostileText = visibleText(hostile);
    expect(hostileText).toContain('<script>stage()</script>');
    expect(hostileText).toContain('<iframe src=//evil.example>');
  });
});

describe('adversarial: tournament PDF escapes structure labels', () => {
  it('hostile stage, pool, round, fixture and slot labels plus tournament details are escaped', () => {
    const fixture = buildFixture();
    const data = tamper(fixture.data, (draft) => {
      setAt(draft, 'stages[0].name', '<script>stage()</script>');
      setAt(draft, 'stages[1].name', '<iframe src=//k>');
      setAt(draft, 'pools[0].name', '<img src=p onerror=1>');
      setAt(draft, 'fixtures[1].label', '<svg/onload=f()>');
      setAt(draft, 'fixtures[1].bracket.roundName', '<marquee>Final</marquee>');
      setAt(draft, 'slots[0].label', '"><iframe>');
      setAt(draft, 'tournaments[0].organizer', '<script>org()</script>');
      setAt(draft, 'tournaments[0].location', '</style><script>loc()</script>');
      setAt(draft, 'tournaments[0].description', '<!-- hidden -->');
    });
    const summary = buildMatchSummary(fixture.m1.setup, fixture.m1.state, { completedAt: '2026-09-30T11:00:00.000Z' });
    if (summary === null) {
      throw new Error('scripted match must be terminal');
    }
    const snapshot: TournamentSnapshot = {
      version: '1',
      tournament: data.tournaments[0],
      rules: data.tournamentRules[0],
      teams: data.tournamentTeams.map((membership) => ({ membership, team: data.teams.find((team) => team.id === membership.teamId)! })),
      stages: data.stages,
      pools: data.pools,
      poolEntries: data.poolEntries,
      slots: data.slots,
      fixtures: data.fixtures,
      summaries: { [M1]: summary },
      staleSummaryMatchIds: [],
      overrides: data.overrides,
    };
    const html = buildTournamentHtml(
      { snapshot, evaluation: evaluateTournament(snapshot), stats: null, venues: [{ id: VENUE, name: 'Gaddafi Stadium' }], playerNames: PLAIN_NAMES.players },
      { generatedAt: GENERATED_AT },
    );
    assertNoInjection(html);
    assertSafeCss(html);
    expect(visibleText(html)).toContain('<img src=p onerror=1>');
  });
});

describe('adversarial: more hostile envelopes and rows', () => {
  const fixture = buildFixture();
  const validText = exportText(fixture.data);

  function withEnvelope(edit: (envelope: Json) => void): string {
    const envelope = JSON.parse(validText) as Json;
    edit(envelope);
    return JSON.stringify(envelope);
  }

  it.each<[string, unknown]>([
    ['a string', '1'],
    ['a fraction', 1.5],
    ['zero (no schema 0 ever existed)', 0],
    ['negative', -1],
    ['null', null],
  ])('schemaVersion that is %s is refused without throwing', (_label, version) => {
    const validation = importText(withEnvelope((envelope) => (envelope.schemaVersion = version)));
    expect(validation.preview.ok).toBe(false);
    expect(validation.envelope).toBeNull();
  });

  it('schemaVersion missing is refused', () => {
    expect(importText(withEnvelope((envelope) => delete envelope.schemaVersion)).preview.ok).toBe(false);
  });

  it.each<[string, unknown]>([
    ['a number', 12345],
    ['an empty string', ''],
    ['not hex', 'z'.repeat(64)],
    ['a truncated digest', 'ab'.repeat(16)],
  ])('checksum that is %s is an error, never treated as "missing"', (_label, checksum) => {
    const validation = importText(withEnvelope((envelope) => (envelope.checksum = checksum)));
    expect(validation.preview.ok).toBe(false);
    expect(validation.preview.issues.some((issue) => issue.code === 'CHECKSUM_MISSING')).toBe(false);
  });

  it('a checksum computed over different data (a file spliced from two exports) is a mismatch', () => {
    const other = exportText(tamper(fixture.data, (draft) => setAt(draft, 'venues[0].name', 'Other ground')));
    const spliced = withEnvelope((envelope) => (envelope.checksum = (JSON.parse(other) as Json).checksum));
    expect(errorsOf(importText(spliced)).map((issue) => issue.code)).toContain('CHECKSUM_MISMATCH');
  });

  it('deep nesting inside a row (3000 levels, a 6 KB file) becomes an issue, never a thrown error', () => {
    const depth = 3000;
    const text = validText.replace('"name":"Gaddafi Stadium"', `"name":${'['.repeat(depth)}${']'.repeat(depth)}`);
    expect(text).not.toBe(validText);
    let validation: BackupValidation | null = null;
    expect(() => {
      validation = importText(text);
    }).not.toThrow();
    expect(validation!.preview.ok).toBe(false);
  });

  it.each([
    'venues',
    'teams',
    'players',
    'tournaments',
    'tournamentTeams',
    'stages',
    'pools',
    'slots',
    'poolEntries',
    'fixtures',
    'matches',
    'matchEvents',
    'overrides',
    'auditEvents',
    'formatPresets',
  ] as const)('a duplicated row key in %s → DUPLICATE_ID with a path into that collection', (collection) => {
    const validation = importText(exportText(tamper(fixture.data, (draft) => rows(draft, collection).push({ ...rows(draft, collection)[0] }))));
    expect(validation.preview.ok).toBe(false);
    const duplicates = errorsOf(validation).filter((issue) => issue.code === 'DUPLICATE_ID');
    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates.some((issue) => (issue.path ?? '').startsWith(`data.${collection}[`))).toBe(true);
  });

  const m1At = (seq: number): number => eventIndex(fixture.data, (event) => event.matchId === M1 && event.seq === seq);

  it.each<[string, string]>([
    [`matchEvents[${m1At(1)}].nonStrikerId`, 'plr-ghost'],
    [`matchEvents[${m1At(1)}].bowlerId`, 'plr-ghost'],
    [`matchEvents[${m1At(2)}].nonStrikerId`, 'plr-ghost'],
    [`matchEvents[${m1At(5)}].wicket.playerOutId`, 'plr-ghost'],
    [`matchEvents[${m1At(6)}].playerId`, 'plr-ghost'],
    [`matchEvents[${m1At(10)}].bowlerId`, 'plr-ghost'],
    [`matchEvents[${m1At(13)}].playerId`, 'plr-ghost'],
    [`matchEvents[${m1At(25)}].wicket.fielderIds[0]`, 'plr-ghost'],
    [`matchEvents[${m1At(20)}].matchId`, 'match-ghost'],
    ['matchPlayers[0].matchId', 'match-ghost'],
    ['matchPlayers[0].teamId', 'team-ghost'],
    ['fixtures[0].matchId', 'match-ghost'],
    ['fixtures[0].stageId', 'stg-ghost'],
    ['fixtures[0].poolId', 'pool-ghost'],
    ['fixtures[0].tournamentId', 'trn-ghost'],
    ['matches[0].fixtureId', 'fx-ghost'],
    ['matches[0].venueId', 'ven-ghost'],
    ['matches[0].toss.winnerTeamId', 'team-ghost'],
    ['pools[0].stageId', 'stg-ghost'],
    ['stages[0].tournamentId', 'trn-ghost'],
    ['tournamentTeams[0].teamId', 'team-ghost'],
    ['tournamentTeams[0].tournamentId', 'trn-ghost'],
    ['tournamentRules[0].tournamentId', 'trn-ghost'],
    ['poolEntries[0].poolId', 'pool-ghost'],
    ['slots[0].stageId', 'stg-ghost'],
    ['overrides[0].tournamentId', 'trn-ghost'],
    ['auditEvents[0].tournamentId', 'trn-ghost'],
  ])('dangling %s → MISSING_REFERENCE at that exact path', (path, value) => {
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, path, value))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).filter((issue) => issue.code === 'MISSING_REFERENCE').map((issue) => issue.path)).toContain(`data.${path}`);
  });

  describe('penalty_awarded payload team', () => {
    const id = 'match-0007';
    const setup = setupFor(id);
    const played = playScript(setup, ['start:plr-l01:plr-l02:plr-t08', '1 4', penalty(LIO, 5)]);
    const events = renameEvents(id, played.events);
    const withPenalty: BackupData = {
      ...fixture.data,
      matches: [
        ...fixture.data.matches,
        matchRow(id, { setup, events, state: played.state }, { title: 'Penalty match', status: 'live', result: null, winnerTeamId: null, completedAt: null }),
      ],
      matchPlayers: [...fixture.data.matchPlayers, ...squadRows(setup)],
      matchEvents: [...fixture.data.matchEvents, ...events],
    };
    const k = withPenalty.matchEvents.findIndex((event) => event.kind === 'penalty_awarded');

    it('a live match with a penalty imports cleanly (baseline)', () => {
      expect(k).toBeGreaterThanOrEqual(0);
      expect(describeIssues(importText(exportText(withPenalty)))).toBe('');
    });

    it('a penalty naming an unknown team → MISSING_REFERENCE at data.matchEvents[k].teamId', () => {
      const validation = importText(exportText(tamper(withPenalty, (draft) => setAt(draft, `matchEvents[${k}].teamId`, 'team-ghost'))));
      expect(errorsOf(validation).filter((issue) => issue.code === 'MISSING_REFERENCE').map((issue) => issue.path)).toContain(`data.matchEvents[${k}].teamId`);
    });
  });
});

describe('adversarial: event logs that break the Laws are refused (stage 9)', () => {
  const fixture = buildFixture();
  const m1At = (seq: number): number => eventIndex(fixture.data, (event) => event.matchId === M1 && event.seq === seq);

  it.each<[string, string, string]>([
    ['a dismissed batter walks back in (out means out for the innings)', `matchEvents[${m1At(14)}].playerId`, 'plr-l02'],
    ['a substitute bats (Law 24.1.1)', `matchEvents[${m1At(6)}].playerId`, 'plr-l12'],
    ['a fielder from the bowling side comes in to bat', `matchEvents[${m1At(6)}].playerId`, 'plr-t05'],
    ['a substitute bowls (Law 24.1.1)', `matchEvents[${m1At(10)}].bowlerId`, 'plr-t12'],
    ['the same bowler bowls two consecutive overs (Law 17.8)', `matchEvents[${m1At(10)}].bowlerId`, 'plr-t08'],
  ])('%s → INVALID_EVENT_LOG, import impossible', (_label, path, value) => {
    const validation = importText(exportText(tamper(fixture.data, (draft) => setAt(draft, path, value))));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_EVENT_LOG');
  });

  it('deliveries before any innings_started (first event removed, seqs renumbered) → INVALID_EVENT_LOG', () => {
    const edited = tamper(fixture.data, (draft) => {
      const events = rows(draft, 'matchEvents');
      events.splice(m1At(1), 1);
      for (const event of events) {
        if (event.matchId === M1) {
          event.seq = (event.seq as number) - 1;
        }
      }
    });
    const validation = importText(exportText(edited));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_EVENT_LOG');
  });

  it('a walkover recorded after deliveries were bowled → INVALID_EVENT_LOG', () => {
    const edited = tamper(fixture.data, (draft) => setAt(draft, `matchEvents[${m1At(38)}].outcome`, { type: 'walkover', winnerTeamId: LIO, reason: null }));
    const validation = importText(exportText(edited));
    expect(validation.preview.ok).toBe(false);
    expect(errorsOf(validation).map((issue) => issue.code)).toContain('INVALID_EVENT_LOG');
  });
});

describe('adversarial: remapBackupIds over every §6 reference site', () => {
  const fixture = buildFixture();
  const enriched = deepFreeze(
    tamper(fixture.data, (draft) => {
      setAt(draft, 'tournamentTeams[0].replacedByTeamId', TIG);
      setAt(draft, 'tournamentTeams[1].inheritsFromTeamId', LIO);
      rows(draft, 'slots').push({ id: 'slot-fw', stageId: STG_FINAL, index: 2, role: 'progression', label: 'Winner M1', source: { kind: 'fixture_winner', fixtureId: 'fx-1' }, seed: null });
      rows(draft, 'slots').push({ id: 'slot-man', stageId: STG_FINAL, index: 3, role: 'entry', label: 'Wildcard', source: { kind: 'manual', teamId: LIO }, seed: null });
      rows(draft, 'poolEntries').push({ id: 'pe-slot', poolId: POOL_A, stageId: STG_GROUP, side: { kind: 'slot', slotId: 'slot-a1' }, seed: null });
      setAt(draft, 'stages[1].config.entryRules', [
        { kind: 'top_per_pool', sourceStageId: STG_GROUP, count: 2, fromPosition: 1 },
        { kind: 'pool_position', sourceStageId: STG_GROUP, poolId: POOL_A, position: 3 },
        { kind: 'direct_entry', teamIds: [TIG] },
      ]);
      rows(draft, 'overrides').push({ id: 'ovr-champ', tournamentId: TRN, reason: 'Joint winners', createdAt: STAMP, revokedAt: null, revokeReason: null, kind: 'champion', teamIds: [LIO, TIG] });
      rows(draft, 'overrides').push({
        id: 'ovr-qual',
        tournamentId: TRN,
        reason: 'Reassigned',
        createdAt: STAMP,
        revokedAt: null,
        revokeReason: null,
        kind: 'qualification',
        stageId: STG_FINAL,
        teamId: TIG,
        action: 'reassign',
        slotId: 'slot-a2',
        poolId: POOL_A,
      });
      rows(draft, 'overrides').push({ id: 'ovr-exp', tournamentId: TRN, reason: 'Withdrawn', createdAt: STAMP, revokedAt: STAMP, revokeReason: 'Returned', kind: 'expunge_results', stageId: STG_GROUP, teamId: LIO });
      setAt(draft, 'matches[0].result', { type: 'tie', decider: { method: 'super_over', winnerTeamId: TIG, superOverRounds: 1 } });
      const audit = (id: string, entityType: string, entityId: string): Json => ({
        id,
        tournamentId: TRN,
        matchId: null,
        action: 'edited',
        entityType,
        entityId,
        summary: `Edited a ${entityType}`,
        previousValue: { entityId },
        newValue: null,
        reason: null,
        impact: null,
        createdAt: STAMP,
      });
      rows(draft, 'auditEvents').push(
        audit('aud-slot', 'slot', 'slot-a1'),
        audit('aud-pool', 'pool', POOL_A),
        audit('aud-stage', 'stage', STG_FINAL),
        audit('aud-ovr', 'override', 'ovr-points'),
        audit('aud-fx', 'fixture', 'fx-2'),
        audit('aud-trn', 'tournament', TRN),
      );
    }),
  );

  const forward = new Map<string, string>();
  const calls = new Map<string, number>();
  let counter = 0;
  const remapped = remapBackupIds(enriched, (entity, oldId) => {
    const key = `${entity}|${oldId}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    counter += 1;
    const next = `rid-${String(counter).padStart(5, '0')}`;
    forward.set(key, next);
    return next;
  });
  const references = collectIdReferences(enriched);
  const byPath = new Map(references.map((reference) => [reference.path, reference]));

  it.each<[string, BackupEntity, string]>([
    ['data.tournamentTeams[0].replacedByTeamId', 'teams', TIG],
    ['data.tournamentTeams[1].inheritsFromTeamId', 'teams', LIO],
    ['data.slots[2].source.fixtureId', 'fixtures', 'fx-1'],
    ['data.slots[3].source.teamId', 'teams', LIO],
    ['data.poolEntries[2].side.slotId', 'slots', 'slot-a1'],
    ['data.stages[1].config.entryRules[1].poolId', 'pools', POOL_A],
    ['data.stages[1].config.entryRules[1].sourceStageId', 'stages', STG_GROUP],
    ['data.stages[1].config.entryRules[2].teamIds[0]', 'teams', TIG],
    ['data.overrides[3].teamIds[1]', 'teams', TIG],
    ['data.overrides[4].teamId', 'teams', TIG],
    ['data.matches[0].result.decider.winnerTeamId', 'teams', TIG],
    ['data.matches[1].result.loserTeamId', 'teams', LIO],
    ['data.matches[0].winnerTeamId', 'teams', TIG],
    ['data.fixtures[0].sideB.teamId', 'teams', TIG],
  ])('collectIdReferences records %s → %s', (path, entity, id) => {
    expect(byPath.get(path)).toEqual({ path, entity, id });
  });

  it.each(['data.overrides[4].slotId', 'data.overrides[4].poolId', 'data.overrides[4].stageId', 'data.overrides[5].stageId'])(
    'override payload %s is a history link: not a must-resolve reference',
    (path) => {
      expect(byPath.get(path)).toBeUndefined();
    },
  );

  it('override payload stage, pool and slot ids are still remapped, following their rows', () => {
    expect(remapped.overrides[4]).toMatchObject({ slotId: remapped.slots[1].id, poolId: remapped.pools[0].id, stageId: remapped.stages[1].id });
    expect(remapped.overrides[5]).toMatchObject({ stageId: remapped.stages[0].id });
    expect(calls.get(`slots|slot-a2`)).toBe(1);
    expect(calls.get(`stages|${STG_GROUP}`)).toBe(1);
  });

  it('idFor is called exactly once per distinct (entity, id), including the new sites', () => {
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
    for (const reference of references) {
      expect(calls.has(`${reference.entity}|${reference.id}`)).toBe(true);
    }
  });

  it('no original id survives anywhere except inside audit previousValue / newValue / impact', () => {
    const originals = new Set<string>(references.map((reference) => reference.id));
    for (const key of Object.keys(enriched) as (keyof BackupData)[]) {
      const value = enriched[key];
      if (Array.isArray(value)) {
        for (const row of value as { id?: unknown }[]) {
          if (typeof row.id === 'string') {
            originals.add(row.id);
          }
        }
      }
    }
    for (const event of enriched.matchEvents) {
      originals.add(event.actionId);
    }
    const leftovers: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (originals.has(value)) {
          leftovers.push(`${path}=${value}`);
        }
      } else if (Array.isArray(value)) {
        value.forEach((inner, index) => walk(inner, `${path}[${index}]`));
      } else if (value !== null && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          if (/^data\.auditEvents\[\d+\]$/.test(path) && (key === 'previousValue' || key === 'newValue' || key === 'impact')) {
            continue;
          }
          walk(inner, `${path}.${key}`);
        }
      }
    };
    walk(remapped, 'data');
    expect(leftovers).toEqual([]);
  });

  it('audit entity ids that name a collection follow their row to its new id; history values keep the old id', () => {
    const find = (id: string) => remapped.auditEvents[enriched.auditEvents.findIndex((event) => event.id === id)];
    expect(find('aud-slot').entityId).toBe(remapped.slots[0].id);
    expect(find('aud-pool').entityId).toBe(remapped.pools[0].id);
    expect(find('aud-stage').entityId).toBe(remapped.stages[1].id);
    expect(find('aud-ovr').entityId).toBe(remapped.overrides[0].id);
    expect(find('aud-fx').entityId).toBe(remapped.fixtures[1].id);
    expect(find('aud-trn').entityId).toBe(remapped.tournaments[0].id);
    expect(find('aud-slot').previousValue).toEqual({ entityId: 'slot-a1' });
  });

  it('references stay consistent with their targets after remapping', () => {
    expect(remapped.fixtures[1].sideA).toEqual({ kind: 'slot', slotId: remapped.slots[0].id });
    expect(remapped.poolEntries[2].side).toEqual({ kind: 'slot', slotId: remapped.slots[0].id });
    expect(remapped.slots[2].source).toEqual({ kind: 'fixture_winner', fixtureId: remapped.fixtures[0].id });
    expect(remapped.overrides[4]).toMatchObject({ slotId: remapped.slots[1].id, poolId: remapped.pools[0].id, stageId: remapped.stages[1].id });
    expect(remapped.matches[0].fixtureId).toBe(remapped.fixtures[0].id);
    expect(remapped.fixtures[0].matchId).toBe(remapped.matches[0].id);
    expect(remapped.tournamentRules[0].tournamentId).toBe(remapped.tournaments[0].id);
    expect(remapped.matchPlayers.every((row) => remapped.matches.some((match) => match.id === row.matchId))).toBe(true);
    expect(remapped.matchEvents.every((event) => remapped.matches.some((match) => match.id === event.matchId))).toBe(true);
  });

  it('is a bijection on the enriched data: the inverse mapping restores it exactly', () => {
    const values = [...forward.values()];
    expect(new Set(values).size).toBe(values.length);
    const inverse = new Map([...forward.entries()].map(([key, value]) => [`${key.slice(0, key.indexOf('|'))}|${value}`, key.slice(key.indexOf('|') + 1)]));
    const restored = remapBackupIds(remapped, (entity, id) => {
      const back = inverse.get(`${entity}|${id}`);
      if (back === undefined) {
        throw new Error(`no inverse for ${entity} ${id}`);
      }
      return back;
    });
    expect(restored).toEqual(enriched);
  });
});

describe('adversarial: conflict labels name what the organizer recognises', () => {
  const fixture = buildFixture();

  it('a conflicting standalone match is labelled with its title and players with their names', () => {
    const local: LocalData = {
      ...EMPTY_LOCAL_DATA,
      existingIds: { match: new Set([M2]), player: new Set(['plr-l01']) },
      footprint: (entity, id) => (entity === 'match' && id === M2 ? { matchIds: [M2], events: 1, eventIds: fixture.m2.events.map((event) => event.id) } : null),
    };
    const conflicts = importText(exportText(fixture.data), local).preview.conflicts;
    expect(conflicts.find((conflict) => conflict.entity === 'match')).toEqual({ entity: 'match', id: M2, label: 'Lions v Tigers (friendly)', localOnly: { matches: 0, events: 0 } });
    expect(conflicts.find((conflict) => conflict.entity === 'player')).toMatchObject({ id: 'plr-l01', label: expect.stringContaining('Babar') });
  });
});

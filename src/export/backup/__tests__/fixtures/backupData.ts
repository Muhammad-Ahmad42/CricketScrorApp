import type {
  AuditEvent,
  BackupData,
  Fixture,
  ImpactSummary,
  Match,
  MatchEvent,
  Player,
  Team,
  TournamentOverride,
  TournamentTeam,
} from '@/domain/types';
import type { BackupMatchPlayer } from '../../ids';
import { eventLog, validOneOverLog } from './events';
import { KNOCKOUT, NRR, POINTS, RULES, T0, stageConfig } from './rules';

export const IDS = {
  lions: 'team-lions',
  tigers: 'team-tigers',
  eagles: 'team-eagles',
  hawks: 'team-hawks',
  falcons: 'team-falcons',
  tournament: 'tour-spring',
  groups: 'stage-groups',
  knockout: 'stage-ko',
  poolA: 'pool-a',
  match1: 'match-1',
  match2: 'match-2',
  fixture1: 'fx-group-1',
  fixture2: 'fx-group-2',
  final: 'fx-final',
  venue: 'venue-gaddafi',
  venue2: 'venue-ground-2',
} as const;

function team(id: string, name: string, shortName: string, captainId: string): Team {
  return { id, name, shortName, logoUri: null, captainId, createdAt: T0, updatedAt: T0, archivedAt: null };
}

function player(id: string, teamId: string, name: string): Player {
  return { id, teamId, name, jerseyNumber: null, role: 'unknown', createdAt: T0, updatedAt: T0, archivedAt: null };
}

function membership(id: string, teamId: string, extra: Partial<TournamentTeam> = {}): TournamentTeam {
  return {
    id,
    tournamentId: IDS.tournament,
    teamId,
    seed: null,
    status: 'active',
    replacedByTeamId: null,
    inheritsFromTeamId: null,
    joinedAt: T0,
    ...extra,
  };
}

function squad(matchId: string, teamId: string, ids: readonly string[], extra: Partial<BackupMatchPlayer> = {}): BackupMatchPlayer[] {
  return ids.map((playerId, index) => ({
    matchId,
    playerId,
    teamId,
    battingOrder: index + 1,
    isCaptain: index === 0,
    isWicketKeeper: index === 1,
    isSubstitute: false,
    ...extra,
  }));
}

function fixture(id: string, extra: Partial<Fixture>): Fixture {
  return {
    id,
    tournamentId: IDS.tournament,
    stageId: IDS.groups,
    poolId: IDS.poolA,
    matchNumber: 1,
    label: null,
    round: 1,
    leg: 1,
    bracket: null,
    isFinal: false,
    sideA: { kind: 'team', teamId: IDS.lions },
    sideB: { kind: 'team', teamId: IDS.tigers },
    scheduledDate: '2026-09-02',
    scheduledTime: '10:00',
    venueId: IDS.venue,
    status: 'scheduled',
    matchId: null,
    matchSides: null,
    formatId: null,
    matchRules: null,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

function match(id: string, extra: Partial<Match>): Match {
  return {
    id,
    title: 'Lions v Tigers',
    teamAId: IDS.lions,
    teamBId: IDS.tigers,
    venueId: IDS.venue,
    scheduledDate: '2026-09-02',
    scheduledTime: '10:00',
    formatId: 'custom',
    rules: RULES,
    toss: { winnerTeamId: IDS.lions, decision: 'bat' },
    status: 'scheduled',
    result: null,
    winnerTeamId: null,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

function overrideBase(id: string) {
  return { id, tournamentId: IDS.tournament, reason: 'Organizer decision', createdAt: T0, revokedAt: null, revokeReason: null };
}

const IMPACT: ImpactSummary = {
  severity: 'info',
  headline: 'Tigers move to the top of Pool A',
  lines: ['team-tigers now 1st'],
  fixtures: [{ fixtureId: IDS.fixture1, label: 'Match 1', change: 'result_changed', hasMatchData: true }],
  standings: [{ stageId: IDS.groups, poolId: IDS.poolA, teamId: IDS.tigers, before: null, after: { position: 1, points: 2, nrr: 1.2 } }],
  qualification: [],
  slots: [],
  nrrChanged: true,
  completedMatchesAffected: 1,
  requiresConfirmation: false,
  requiresReason: false,
  blocked: null,
};

function audit(id: string, extra: Partial<AuditEvent>): AuditEvent {
  return {
    id,
    tournamentId: IDS.tournament,
    matchId: null,
    action: 'tournament_created',
    entityType: 'tournament',
    entityId: IDS.tournament,
    summary: 'Created',
    previousValue: null,
    newValue: null,
    reason: null,
    impact: null,
    createdAt: T0,
    ...extra,
  };
}

export const LIONS = ['p-lions-1', 'p-lions-2', 'p-lions-3'] as const;
export const TIGERS = ['p-tigers-1', 'p-tigers-2', 'p-tigers-3'] as const;
export const EAGLES = ['p-eagles-1', 'p-eagles-2', 'p-eagles-3'] as const;
export const LIONS_SUB = 'p-lions-sub';

export function coverageEvents(): MatchEvent[] {
  const [l1, l2, l3] = LIONS;
  const [e1, e2, e3] = EAGLES;
  return eventLog(IDS.match2, [
    { kind: 'innings_started', inningsIndex: 0, battingTeamId: IDS.lions, strikerId: l1, nonStrikerId: l2, bowlerId: e3 },
    {
      kind: 'delivery',
      call: 'fair',
      runsTo: 'bat',
      strikerId: l1,
      nonStrikerId: l2,
      bowlerId: e3,
      runsRun: 1,
      shortRuns: 0,
      boundary: 0,
      wicket: { type: 'run_out', playerOutId: l2, fielderIds: [e1, e2], dismissalEnd: 'non_striker_end' },
    },
    { kind: 'batter_in', playerId: l3, position: 'non_striker' },
    { kind: 'delivery', call: 'wide', strikerId: l1, nonStrikerId: l3, bowlerId: e3, runsRun: 0, shortRuns: 0, boundary: 0, wicket: null },
    { kind: 'strike_swapped' },
    { kind: 'bowler_selected', bowlerId: e2, reason: 'injury' },
    { kind: 'batter_retired', playerId: l3, retirement: 'retired_hurt' },
    { kind: 'batter_dismissed', playerId: l1, type: 'run_out', fielderIds: [e3] },
    { kind: 'penalty_awarded', teamId: IDS.lions, inningsIndex: 0, runs: 5, reason: 'Ball tampering' },
    { kind: 'overs_revised', inningsIndex: 1, maxBalls: 6, target: null, terminal: false, reason: 'Rain' },
    { kind: 'play_suspended', reason: 'rain', note: null },
    { kind: 'play_resumed' },
    { kind: 'innings_ended', reason: 'batters_unavailable', absentees: [{ playerId: l3, hurt: true }] },
    { kind: 'super_over_started', round: 1 },
    { kind: 'match_ended', outcome: { type: 'tie_decided', method: 'coin_toss', winnerTeamId: IDS.eagles } },
  ]);
}

export function match1Events(): MatchEvent[] {
  return validOneOverLog(IDS.match1, {
    battingFirst: { teamId: IDS.lions, players: LIONS },
    chasing: { teamId: IDS.tigers, players: TIGERS },
  });
}

export function tournamentBackup(): BackupData {
  const overrides: TournamentOverride[] = [
    { ...overrideBase('ov-q'), kind: 'qualification', stageId: IDS.groups, teamId: IDS.eagles, action: 'qualify', slotId: 'slot-a1', poolId: IDS.poolA },
    { ...overrideBase('ov-p'), kind: 'points_adjustment', stageId: IDS.groups, poolId: IDS.poolA, teamId: IDS.lions, points: -1 },
    {
      ...overrideBase('ov-t'),
      kind: 'tie_resolution',
      stageId: IDS.groups,
      poolId: IDS.poolA,
      orderedTeamIds: [IDS.tigers, IDS.lions],
      method: 'draw_lots',
      seed: 42,
    },
    { ...overrideBase('ov-s'), kind: 'slot_assignment', slotId: 'slot-manual', teamId: IDS.eagles },
    { ...overrideBase('ov-e'), kind: 'expunge_results', stageId: null, teamId: IDS.hawks },
    { ...overrideBase('ov-c'), kind: 'champion', teamIds: [IDS.tigers] },
  ];
  return {
    venues: [
      { id: IDS.venue, name: 'Gaddafi Stadium', location: 'Lahore', notes: null, createdAt: T0, updatedAt: T0, archivedAt: null },
      { id: IDS.venue2, name: 'Ground 2', location: null, notes: null, createdAt: T0, updatedAt: T0, archivedAt: null },
    ],
    teams: [
      team(IDS.lions, 'Lions', 'LIO', LIONS[0]),
      team(IDS.tigers, 'Tigers', 'TIG', TIGERS[0]),
      team(IDS.eagles, 'Eagles', 'EAG', EAGLES[0]),
      team(IDS.hawks, 'Hawks', 'HAW', 'p-hawks-1'),
      team(IDS.falcons, 'Falcons', 'FAL', 'p-falcons-1'),
    ],
    players: [
      ...LIONS.map((id, index) => player(id, IDS.lions, ['Babar', 'Fakhar', 'Saim'][index])),
      player(LIONS_SUB, IDS.lions, 'Usman'),
      ...TIGERS.map((id, index) => player(id, IDS.tigers, ['Rizwan', 'Shan', 'Hassan'][index])),
      ...EAGLES.map((id, index) => player(id, IDS.eagles, ['Ali', 'Amir', 'Wasim'][index])),
      player('p-hawks-1', IDS.hawks, 'Imad'),
      player('p-falcons-1', IDS.falcons, 'Faheem'),
    ],
    tournaments: [
      {
        id: IDS.tournament,
        name: 'Spring Cup',
        season: '2026',
        description: null,
        logoUri: null,
        organizer: 'City Club',
        contact: null,
        location: 'Lahore',
        notes: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        venueIds: [IDS.venue, IDS.venue2],
        structureKind: 'groups_knockout',
        status: 'active',
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    tournamentRules: [
      {
        tournamentId: IDS.tournament,
        pointsSystem: POINTS,
        nrr: NRR,
        tieBreakers: ['points', 'nrr', 'head_to_head'],
        defaultFormatId: 'custom',
        defaultMatchRules: RULES,
        updatedAt: T0,
      },
    ],
    tournamentTeams: [
      membership('tt-lions', IDS.lions, { seed: 1 }),
      membership('tt-tigers', IDS.tigers, { seed: 2 }),
      membership('tt-eagles', IDS.eagles, { seed: 3 }),
      membership('tt-hawks', IDS.hawks, { status: 'replaced', replacedByTeamId: IDS.falcons }),
      membership('tt-falcons', IDS.falcons, { inheritsFromTeamId: IDS.hawks }),
    ],
    stages: [
      {
        id: IDS.groups,
        tournamentId: IDS.tournament,
        name: 'Group stage',
        type: 'group',
        orderIndex: 0,
        status: 'active',
        config: stageConfig({ entryRules: [{ kind: 'direct_entry', teamIds: [IDS.lions, IDS.tigers, IDS.eagles, IDS.falcons] }] }),
        createdAt: T0,
        updatedAt: T0,
      },
      {
        id: IDS.knockout,
        tournamentId: IDS.tournament,
        name: 'Knockout',
        type: 'knockout',
        orderIndex: 1,
        status: 'pending',
        config: stageConfig({
          fixtureGeneration: { method: 'knockout', legs: 1 },
          knockout: KNOCKOUT,
          decidesChampion: true,
          entryRules: [
            { kind: 'top_per_pool', sourceStageId: IDS.groups, count: 1, fromPosition: 1 },
            { kind: 'pool_position', sourceStageId: IDS.groups, poolId: IDS.poolA, position: 2 },
            { kind: 'best_of_position', sourceStageId: IDS.groups, position: 3, count: 1, normalization: 'raw' },
            { kind: 'top_overall', sourceStageId: IDS.groups, count: 1, normalization: 'per_match_average' },
            { kind: 'knockout_winners', sourceStageId: IDS.groups },
            { kind: 'manual', count: 1, label: 'Wildcard' },
            { kind: 'direct_entry', teamIds: [IDS.eagles] },
          ],
        }),
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    pools: [{ id: IDS.poolA, stageId: IDS.groups, name: 'Pool A', orderIndex: 0, legs: null }],
    slots: [
      { id: 'slot-a1', stageId: IDS.knockout, index: 0, role: 'entry', label: 'A1', source: { kind: 'pool_position', stageId: IDS.groups, poolId: IDS.poolA, position: 1 }, seed: 1 },
      { id: 'slot-a2', stageId: IDS.knockout, index: 1, role: 'entry', label: 'A2', source: { kind: 'pool_position', stageId: IDS.groups, poolId: IDS.poolA, position: 2 }, seed: 2 },
      { id: 'slot-best', stageId: IDS.knockout, index: 2, role: 'entry', label: 'Best 3rd', source: { kind: 'best_of_position', stageId: IDS.groups, position: 3, rank: 1, normalization: 'raw' }, seed: null },
      { id: 'slot-overall', stageId: IDS.knockout, index: 3, role: 'entry', label: 'Top overall', source: { kind: 'overall_position', stageId: IDS.groups, rank: 1, normalization: 'raw' }, seed: null },
      { id: 'slot-manual', stageId: IDS.knockout, index: 4, role: 'entry', label: 'Wildcard', source: { kind: 'manual', teamId: IDS.eagles }, seed: null },
      { id: 'slot-final-winner', stageId: IDS.knockout, index: 5, role: 'progression', label: 'Winner Final', source: { kind: 'bracket_winner', stageId: IDS.knockout, round: 1, position: 0 }, seed: null },
      { id: 'slot-final-loser', stageId: IDS.knockout, index: 6, role: 'progression', label: 'Runner-up', source: { kind: 'bracket_loser', stageId: IDS.knockout, round: 1, position: 0 }, seed: null },
      { id: 'slot-fixture-winner', stageId: IDS.knockout, index: 7, role: 'progression', label: 'Winner M1', source: { kind: 'fixture_winner', fixtureId: IDS.fixture1 }, seed: null },
      { id: 'slot-fixture-loser', stageId: IDS.knockout, index: 8, role: 'progression', label: 'Loser M1', source: { kind: 'fixture_loser', fixtureId: IDS.fixture1 }, seed: null },
    ],
    poolEntries: [IDS.lions, IDS.tigers, IDS.eagles, IDS.falcons].map((teamId, index) => ({
      id: `pe-${index + 1}`,
      poolId: IDS.poolA,
      stageId: IDS.groups,
      side: { kind: 'team' as const, teamId },
      seed: index + 1,
    })),
    fixtures: [
      fixture(IDS.fixture1, { status: 'completed', matchId: IDS.match1, matchSides: { teamAId: IDS.lions, teamBId: IDS.tigers } }),
      fixture(IDS.fixture2, { matchNumber: 2, sideA: { kind: 'team', teamId: IDS.eagles }, sideB: { kind: 'team', teamId: IDS.falcons }, venueId: IDS.venue2 }),
      fixture(IDS.final, {
        stageId: IDS.knockout,
        poolId: null,
        matchNumber: 3,
        label: 'Final',
        round: null,
        leg: null,
        bracket: { kind: 'main', round: 1, position: 0, roundName: 'Final' },
        isFinal: true,
        sideA: { kind: 'slot', slotId: 'slot-a1' },
        sideB: { kind: 'slot', slotId: 'slot-a2' },
      }),
    ],
    matches: [
      match(IDS.match1, {
        status: 'completed',
        tournamentId: IDS.tournament,
        fixtureId: IDS.fixture1,
        result: {
          type: 'win',
          winnerTeamId: IDS.tigers,
          loserTeamId: IDS.lions,
          margin: { kind: 'wickets', wickets: 2, ballsRemaining: 4 },
          method: 'normal',
        },
        winnerTeamId: IDS.tigers,
        startedAt: T0,
        completedAt: T0,
      }),
      match(IDS.match2, {
        title: 'Friendly',
        teamBId: IDS.eagles,
        venueId: null,
        toss: { winnerTeamId: IDS.eagles, decision: 'bowl' },
        status: 'live',
        startedAt: T0,
      }),
    ],
    matchPlayers: [
      ...squad(IDS.match1, IDS.lions, LIONS),
      { matchId: IDS.match1, playerId: LIONS_SUB, teamId: IDS.lions, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true },
      ...squad(IDS.match1, IDS.tigers, TIGERS),
      ...squad(IDS.match2, IDS.lions, LIONS),
      ...squad(IDS.match2, IDS.eagles, EAGLES),
    ],
    matchEvents: [...match1Events(), ...coverageEvents()],
    overrides,
    auditEvents: [
      audit('au-1', { newValue: { name: 'Spring Cup', teamId: IDS.lions } }),
      audit('au-2', {
        action: 'result_recorded',
        entityType: 'match',
        entityId: IDS.match1,
        matchId: IDS.match1,
        previousValue: { winnerTeamId: IDS.lions },
        impact: IMPACT,
      }),
      audit('au-3', { action: 'backup_imported', entityType: 'backup', entityId: 'export-previous', tournamentId: null }),
      audit('au-4', { action: 'stage_deleted', entityType: 'stage', entityId: 'stage-deleted-long-ago' }),
      audit('au-5', { action: 'rules_changed', entityType: 'rules', entityId: IDS.tournament }),
    ],
    templates: [
      {
        id: 'tpl-club',
        name: 'Club league',
        description: 'Single league',
        builtin: false,
        teamCount: 4,
        structureKind: 'league',
        pointsSystem: POINTS,
        nrr: NRR,
        tieBreakers: ['points', 'nrr'],
        defaultFormatId: 'custom',
        defaultMatchRules: RULES,
        stages: [
          {
            key: 'league',
            name: 'League',
            type: 'league',
            poolCount: 1,
            poolSizes: null,
            poolSlotIndexes: null,
            fixtureGeneration: { method: 'round_robin', legs: 1 },
            seeding: 'fixed',
            seedingNormalization: 'raw',
            entry: [{ kind: 'direct_entry', count: 4 }],
            knockout: null,
            abandonedMatches: 'no_result',
            decidesChampion: true,
            headToHeadRequiresCompleteMiniLeague: false,
            formatId: null,
            matchRules: null,
            pointsSystem: null,
            tieBreakers: null,
            nrr: null,
          },
        ],
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    formatPresets: [{ id: 'preset-club-6', label: 'Club 6 overs', description: '', builtin: false, rules: { ...RULES, oversPerInnings: 6 } }],
    settings: {
      theme: 'system',
      hapticsEnabled: true,
      soundEnabled: false,
      reducedMotion: 'system',
      defaultFormatId: 'T20',
      scoring: { confirmInningsEnd: true, autoPromptBowler: true, dotStyle: 'zero', keepAwake: true },
    },
  };
}

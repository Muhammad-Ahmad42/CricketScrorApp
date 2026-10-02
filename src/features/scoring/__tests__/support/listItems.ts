import type { InningsLine, MatchListItem, TournamentListItem } from '@/domain/types';

export function inningsLine(overrides: Partial<InningsLine> = {}): InningsLine {
  return {
    inningsIndex: 0,
    kind: 'regular',
    battingTeamId: 'PAK',
    runs: 142,
    wickets: 4,
    legalBalls: 100,
    ballsPerOver: 6,
    status: 'in_progress',
    completionReason: null,
    ...overrides,
  };
}

export function listItem(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 'm-live',
    title: 'Pakistan XI v Lions',
    status: 'live',
    result: null,
    teamA: { id: 'PAK', name: 'Pakistan XI', shortName: 'PAK' },
    teamB: { id: 'LIO', name: 'Lions', shortName: 'LIO' },
    oversPerInnings: 20,
    innings: [inningsLine()],
    scheduledDate: '2026-09-12',
    tournamentId: null,
    tournamentName: null,
    resumeDismissedAt: null,
    updatedAt: '2026-09-12T14:32:00.000Z',
    ...overrides,
  };
}

export function completedItem(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return listItem({
    id: 'm-done',
    title: 'Lions v Tigers',
    status: 'completed',
    teamA: { id: 'LIO', name: 'Lions', shortName: 'LIO' },
    teamB: { id: 'TIG', name: 'Tigers', shortName: 'TIG' },
    result: { type: 'win', winnerTeamId: 'LIO', loserTeamId: 'TIG', margin: { kind: 'wickets', wickets: 5, ballsRemaining: 12 }, method: 'normal' },
    innings: [
      inningsLine({ battingTeamId: 'TIG', runs: 168, wickets: 7, legalBalls: 120, status: 'complete', completionReason: 'overs_complete' }),
      inningsLine({ inningsIndex: 1, battingTeamId: 'LIO', runs: 169, wickets: 5, legalBalls: 108, status: 'complete', completionReason: 'target_reached' }),
    ],
    ...overrides,
  });
}

export function tournamentItem(overrides: Partial<TournamentListItem> = {}): TournamentListItem {
  return {
    id: 't-1',
    name: 'City Cup 2026',
    season: '2026',
    status: 'active',
    teamCount: 8,
    fixturesDone: 24,
    fixturesTotal: 48,
    championName: null,
    startDate: '2026-09-01',
    endDate: '2026-10-30',
    updatedAt: '2026-09-12T10:00:00.000Z',
    ...overrides,
  };
}

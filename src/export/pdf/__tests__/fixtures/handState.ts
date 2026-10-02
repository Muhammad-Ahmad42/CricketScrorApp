import type {
  BallToken,
  BattingCardRow,
  BowlingCardRow,
  InningsState,
  Match,
  MatchPlayer,
  MatchRules,
  MatchSetup,
  MatchState,
  OverSummary,
  Partnership,
} from '@/domain/types';

export const RULES: MatchRules = {
  oversPerInnings: 2,
  ballsPerOver: 6,
  playersPerSide: 11,
  lastManStands: false,
  maxOversPerBowler: null,
  bowlerQuotaMode: 'uniform',
  allowBowlerConsecutiveOvers: true,
  wide: { penaltyRuns: 1, countsAsBall: false },
  noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: false },
  powerplays: [],
  superOver: { enabled: true, overs: 1, maxWickets: 2, ifTiedAgain: 'repeat', maxRounds: null, restrictRepeatPlayers: true },
  mandatoryRetirement: null,
};

export const HOME = 'team-home';
export const AWAY = 'team-away';
export const HOME_NAME = 'Lions & <Co>';
export const AWAY_NAME = 'Tigers "XI"';
export const SCRIPT_NAME = '<script>alert(1)</script>';

function player(playerId: string, teamId: string, name: string, extra: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    matchId: 'm-hand',
    playerId,
    teamId,
    name,
    jerseyNumber: null,
    role: 'unknown',
    battingOrder: null,
    isCaptain: false,
    isWicketKeeper: false,
    isSubstitute: false,
    ...extra,
  };
}

export const PLAYERS: readonly MatchPlayer[] = [
  player('h1', HOME, 'Babar', { isCaptain: true, battingOrder: 1 }),
  player('h2', HOME, SCRIPT_NAME, { battingOrder: 2 }),
  player('h3', HOME, 'Saim', { battingOrder: 3 }),
  player('h4', HOME, 'Rizwan-L', { battingOrder: 4, isWicketKeeper: true }),
  player('h5', HOME, 'بابر', { battingOrder: 5 }),
  player('a1', AWAY, 'Rizwan', { isWicketKeeper: true, battingOrder: 1 }),
  player('a2', AWAY, 'Shan', { battingOrder: 2 }),
  player('a3', AWAY, 'Hassan', { battingOrder: 3 }),
  player('a12', AWAY, 'Ali \u{1F3CF}', { isSubstitute: true }),
];

function token(text: string, kind: BallToken['kind'], label: string): BallToken {
  return { text, kind, isLegal: kind !== 'wide' && kind !== 'no_ball', isFreeHit: false, accessibilityLabel: label };
}

function batting(partial: Partial<BattingCardRow> & Pick<BattingCardRow, 'playerId' | 'name' | 'status'>): BattingCardRow {
  return {
    position: null,
    atCrease: null,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dots: 0,
    strikeRate: null,
    dismissal: null,
    dismissalText: '',
    returnedFromRetirement: false,
    ...partial,
  };
}

function bowling(partial: Partial<BowlingCardRow> & Pick<BowlingCardRow, 'playerId' | 'name'>): BowlingCardRow {
  return {
    order: 1,
    legalBalls: 6,
    oversUsed: 1,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    economy: 0,
    dots: 0,
    wideDeliveries: 0,
    wideRuns: 0,
    noBallDeliveries: 0,
    foursConceded: 0,
    sixesConceded: 0,
    isCurrent: false,
    ...partial,
  };
}

function over(partial: Partial<OverSummary> & Pick<OverSummary, 'overIndex' | 'tokens'>): OverSummary {
  return {
    bowlerIds: ['a3'],
    runs: 0,
    bowlerRuns: 0,
    wickets: 0,
    legalBalls: 6,
    extras: 0,
    isComplete: true,
    isMaiden: false,
    scoreAtEnd: { runs: 0, wickets: 0 },
    ...partial,
  };
}

function partnership(partial: Partial<Partnership> & Pick<Partnership, 'index' | 'batterAId'>): Partnership {
  return {
    wicketNumber: 1,
    batterBId: null,
    runs: 0,
    balls: 0,
    batterARuns: 0,
    batterABalls: 0,
    batterBRuns: 0,
    batterBBalls: 0,
    extras: 0,
    endedBy: 'wicket',
    ...partial,
  };
}

function innings(partial: Partial<InningsState> & Pick<InningsState, 'index' | 'battingTeamId' | 'bowlingTeamId'>): InningsState {
  return {
    kind: 'regular',
    superOverRound: null,
    status: 'complete',
    completion: { reason: 'overs_complete', atSeq: 10 },
    runs: 0,
    wickets: 0,
    legalBalls: 12,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 0 },
    limits: { maxBalls: 12, maxWickets: 10, maxOversPerBowler: null, bowlerQuotaMode: 'uniform', extraOverBowlers: 0, revised: false },
    target: null,
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    previousOverBowlerIds: [],
    removedBowlerIds: [],
    isFreeHitNext: false,
    currentOver: null,
    balls: [],
    overs: [],
    batting: [],
    bowling: [],
    partnerships: [],
    currentPartnership: null,
    fallOfWickets: [],
    powerplay: { active: null, phases: [] },
    revisions: [],
    runRate: 12.5,
    ...partial,
  };
}

export const FIRST_INNINGS = innings({
  index: 0,
  battingTeamId: HOME,
  bowlingTeamId: AWAY,
  runs: 25,
  wickets: 1,
  legalBalls: 12,
  runRate: 12.5,
  extras: { wides: 6, noBalls: 2, byes: 1, legByes: 3, penalty: 0, total: 12 },
  batting: [
    batting({ playerId: 'h1', name: 'Babar', status: 'not_out', position: 1, runs: 9, balls: 7, fours: 1, sixes: 0, strikeRate: 128.571, dismissalText: 'not out' }),
    batting({ playerId: 'h2', name: SCRIPT_NAME, status: 'out', position: 2, runs: 4, balls: 3, fours: 1, strikeRate: 133.333, dismissalText: 'c sub (Ali \u{1F3CF}) b Hassan' }),
    batting({ playerId: 'h3', name: 'Saim', status: 'absent', dismissalText: 'absent hurt' }),
    batting({ playerId: 'h4', name: 'Rizwan-L', status: 'yet_to_bat' }),
    batting({ playerId: 'h5', name: 'بابر', status: 'yet_to_bat' }),
  ],
  fallOfWickets: [{ wicketNumber: 1, playerOutId: 'h2', teamRuns: 18, legalBalls: 5, overLabel: '0.5', dismissalType: 'caught', seq: 7 }],
  bowling: [
    bowling({ playerId: 'a3', name: 'Hassan', legalBalls: 12, oversUsed: 2, maidens: 0, runsConceded: 20, wickets: 1, economy: 10, dots: 4, wideDeliveries: 2, noBallDeliveries: 1 }),
  ],
  partnerships: [
    partnership({ index: 0, wicketNumber: 1, batterAId: 'h1', batterBId: 'h2', runs: 18, balls: 5, batterARuns: 5, batterABalls: 2, batterBRuns: 4, batterBBalls: 3, endedBy: 'wicket' }),
  ],
  currentPartnership: partnership({ index: 1, wicketNumber: 2, batterAId: 'h1', runs: 7, balls: 7, batterARuns: 4, batterABalls: 5, endedBy: null }),
  overs: [
    over({
      overIndex: 0,
      runs: 18,
      wickets: 1,
      scoreAtEnd: { runs: 18, wickets: 1 },
      tokens: [token('1', 'runs', 'One run'), token('4', 'four', 'Four'), token('WD', 'wide', 'Wide'), token('W', 'wicket', 'Wicket, caught')],
    }),
    over({ overIndex: 1, runs: 7, scoreAtEnd: { runs: 25, wickets: 1 }, tokens: [token('NB+1', 'no_ball', 'No ball, plus one run'), token('LB1', 'leg_bye', 'One leg bye')] }),
  ],
});

export const SECOND_INNINGS = innings({
  index: 1,
  battingTeamId: AWAY,
  bowlingTeamId: HOME,
  runs: 26,
  wickets: 0,
  legalBalls: 8,
  runRate: 19.5,
  status: 'complete',
  completion: { reason: 'target_reached', atSeq: 20 },
  target: { runs: 26, revised: false, source: 'first_innings' },
  batting: [batting({ playerId: 'a1', name: 'Rizwan', status: 'not_out', runs: 26, balls: 8, fours: 2, sixes: 3, strikeRate: 325, dismissalText: 'not out' })],
});

export const SUPER_OVER = innings({
  index: 2,
  kind: 'super_over',
  superOverRound: 1,
  battingTeamId: HOME,
  bowlingTeamId: AWAY,
  runs: 11,
  wickets: 1,
  legalBalls: 6,
  runRate: 11,
  limits: { maxBalls: 6, maxWickets: 2, maxOversPerBowler: null, bowlerQuotaMode: 'uniform', extraOverBowlers: 0, revised: false },
});

export function handSetup(): MatchSetup {
  return {
    matchId: 'm-hand',
    rules: RULES,
    teams: [
      { id: HOME, name: HOME_NAME, shortName: 'LIO', playersInSide: 11 },
      { id: AWAY, name: AWAY_NAME, shortName: 'TIG', playersInSide: 11 },
    ],
    players: PLAYERS,
    toss: { winnerTeamId: HOME, decision: 'bat' },
  };
}

export function handMatch(): Match {
  return {
    id: 'm-hand',
    title: `${HOME_NAME} v ${AWAY_NAME}`,
    teamAId: HOME,
    teamBId: AWAY,
    venueId: 'venue-1',
    scheduledDate: '2026-09-29',
    scheduledTime: '10:00',
    formatId: 'custom',
    rules: RULES,
    toss: { winnerTeamId: HOME, decision: 'bat' },
    status: 'completed',
    result: { type: 'win', winnerTeamId: AWAY, loserTeamId: HOME, margin: { kind: 'wickets', wickets: 10, ballsRemaining: 4 }, method: 'normal' },
    winnerTeamId: AWAY,
    tournamentId: null,
    fixtureId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    resumeDismissedAt: null,
    startedAt: '2026-09-30T09:05:00.000Z',
    completedAt: '2026-09-30T11:00:00.000Z',
    createdAt: '2026-09-30T09:00:00.000Z',
    updatedAt: '2026-09-30T11:00:00.000Z',
  };
}

export function handState(partial: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'm-hand',
    lifecycle: 'completed',
    innings: [FIRST_INNINGS, SECOND_INNINGS, SUPER_OVER],
    currentInningsIndex: 2,
    superOverRound: 1,
    chase: null,
    currentRunRate: null,
    pendingAction: null,
    canRecordDelivery: false,
    retirementsDue: [],
    naturalResult: null,
    result: null,
    resultText: `${AWAY_NAME} won by 10 wickets (4 balls left)`,
    suspension: null,
    plannedRevisions: [],
    carriedPenalties: [],
    lastSeq: 30,
    lastAppliedSeq: 30,
    issues: [],
    needsRepair: false,
    ...partial,
  };
}

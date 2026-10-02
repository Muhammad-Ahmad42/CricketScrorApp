import type { StandingRow, StandingsTable, TeamQualification } from '@/domain/types';

export function standingRow(partial: Partial<StandingRow> & Pick<StandingRow, 'position'>): StandingRow {
  const teamId = partial.teamId === undefined ? `team-${partial.position}` : partial.teamId;
  return {
    sharedPosition: false,
    side: teamId === null ? { kind: 'slot', slotId: `slot-${partial.position}` } : { kind: 'team', teamId },
    slotLabel: null,
    teamId,
    provisional: false,
    membership: 'active',
    played: 3,
    won: 2,
    lost: 1,
    tied: 0,
    noResult: 0,
    points: 4,
    pointsAdjustment: 0,
    bonusPoints: 0,
    runsScored: 100,
    ballsFaced: 60,
    runsConceded: 90,
    ballsBowled: 60,
    oversFaced: 10,
    oversBowled: 10,
    runRate: 10,
    nrr: 1,
    matchesRemaining: 0,
    form: ['W', 'L', 'W'],
    qualification: null,
    tieBreak: null,
    ...partial,
  };
}

export function qualification(teamId: string, explanation: string): TeamQualification {
  return {
    teamId,
    stageId: 'stage-groups',
    poolId: 'pool-a',
    state: 'qualified',
    certainty: 'mathematical',
    targetStageId: 'stage-ko',
    slotIds: [],
    targets: [],
    explanation,
    override: null,
  };
}

export function standingsTable(rows: readonly StandingRow[], poolId: string | null = 'pool-a'): StandingsTable {
  return {
    stageId: 'stage-groups',
    poolId,
    rows,
    tieBreakers: ['points', 'nrr'],
    complete: false,
    unresolvedTies: [],
    provisionalTies: [],
  };
}

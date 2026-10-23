import {
  canTransitionTournament,
  tournamentEditPolicy,
  type EditPermission,
  type TournamentEditPolicy,
  type TournamentGuardContext,
} from '@/domain/tournament/stateMachine';
import type { ProposedChange, TournamentStatus } from '@/domain/types';
import type { TournamentIndex } from './names';

export function guardContext(index: TournamentIndex): TournamentGuardContext {
  const { snapshot, evaluation } = index;
  const firstStage = index.stages[0];
  const firstPools = firstStage ? index.poolsOf(firstStage.id) : [];
  const poolsComplete =
    firstPools.length === 0 || firstPools.every((pool) => snapshot.poolEntries.some((entry) => entry.poolId === pool.id));
  const withMatch = snapshot.fixtures.filter((fixture) => fixture.matchId !== null);
  return {
    activeTeamCount: snapshot.teams.filter((view) => view.membership.status === 'active').length,
    stageCount: snapshot.stages.length,
    poolsComplete,
    firstStageFixturesConfirmed: firstStage ? snapshot.fixtures.some((fixture) => fixture.stageId === firstStage.id) : false,
    matchesStarted: withMatch.length,
    matchesCompleted: withMatch.filter((fixture) => fixture.status === 'completed' || fixture.status === 'abandoned').length,
    allStagesComplete: evaluation !== null && evaluation.stages.length > 0 && evaluation.stages.every((stage) => stage.complete),
    championDecided: evaluation?.champion !== null && evaluation?.champion !== undefined && evaluation.champion.teamIds.length > 0,
  };
}

export function editPolicy(index: TournamentIndex): TournamentEditPolicy {
  return tournamentEditPolicy(index.snapshot.tournament.status, guardContext(index));
}

export function changePolicyField(change: ProposedChange): keyof TournamentEditPolicy {
  switch (change.kind) {
    case 'pool_move':
    case 'pool_swap':
    case 'pools_replace':
      return 'pools';
    case 'team_replace':
    case 'team_withdraw':
      return 'removeTeams';
    case 'team_seeds_change':
      return 'seeds';
    case 'stage_upsert':
    case 'stage_delete':
    case 'slot_change':
      return 'stages';
    case 'fixture_add':
    case 'fixture_delete':
    case 'fixtures_replace':
      return 'generateFixtures';
    case 'fixture_update':
      return change.patch.sideA || change.patch.sideB ? 'fixtureTeams' : 'fixtureSchedule';
    case 'match_result_change':
      return 'matchResults';
    case 'rules_change':
      return 'rules';
    case 'override_apply':
    case 'override_revoke':
      return 'overrides';
    default: {
      const unreachable: never = change;
      return unreachable;
    }
  }
}

export function changePermission(index: TournamentIndex, change: ProposedChange): EditPermission {
  return editPolicy(index)[changePolicyField(change)];
}

export function changeNeedsReason(index: TournamentIndex, change: ProposedChange): boolean {
  return changePermission(index, change) === 'confirm';
}

export interface StatusActionVM {
  readonly to: TournamentStatus;
  readonly label: string;
  readonly description: string;
  readonly needsReason: boolean;
  readonly testID: string;
  readonly enabled: boolean;
  readonly blockedReason: string | null;
  readonly warnings: readonly string[];
}

interface Candidate {
  readonly from: TournamentStatus;
  readonly to: TournamentStatus;
  readonly label: string;
  readonly description: string;
  readonly needsReason: boolean;
  readonly testID: string;
}

const CANDIDATES: readonly Candidate[] = [
  {
    from: 'fixtures_generated',
    to: 'active',
    label: 'Start tournament',
    description: 'Opens the fixtures for scoring.',
    needsReason: false,
    testID: 'tmanage-btn-start',
  },
  {
    from: 'active',
    to: 'completed',
    label: 'Complete tournament',
    description: 'You can reopen it later.',
    needsReason: false,
    testID: 'tmanage-btn-complete',
  },
  {
    from: 'completed',
    to: 'active',
    label: 'Reopen for correction',
    description: 'Allows corrections again.',
    needsReason: true,
    testID: 'tmanage-btn-reopen',
  },
  {
    from: 'completed',
    to: 'archived',
    label: 'Archive',
    description: 'Read only',
    needsReason: false,
    testID: 'tmanage-btn-archive',
  },
  {
    from: 'archived',
    to: 'completed',
    label: 'Unarchive',
    description: 'Editable again',
    needsReason: false,
    testID: 'tmanage-btn-unarchive',
  },
];

export function statusActions(index: TournamentIndex): readonly StatusActionVM[] {
  const status = index.snapshot.tournament.status;
  const ctx = guardContext(index);
  return CANDIDATES.filter((candidate) => candidate.from === status).map((candidate) => {
    const guard = canTransitionTournament(candidate.from, candidate.to, ctx);
    return {
      to: candidate.to,
      label: candidate.label,
      description: candidate.description,
      needsReason: candidate.needsReason,
      testID: candidate.testID,
      enabled: guard.ok,
      blockedReason: guard.ok ? null : guard.reason,
      warnings: guard.ok ? guard.warnings : [],
    };
  });
}

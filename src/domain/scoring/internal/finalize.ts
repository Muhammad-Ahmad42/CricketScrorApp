import type { ChaseState, InningsState, MatchSetup, MatchState, Seq } from '../../types';
import { computeNaturalResult } from '../result';
import { requiredRunRate, runRate } from '../stats';
import { thawInnings, type StateDraft } from './draft';
import { inProgressInnings, latestInnings } from './eligibility';
import { closeInnings, putInnings } from './innings';
import { deriveRetirementsDue, derivePendingAction, resultTextFor } from './pending';
import { withPhaseStates } from './powerplay';

function refreshTargets(state: StateDraft): void {
  for (const entry of state.innings) {
    const target = entry.target;
    if (target === null || target.source === 'revision') {
      continue;
    }
    const partner = state.innings[entry.index - 1];
    if (partner !== undefined && partner.runs + 1 !== target.runs) {
      const innings = thawInnings(entry);
      innings.target = { runs: partner.runs + 1, revised: target.revised, source: target.source };
      putInnings(state, innings);
    }
  }
}

function completionOf(innings: InningsState): 'target_reached' | 'all_out' | 'overs_complete' | null {
  if (innings.target !== null && innings.runs >= innings.target.runs) {
    return 'target_reached';
  }
  if (innings.wickets >= innings.limits.maxWickets) {
    return 'all_out';
  }
  if (innings.legalBalls >= innings.limits.maxBalls) {
    return 'overs_complete';
  }
  return null;
}

function refreshInnings(setup: MatchSetup, state: StateDraft, source: InningsState): void {
  const bpo = setup.rules.ballsPerOver;
  const last = source.overs[source.overs.length - 1];
  const currentOver = source.status === 'in_progress' && last !== undefined && !last.isComplete ? last : null;
  const powerplay = withPhaseStates(source, bpo);
  const rate = runRate(source.runs, source.legalBalls, bpo);
  if (currentOver === source.currentOver && powerplay === source.powerplay && rate === source.runRate) {
    return;
  }
  const innings = thawInnings(source);
  innings.currentOver = currentOver;
  innings.powerplay = powerplay;
  innings.runRate = rate;
  putInnings(state, innings);
}

function chaseOf(setup: MatchSetup, innings: InningsState | null): ChaseState | null {
  if (innings === null || innings.target === null) {
    return null;
  }
  const runsRequired = Math.max(0, innings.target.runs - innings.runs);
  const ballsRemaining = Math.max(0, innings.limits.maxBalls - innings.legalBalls);
  return {
    target: innings.target.runs,
    runsRequired,
    ballsRemaining,
    requiredRunRate: requiredRunRate(runsRequired, ballsRemaining, setup.rules.ballsPerOver),
  };
}

export function finalizeDraft(setup: MatchSetup, before: MatchState, state: StateDraft, seq: Seq): void {
  refreshTargets(state);
  const open = inProgressInnings(state);
  if (open !== null) {
    const reason = completionOf(open);
    if (reason !== null) {
      const innings = thawInnings(open);
      closeInnings(innings, reason, seq);
      putInnings(state, innings);
    }
  }
  state.innings.forEach((entry, index) => {
    if (entry !== before.innings[index]) {
      refreshInnings(setup, state, entry);
    }
  });
  deriveDraft(setup, state);
}

export function deriveDraft(setup: MatchSetup, state: StateDraft): void {
  if (state.result === null) {
    state.naturalResult = computeNaturalResult(setup, state);
  }
  const pendingAction = derivePendingAction(setup, state);
  const inProgress = inProgressInnings(state);
  const latest = latestInnings(state);
  const needsRepair = state.issues.some((issue) => issue.severity === 'error');
  const shown = state.result ?? state.naturalResult;
  state.currentInningsIndex = latest === null ? null : latest.index;
  state.chase = chaseOf(setup, inProgress);
  state.currentRunRate = latest === null ? null : latest.runRate;
  state.pendingAction = pendingAction;
  state.needsRepair = needsRepair;
  state.canRecordDelivery = state.lifecycle === 'live' && pendingAction === null && inProgress !== null && !needsRepair;
  state.retirementsDue = deriveRetirementsDue(setup, state);
  state.resultText = shown === null ? null : resultTextFor(setup, state, shown);
}

import type { InningsState, MatchEventOf, MatchSetup, OversRevisionRecord, PowerplayRule, TargetInfo } from '../../../types';
import { extrasOf, thawInnings, type InningsDraft, type StateDraft } from '../draft';
import { inProgressInnings } from '../eligibility';
import { closeInnings, newBattingRow, putInnings, setPositions, sortBatting, updateBattingRow } from '../innings';
import { startPartnership } from '../partnerships';
import { regularLimits, reviseLimits, superOverLimits } from '../limits';
import { phaseOfIndex } from '../phase';
import { clampPhases, phasesFromBalls } from '../powerplay';
import { battingSquad, otherTeamId } from '../squad';

function initialTarget(state: StateDraft, index: number): TargetInfo | null {
  if (index % 2 === 0) {
    return null;
  }
  const partner = state.innings[index - 1];
  if (partner === undefined) {
    return null;
  }
  return { runs: partner.runs + 1, revised: false, source: index === 1 ? 'first_innings' : 'super_over' };
}

function emptyInnings(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'innings_started'>): InningsDraft {
  const kind = event.inningsIndex <= 1 ? 'regular' : 'super_over';
  const limits = kind === 'regular' ? regularLimits(setup, event.battingTeamId) : superOverLimits(setup, event.battingTeamId);
  const phases = kind === 'regular' ? clampPhases(setup.rules.powerplays, limits.maxBalls, setup.rules.ballsPerOver) : [];
  const batting = sortBatting(
    setup,
    event.battingTeamId,
    battingSquad(setup, event.battingTeamId).map((player) => newBattingRow(player.playerId, player.name)),
  );
  return {
    index: event.inningsIndex,
    kind,
    superOverRound: kind === 'super_over' ? Math.floor(event.inningsIndex / 2) : null,
    battingTeamId: event.battingTeamId,
    bowlingTeamId: otherTeamId(setup, event.battingTeamId),
    status: 'in_progress',
    completion: null,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: extrasOf(0, 0, 0, 0, 0),
    limits,
    target: initialTarget(state, event.inningsIndex),
    strikerId: null,
    nonStrikerId: null,
    bowlerId: event.bowlerId,
    previousOverBowlerIds: [],
    removedBowlerIds: [],
    isFreeHitNext: false,
    currentOver: null,
    balls: [],
    overs: [],
    batting,
    bowling: [],
    partnerships: [],
    currentPartnership: null,
    fallOfWickets: [],
    powerplay: { active: null, phases: phasesFromBalls(phases, { balls: [] }) },
    revisions: [],
    runRate: null,
  };
}

export interface QuotaChange {
  readonly maxOversPerBowler?: number | null;
  readonly bowlerQuotaMode?: InningsState['limits']['bowlerQuotaMode'];
}

export function applyRevisionTo(
  setup: MatchSetup,
  innings: InningsDraft,
  revision: OversRevisionRecord,
  powerplays: readonly PowerplayRule[] | null,
  quota?: QuotaChange,
): void {
  innings.limits = reviseLimits(setup, innings.limits, {
    maxBalls: revision.maxBalls,
    maxOversPerBowler: quota === undefined ? revision.maxOversPerBowler : quota.maxOversPerBowler,
    bowlerQuotaMode: quota?.bowlerQuotaMode,
  });
  const rules = powerplays ?? innings.powerplay.phases.map((phase) => phase.rule);
  const phases = clampPhases(rules, revision.maxBalls, setup.rules.ballsPerOver);
  innings.powerplay = { active: innings.powerplay.active, phases: phasesFromBalls(phases, innings) };
  if (revision.target !== null) {
    innings.target = { runs: revision.target, revised: true, source: 'revision' };
  }
  innings.revisions = [...innings.revisions, { ...revision, maxOversPerBowler: innings.limits.maxOversPerBowler }];
}

export function applyInningsStarted(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'innings_started'>): void {
  const innings = emptyInnings(setup, state, event);
  for (const entry of state.plannedRevisions) {
    if (entry.inningsIndex === event.inningsIndex) {
      applyRevisionTo(setup, innings, entry.revision, entry.powerplays);
    }
  }
  const phase = phaseOfIndex(event.inningsIndex);
  const carried = state.carriedPenalties.filter((entry) => entry.teamId === event.battingTeamId && phaseOfIndex(entry.inningsIndex) === phase);
  const penalty = carried.reduce((sum, entry) => sum + entry.runs, 0);
  if (penalty > 0) {
    const extras = innings.extras;
    innings.runs += penalty;
    innings.extras = extrasOf(extras.wides, extras.noBalls, extras.byes, extras.legByes, extras.penalty + penalty);
  }
  updateBattingRow(innings, event.strikerId, (row) => {
    row.position = 1;
    row.status = 'not_out';
    row.dismissalText = 'not out';
  });
  updateBattingRow(innings, event.nonStrikerId, (row) => {
    row.position = 2;
    row.status = 'not_out';
    row.dismissalText = 'not out';
  });
  innings.batting = sortBatting(setup, innings.battingTeamId, innings.batting);
  setPositions(innings, event.strikerId, event.nonStrikerId);
  startPartnership(innings, event.strikerId, event.nonStrikerId);
  putInnings(state, innings);
  if (state.lifecycle === 'not_started') {
    state.lifecycle = 'live';
  }
  state.plannedRevisions = state.plannedRevisions.filter((entry) => entry.inningsIndex !== event.inningsIndex);
  state.carriedPenalties = state.carriedPenalties.filter((entry) => !carried.includes(entry));
}

export function applySuperOverStarted(state: StateDraft, event: MatchEventOf<'super_over_started'>): void {
  state.superOverRound = event.round;
  state.naturalResult = null;
}

export function applyInningsEnded(state: StateDraft, event: MatchEventOf<'innings_ended'>): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  for (const absentee of event.absentees) {
    updateBattingRow(innings, absentee.playerId, (row) => {
      row.status = 'absent';
      row.atCrease = null;
      row.dismissalText = absentee.hurt ? 'absent hurt' : 'absent';
    });
  }
  closeInnings(innings, event.reason, event.seq);
  putInnings(state, innings);
}

import type {
  BattingCardRow,
  BowlingCardRow,
  ExtrasBreakdown,
  InningsState,
  MatchState,
  OverSummary,
  Partnership,
  PowerplayPhaseStatus,
} from '../../types';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type InningsDraft = Mutable<InningsState>;
export type StateDraft = Mutable<MatchState>;

export function thawInnings(s: InningsState): InningsDraft {
  return {
    index: s.index,
    kind: s.kind,
    superOverRound: s.superOverRound,
    battingTeamId: s.battingTeamId,
    bowlingTeamId: s.bowlingTeamId,
    status: s.status,
    completion: s.completion,
    runs: s.runs,
    wickets: s.wickets,
    legalBalls: s.legalBalls,
    extras: s.extras,
    limits: s.limits,
    target: s.target,
    strikerId: s.strikerId,
    nonStrikerId: s.nonStrikerId,
    bowlerId: s.bowlerId,
    previousOverBowlerIds: s.previousOverBowlerIds,
    removedBowlerIds: s.removedBowlerIds,
    isFreeHitNext: s.isFreeHitNext,
    currentOver: s.currentOver,
    balls: s.balls,
    overs: s.overs,
    batting: s.batting,
    bowling: s.bowling,
    partnerships: s.partnerships,
    currentPartnership: s.currentPartnership,
    fallOfWickets: s.fallOfWickets,
    powerplay: s.powerplay,
    revisions: s.revisions,
    runRate: s.runRate,
  };
}

export function thawState(s: MatchState): StateDraft {
  return {
    matchId: s.matchId,
    lifecycle: s.lifecycle,
    innings: s.innings,
    currentInningsIndex: s.currentInningsIndex,
    superOverRound: s.superOverRound,
    chase: s.chase,
    currentRunRate: s.currentRunRate,
    pendingAction: s.pendingAction,
    canRecordDelivery: s.canRecordDelivery,
    retirementsDue: s.retirementsDue,
    naturalResult: s.naturalResult,
    result: s.result,
    resultText: s.resultText,
    suspension: s.suspension,
    plannedRevisions: s.plannedRevisions,
    carriedPenalties: s.carriedPenalties,
    lastSeq: s.lastSeq,
    lastAppliedSeq: s.lastAppliedSeq,
    issues: s.issues,
    needsRepair: s.needsRepair,
  };
}

export function thawBattingRow(r: BattingCardRow): Mutable<BattingCardRow> {
  return {
    playerId: r.playerId,
    name: r.name,
    position: r.position,
    status: r.status,
    atCrease: r.atCrease,
    runs: r.runs,
    balls: r.balls,
    fours: r.fours,
    sixes: r.sixes,
    dots: r.dots,
    strikeRate: r.strikeRate,
    dismissal: r.dismissal,
    dismissalText: r.dismissalText,
    returnedFromRetirement: r.returnedFromRetirement,
  };
}

export function thawBowlingRow(r: BowlingCardRow): Mutable<BowlingCardRow> {
  return {
    playerId: r.playerId,
    name: r.name,
    order: r.order,
    legalBalls: r.legalBalls,
    oversUsed: r.oversUsed,
    maidens: r.maidens,
    runsConceded: r.runsConceded,
    wickets: r.wickets,
    economy: r.economy,
    dots: r.dots,
    wideDeliveries: r.wideDeliveries,
    wideRuns: r.wideRuns,
    noBallDeliveries: r.noBallDeliveries,
    foursConceded: r.foursConceded,
    sixesConceded: r.sixesConceded,
    isCurrent: r.isCurrent,
  };
}

export function thawPartnership(p: Partnership): Mutable<Partnership> {
  return {
    index: p.index,
    wicketNumber: p.wicketNumber,
    batterAId: p.batterAId,
    batterBId: p.batterBId,
    runs: p.runs,
    balls: p.balls,
    batterARuns: p.batterARuns,
    batterABalls: p.batterABalls,
    batterBRuns: p.batterBRuns,
    batterBBalls: p.batterBBalls,
    extras: p.extras,
    endedBy: p.endedBy,
  };
}

export function thawOver(o: OverSummary): Mutable<OverSummary> {
  return {
    overIndex: o.overIndex,
    bowlerIds: o.bowlerIds,
    runs: o.runs,
    bowlerRuns: o.bowlerRuns,
    wickets: o.wickets,
    legalBalls: o.legalBalls,
    extras: o.extras,
    tokens: o.tokens,
    isComplete: o.isComplete,
    isMaiden: o.isMaiden,
    scoreAtEnd: o.scoreAtEnd,
  };
}

export function thawPhase(p: PowerplayPhaseStatus): Mutable<PowerplayPhaseStatus> {
  return { rule: p.rule, state: p.state, runs: p.runs, wickets: p.wickets, legalBalls: p.legalBalls };
}

export function extrasOf(wides: number, noBalls: number, byes: number, legByes: number, penalty: number): ExtrasBreakdown {
  return { wides, noBalls, byes, legByes, penalty, total: wides + noBalls + byes + legByes + penalty };
}

export function appended<T>(list: readonly T[], item: T): T[] {
  const next = list.slice();
  next.push(item);
  return next;
}

export function replacedAt<T>(list: readonly T[], index: number, item: T): T[] {
  const next = list.slice();
  next[index] = item;
  return next;
}

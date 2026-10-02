import type { InningsState, MatchSetup, Partnership, PlayerId } from '../../types';
import { appended, replacedAt, thawPartnership, type InningsDraft } from './draft';
import { loneAtWickets } from './eligibility';

export function currentPartnershipOf(innings: InningsState): Partnership | null {
  const last = innings.partnerships[innings.partnerships.length - 1];
  return last !== undefined && last.endedBy === null ? last : null;
}

function putCurrentPartnership(innings: InningsDraft, partnership: Partnership): void {
  innings.partnerships = replacedAt(innings.partnerships, innings.partnerships.length - 1, partnership);
  innings.currentPartnership = partnership.endedBy === null ? partnership : null;
}

export function startPartnership(innings: InningsDraft, batterAId: PlayerId, batterBId: PlayerId | null): void {
  if (currentPartnershipOf(innings) !== null) {
    return;
  }
  const partnership: Partnership = {
    index: innings.partnerships.length,
    wicketNumber: innings.wickets + 1,
    batterAId,
    batterBId,
    runs: 0,
    balls: 0,
    batterARuns: 0,
    batterABalls: 0,
    batterBRuns: 0,
    batterBBalls: 0,
    extras: 0,
    endedBy: null,
  };
  innings.partnerships = appended(innings.partnerships, partnership);
  innings.currentPartnership = partnership;
}

export function closePartnership(innings: InningsDraft, endedBy: 'wicket' | 'retirement' | 'innings_end'): void {
  const current = currentPartnershipOf(innings);
  if (current === null) {
    return;
  }
  const next = thawPartnership(current);
  next.endedBy = endedBy;
  putCurrentPartnership(innings, next);
}

export interface PartnershipFigures {
  readonly totalRuns: number;
  readonly batterRuns: number;
  readonly extraRuns: number;
  readonly legal: boolean;
  readonly faced: boolean;
}

export function addToPartnership(innings: InningsDraft, strikerId: PlayerId, figures: PartnershipFigures): void {
  const current = currentPartnershipOf(innings);
  if (current === null) {
    return;
  }
  const next = thawPartnership(current);
  const faced = figures.faced ? 1 : 0;
  next.runs += figures.totalRuns;
  next.balls += figures.legal ? 1 : 0;
  next.extras += figures.extraRuns;
  if (next.batterAId === strikerId) {
    next.batterARuns += figures.batterRuns;
    next.batterABalls += faced;
  } else if (next.batterBId === strikerId) {
    next.batterBRuns += figures.batterRuns;
    next.batterBBalls += faced;
  }
  putCurrentPartnership(innings, next);
}

export function startPartnershipIfReady(setup: MatchSetup, innings: InningsDraft, incomingId: PlayerId): void {
  if (loneAtWickets(setup, innings, innings.wickets)) {
    if (innings.strikerId !== null) {
      startPartnership(innings, innings.strikerId, null);
    }
    return;
  }
  if (innings.strikerId === null || innings.nonStrikerId === null) {
    return;
  }
  const other = innings.strikerId === incomingId ? innings.nonStrikerId : innings.strikerId;
  startPartnership(innings, other, incomingId);
}

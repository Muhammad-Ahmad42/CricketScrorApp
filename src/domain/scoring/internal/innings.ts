import type {
  BallCount,
  BattingCardRow,
  BowlingCardRow,
  DismissalRecord,
  InningsCompletionReason,
  InningsState,
  MatchSetup,
  PlayerId,
  Seq,
} from '../../types';
import { dismissalText } from '../format';
import { economyRate, strikeRate } from '../stats';
import {
  appended,
  replacedAt,
  thawBattingRow,
  thawBowlingRow,
  type InningsDraft,
  type Mutable,
  type StateDraft,
} from './draft';
import { loneAtWickets } from './eligibility';
import { closePartnership, startPartnership } from './partnerships';
import { findPlayer, squadIndex } from './squad';

export function putInnings(state: StateDraft, innings: InningsState): void {
  state.innings = innings.index < state.innings.length ? replacedAt(state.innings, innings.index, innings) : appended(state.innings, innings);
}

export function newBattingRow(playerId: PlayerId, name: string): BattingCardRow {
  return {
    playerId,
    name,
    position: null,
    status: 'yet_to_bat',
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
  };
}

export function sortBatting(setup: MatchSetup, teamId: string, rows: readonly BattingCardRow[]): BattingCardRow[] {
  const order = squadIndex(setup, teamId);
  return rows.slice().sort((a, b) => {
    const posA = a.position ?? Number.MAX_SAFE_INTEGER;
    const posB = b.position ?? Number.MAX_SAFE_INTEGER;
    if (posA !== posB) {
      return posA - posB;
    }
    return (order.get(a.playerId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.playerId) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function ensureBattingRow(setup: MatchSetup, innings: InningsDraft, playerId: PlayerId): void {
  if (innings.batting.some((row) => row.playerId === playerId)) {
    return;
  }
  const row = newBattingRow(playerId, findPlayer(setup, playerId)?.name ?? 'Unknown');
  innings.batting = sortBatting(setup, innings.battingTeamId, appended(innings.batting, row));
}

export function updateBattingRow(innings: InningsDraft, playerId: PlayerId, mutate: (row: Mutable<BattingCardRow>) => void): void {
  const index = innings.batting.findIndex((row) => row.playerId === playerId);
  if (index < 0) {
    return;
  }
  const row = thawBattingRow(innings.batting[index]);
  mutate(row);
  row.strikeRate = strikeRate(row.runs, row.balls);
  innings.batting = replacedAt(innings.batting, index, row);
}

export function nextBattingPosition(innings: InningsState): number {
  return innings.batting.reduce((max, row) => Math.max(max, row.position ?? 0), 0) + 1;
}

export function assignPosition(setup: MatchSetup, innings: InningsDraft, playerId: PlayerId): void {
  ensureBattingRow(setup, innings, playerId);
  const row = innings.batting.find((candidate) => candidate.playerId === playerId);
  if (row === undefined || row.position !== null) {
    return;
  }
  const position = nextBattingPosition(innings);
  updateBattingRow(innings, playerId, (current) => {
    current.position = position;
  });
  innings.batting = sortBatting(setup, innings.battingTeamId, innings.batting);
}

export function setPositions(innings: InningsDraft, strikerId: PlayerId | null, nonStrikerId: PlayerId | null): void {
  if (innings.strikerId === strikerId && innings.nonStrikerId === nonStrikerId) {
    return;
  }
  const affected = [innings.strikerId, innings.nonStrikerId, strikerId, nonStrikerId];
  innings.strikerId = strikerId;
  innings.nonStrikerId = nonStrikerId;
  const batting = innings.batting.slice();
  let changed = false;
  for (let index = 0; index < batting.length; index += 1) {
    const row = batting[index];
    if (!affected.includes(row.playerId)) {
      continue;
    }
    const atCrease = row.playerId === strikerId ? 'striker' : row.playerId === nonStrikerId ? 'non_striker' : null;
    if (row.atCrease !== atCrease) {
      const next = thawBattingRow(row);
      next.atCrease = atCrease;
      batting[index] = next;
      changed = true;
    }
  }
  if (changed) {
    innings.batting = batting;
  }
}

export function vacate(innings: InningsDraft, playerId: PlayerId): void {
  if (innings.strikerId === playerId) {
    setPositions(innings, null, innings.nonStrikerId);
  } else if (innings.nonStrikerId === playerId) {
    setPositions(innings, innings.strikerId, null);
  }
}

export function setBowler(innings: InningsDraft, bowlerId: PlayerId | null): void {
  innings.bowlerId = bowlerId;
  const bowling = innings.bowling.slice();
  let changed = false;
  for (let index = 0; index < bowling.length; index += 1) {
    const row = bowling[index];
    const isCurrent = row.playerId === bowlerId;
    if (row.isCurrent !== isCurrent) {
      const next = thawBowlingRow(row);
      next.isCurrent = isCurrent;
      bowling[index] = next;
      changed = true;
    }
  }
  if (changed) {
    innings.bowling = bowling;
  }
}

export function newBowlingRow(playerId: PlayerId, name: string, order: number): BowlingCardRow {
  return {
    playerId,
    name,
    order,
    legalBalls: 0,
    oversUsed: 0,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    economy: null,
    dots: 0,
    wideDeliveries: 0,
    wideRuns: 0,
    noBallDeliveries: 0,
    foursConceded: 0,
    sixesConceded: 0,
    isCurrent: false,
  };
}

export function updateBowlingRow(
  setup: MatchSetup,
  innings: InningsDraft,
  playerId: PlayerId,
  mutate: (row: Mutable<BowlingCardRow>) => void,
): void {
  const index = innings.bowling.findIndex((row) => row.playerId === playerId);
  const base = index >= 0 ? innings.bowling[index] : newBowlingRow(playerId, findPlayer(setup, playerId)?.name ?? 'Unknown', innings.bowling.length + 1);
  const row = thawBowlingRow(base);
  mutate(row);
  row.economy = economyRate(row.runsConceded, row.legalBalls, setup.rules.ballsPerOver);
  innings.bowling = index >= 0 ? replacedAt(innings.bowling, index, row) : appended(innings.bowling, row);
}

export function lastLegalBallLabel(legalBalls: BallCount, ballsPerOver: number): string {
  if (legalBalls <= 0) {
    return '0.0';
  }
  const last = legalBalls - 1;
  return `${Math.floor(last / ballsPerOver)}.${(last % ballsPerOver) + 1}`;
}

export interface WicketInput {
  readonly type: DismissalRecord['type'];
  readonly playerOutId: PlayerId;
  readonly bowlerId: PlayerId | null;
  readonly creditedBowlerId: PlayerId | null;
  readonly fielderIds: readonly PlayerId[];
  readonly seq: Seq;
  readonly onDelivery: boolean;
  readonly overLabel: string;
}

export function recordWicket(setup: MatchSetup, innings: InningsDraft, input: WicketInput): DismissalRecord {
  const dismissal: DismissalRecord = {
    type: input.type,
    playerOutId: input.playerOutId,
    bowlerId: input.bowlerId,
    creditedBowlerId: input.creditedBowlerId,
    fielderIds: input.fielderIds,
    text: dismissalText({ type: input.type, bowlerId: input.creditedBowlerId ?? input.bowlerId, fielderIds: input.fielderIds }, setup.players),
    wicketNumber: innings.wickets + 1,
    teamRuns: innings.runs,
    legalBalls: innings.legalBalls,
    seq: input.seq,
    onDelivery: input.onDelivery,
  };
  assignPosition(setup, innings, input.playerOutId);
  closePartnership(innings, 'wicket');
  vacate(innings, input.playerOutId);
  updateBattingRow(innings, input.playerOutId, (row) => {
    row.status = 'out';
    row.atCrease = null;
    row.dismissal = dismissal;
    row.dismissalText = dismissal.text;
  });
  innings.wickets += 1;
  innings.fallOfWickets = appended(innings.fallOfWickets, {
    wicketNumber: dismissal.wicketNumber,
    playerOutId: input.playerOutId,
    teamRuns: dismissal.teamRuns,
    legalBalls: dismissal.legalBalls,
    overLabel: input.overLabel,
    dismissalType: input.type,
    seq: input.seq,
  });
  if (input.creditedBowlerId !== null) {
    updateBowlingRow(setup, innings, input.creditedBowlerId, (row) => {
      row.wickets += 1;
    });
  }
  return dismissal;
}

export function enterLoneModeIfDue(setup: MatchSetup, innings: InningsDraft): void {
  if (!loneAtWickets(setup, innings, innings.wickets)) {
    return;
  }
  const survivor = innings.strikerId ?? innings.nonStrikerId;
  setPositions(innings, survivor, null);
  if (survivor !== null) {
    startPartnership(innings, survivor, null);
  }
}

export function closeInnings(innings: InningsDraft, reason: InningsCompletionReason, seq: Seq): void {
  if (innings.status === 'complete') {
    return;
  }
  closePartnership(innings, 'innings_end');
  setBowler(innings, null);
  innings.status = 'complete';
  innings.completion = { reason, atSeq: seq };
  innings.isFreeHitNext = false;
  innings.currentOver = null;
}

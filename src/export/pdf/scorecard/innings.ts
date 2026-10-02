import { formatOvers, formatRate, formatScore } from '@/domain/scoring';
import type {
  BattingCardRow,
  BowlingCardRow,
  FallOfWicket,
  InningsCompletionReason,
  InningsState,
  MatchPlayer,
  OverSummary,
  Partnership,
  PlayerId,
} from '@/domain/types';
import { joinPresent, ordinal, type NameLookup } from '../text';
import type { BattingLine, BowlingLine, InningsDocument, OverLine, PartnershipLine } from './model';

export interface InningsContext {
  readonly ballsPerOver: number;
  readonly teamName: NameLookup;
  readonly playerName: NameLookup;
  readonly squad: ReadonlyMap<PlayerId, MatchPlayer>;
}

const NOT_OUT_STATUSES: ReadonlySet<BattingCardRow['status']> = new Set(['not_out', 'retired_not_out', 'retired_hurt']);

function marks(playerId: PlayerId, ctx: InningsContext): string {
  const player = ctx.squad.get(playerId);
  if (player === undefined) {
    return '';
  }
  return joinPresent([player.isCaptain ? '(c)' : null, player.isWicketKeeper ? '†' : null], ' ');
}

function battingLine(row: BattingCardRow, ctx: InningsContext): BattingLine {
  const absent = row.status === 'absent';
  const figure = (value: number) => (absent ? '' : String(value));
  return {
    name: row.name,
    marks: marks(row.playerId, ctx),
    dismissal: row.dismissalText,
    runs: absent ? '' : `${row.runs}${NOT_OUT_STATUSES.has(row.status) ? '*' : ''}`,
    balls: figure(row.balls),
    fours: figure(row.fours),
    sixes: figure(row.sixes),
    strikeRate: absent ? '' : formatRate(row.strikeRate),
    notOut: NOT_OUT_STATUSES.has(row.status),
  };
}

function bowlingLine(row: BowlingCardRow, ctx: InningsContext): BowlingLine {
  return {
    name: row.name,
    overs: formatOvers(row.legalBalls, ctx.ballsPerOver),
    maidens: String(row.maidens),
    runs: String(row.runsConceded),
    wickets: String(row.wickets),
    economy: formatRate(row.economy),
    dots: String(row.dots),
    wides: String(row.wideDeliveries),
    noBalls: String(row.noBallDeliveries),
  };
}

function fallOfWicket(fow: FallOfWicket, ctx: InningsContext): string {
  return `${fow.wicketNumber}-${fow.teamRuns} (${ctx.playerName(fow.playerOutId)}, ${fow.overLabel})`;
}

function partnershipLine(p: Partnership, ctx: InningsContext): PartnershipLine {
  const first = `${ctx.playerName(p.batterAId)} ${p.batterARuns} (${p.batterABalls})`;
  const second = p.batterBId === null ? null : `${ctx.playerName(p.batterBId)} ${p.batterBRuns} (${p.batterBBalls})`;
  return {
    wicket: ordinal(p.wicketNumber),
    batters: joinPresent([first, second], ', '),
    runs: `${p.runs}${p.endedBy === null ? '*' : ''}`,
    balls: String(p.balls),
    unbroken: p.endedBy === null,
  };
}

function overLine(over: OverSummary, ctx: InningsContext): OverLine {
  return {
    over: String(over.overIndex + 1),
    bowler: over.bowlerIds.map((id) => ctx.playerName(id)).join(' / '),
    balls: over.tokens.map((token) => ({ text: token.text, wicket: token.kind === 'wicket', label: token.accessibilityLabel })),
    runs: String(over.runs),
    wickets: String(over.wickets),
    score: formatScore(over.scoreAtEnd.runs, over.scoreAtEnd.wickets),
  };
}

function withCurrent<T extends object>(list: readonly T[], current: T | null, same: (a: T, b: T) => boolean): readonly T[] {
  return current === null || list.some((entry) => same(entry, current)) ? list : [...list, current];
}

function completionNote(innings: InningsState): string | null {
  if (innings.status === 'in_progress') {
    return 'in progress';
  }
  const reason: InningsCompletionReason | undefined = innings.completion?.reason;
  switch (reason) {
    case 'all_out':
    case 'batters_unavailable':
      return 'all out';
    case 'declared':
      return 'declared';
    case 'terminated':
      return 'play terminated';
    case 'match_ended':
      return 'innings closed';
    case 'overs_complete':
    case 'target_reached':
    case undefined:
      return null;
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

function heading(innings: InningsState, ctx: InningsContext): string {
  const team = ctx.teamName(innings.battingTeamId);
  if (innings.kind === 'super_over') {
    return innings.superOverRound === null ? `Super over — ${team}` : `Super over ${innings.superOverRound} — ${team}`;
  }
  return `${team} innings`;
}

function targetLine(innings: InningsState, ctx: InningsContext): string | null {
  if (innings.target === null) {
    return null;
  }
  const overs = formatOvers(innings.limits.maxBalls, ctx.ballsPerOver);
  const label = innings.target.revised ? 'Revised target' : 'Target';
  return `${label} ${innings.target.runs} from ${overs} ${overs === '1' ? 'over' : 'overs'}`;
}

export function inningsDocument(innings: InningsState, ctx: InningsContext): InningsDocument {
  const overs = formatOvers(innings.legalBalls, ctx.ballsPerOver);
  const extras = innings.extras;
  const partnerships = withCurrent(innings.partnerships, innings.currentPartnership, (a, b) => a.index === b.index);
  const overList = withCurrent(innings.overs, innings.currentOver, (a, b) => a.overIndex === b.overIndex);
  return {
    heading: heading(innings, ctx),
    score: formatScore(innings.runs, innings.wickets),
    oversLabel: `${overs} ov`,
    target: targetLine(innings, ctx),
    batting: innings.batting.filter((row) => row.status !== 'yet_to_bat').map((row) => battingLine(row, ctx)),
    extras: String(extras.total),
    extrasDetail: `(b ${extras.byes}, lb ${extras.legByes}, w ${extras.wides}, nb ${extras.noBalls}, p ${extras.penalty})`,
    total: formatScore(innings.runs, innings.wickets),
    totalDetail: `(${joinPresent([completionNote(innings), `${overs} ov`, `RR ${formatRate(innings.runRate)}`], ', ')})`,
    didNotBat: innings.batting.filter((row) => row.status === 'yet_to_bat').map((row) => row.name),
    fallOfWickets: innings.fallOfWickets.map((fow) => fallOfWicket(fow, ctx)),
    bowling: innings.bowling.map((row) => bowlingLine(row, ctx)),
    partnerships: partnerships.map((p) => partnershipLine(p, ctx)),
    overs: overList.map((over) => overLine(over, ctx)),
  };
}

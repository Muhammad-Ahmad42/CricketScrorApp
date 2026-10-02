import type { BallRecord, InningsState, MatchEvent, MatchSetup } from '@/domain/types';
import type { LiveMatch } from '@/services/contracts';
import { formatOvers, formatScore } from '@/domain/scoring/format';
import { OFF_BALL_LABEL, RETIREMENT_LABEL, SUSPENSION_TEXT } from '@/features/scoring/selectors/labels';
import { playerName, teamName } from '@/features/scoring/selectors/names';
import { chipOf, type ChipVM, type DotStyle } from '@/features/scoring/selectors/scoreboard';

export interface BallCellVM {
  readonly key: string;
  readonly seq: number;
  readonly chip: ChipVM;
  readonly label: string;
  readonly accessibilityLabel: string;
}

export interface OverGroupVM {
  readonly key: string;
  readonly heading: string;
  readonly summary: string;
  readonly cells: readonly BallCellVM[];
  readonly notes: readonly string[];
  readonly isCurrent: boolean;
}

export function eventNote(event: MatchEvent, setup: MatchSetup): string | null {
  switch (event.kind) {
    case 'innings_started':
      return `${teamName(setup, event.battingTeamId)} innings: ${playerName(setup, event.strikerId)} and ${playerName(setup, event.nonStrikerId)} open, ${playerName(setup, event.bowlerId)} to bowl`;
    case 'batter_in':
      return `${playerName(setup, event.playerId)} comes in`;
    case 'bowler_selected':
      if (event.reason === 'over_start') {
        return `${playerName(setup, event.bowlerId)} to bowl`;
      }
      return `${playerName(setup, event.bowlerId)} takes over (${event.reason === 'injury' ? 'injury' : 'bowler suspended'})`;
    case 'strike_swapped':
      return 'Strike swapped';
    case 'batter_retired':
      return `${playerName(setup, event.playerId)}: ${RETIREMENT_LABEL[event.retirement].toLowerCase()}`;
    case 'batter_dismissed':
      return `${playerName(setup, event.playerId)}: ${OFF_BALL_LABEL[event.type].toLowerCase()}`;
    case 'penalty_awarded':
      return `Penalty +${event.runs} (${teamName(setup, event.teamId)}): ${event.reason}`;
    case 'overs_revised':
      return `Overs revised to ${formatOvers(event.maxBalls, setup.rules.ballsPerOver)}${event.target === null ? '' : `, target ${event.target}`}: ${event.reason}`;
    case 'play_suspended':
      return `Play suspended: ${SUSPENSION_TEXT[event.reason].toLowerCase()}`;
    case 'play_resumed':
      return 'Play resumed';
    case 'innings_ended':
      return event.reason === 'declared' ? 'Innings declared' : 'Innings ended: no batters available';
    case 'super_over_started':
      return `Super over ${event.round}`;
    case 'match_ended':
      return 'Match ended';
    case 'delivery':
      return null;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

export function inningsEvents(events: readonly MatchEvent[], inningsIndex: number): readonly MatchEvent[] {
  const starts = events.filter((event) => event.kind === 'innings_started').map((event) => event.seq);
  const from = starts[inningsIndex];
  if (from === undefined) {
    return [];
  }
  const to = starts[inningsIndex + 1] ?? Number.MAX_SAFE_INTEGER;
  return events.filter((event) => event.seq >= from && event.seq < to);
}

function cellOf(ball: BallRecord, dotStyle: DotStyle, setup: MatchSetup): BallCellVM {
  const legal = ball.isLegal ? `.${ball.ballInOver}` : '';
  return {
    key: ball.eventId,
    seq: ball.seq,
    chip: chipOf(ball.token, dotStyle),
    label: legal,
    accessibilityLabel: `${ball.label}, ${playerName(setup, ball.bowlerId)} to ${playerName(setup, ball.strikerId)}, ${ball.token.accessibilityLabel}`,
  };
}

function overOf(ball: BallRecord | undefined): number {
  return ball?.overIndex ?? 0;
}

export function selectBallLog(live: LiveMatch, innings: InningsState, dotStyle: DotStyle): readonly OverGroupVM[] {
  const { setup } = live;
  const events = inningsEvents(live.events, innings.index);
  const groups = new Map<number, { cells: BallCellVM[]; notes: string[]; balls: BallRecord[] }>();
  const group = (overIndex: number) => {
    const existing = groups.get(overIndex);
    if (existing !== undefined) {
      return existing;
    }
    const created = { cells: [] as BallCellVM[], notes: [] as string[], balls: [] as BallRecord[] };
    groups.set(overIndex, created);
    return created;
  };
  let lastBall: BallRecord | undefined;
  for (const event of events) {
    if (event.kind === 'delivery') {
      const ball = innings.balls.find((entry) => entry.seq === event.seq);
      if (ball === undefined) {
        continue;
      }
      lastBall = ball;
      const target = group(ball.overIndex);
      target.cells.push(cellOf(ball, dotStyle, setup));
      target.balls.push(ball);
      if (ball.wicket !== null) {
        target.notes.push(`${ball.label}  ${playerName(setup, ball.wicket.playerOutId)} ${ball.wicket.text}`);
      }
      continue;
    }
    const note = eventNote(event, setup);
    if (note !== null) {
      const target = lastBall === undefined ? group(0) : lastBall.endsOver && event.kind === 'bowler_selected' ? group(lastBall.overIndex + 1) : group(overOf(lastBall));
      target.notes.push(note);
    }
  }
  const summaries = new Map(innings.overs.map((over) => [over.overIndex, over]));
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([overIndex, entry]) => {
      const summary = summaries.get(overIndex);
      const bowlers = summary?.bowlerIds.map((id) => playerName(setup, id)).join(', ') ?? '';
      return {
        key: `${innings.index}-${overIndex}`,
        heading: `Over ${overIndex + 1}${bowlers ? ` · ${bowlers}` : ''}`,
        summary: summary === undefined ? '' : `${summary.runs} · ${formatScore(summary.scoreAtEnd.runs, summary.scoreAtEnd.wickets)}`,
        cells: entry.cells,
        notes: entry.notes,
        isCurrent: innings.status === 'in_progress' && summary !== undefined && !summary.isComplete,
      };
    });
}

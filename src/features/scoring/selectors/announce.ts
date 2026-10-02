import type { BallRecord, InningsState, MatchEventKind, MatchSetup, MatchState } from '@/domain/types';
import type { LiveMatch } from '@/services/contracts';
import { formatOvers } from '@/domain/scoring/format';
import { lastActionGroup } from '@/domain/scoring/history';
import { playerName, teamName } from './names';

const ACTION_TEXT: { readonly [K in MatchEventKind]: string } = {
  delivery: 'ball',
  innings_started: 'start of the innings',
  batter_in: 'new batter',
  bowler_selected: 'bowler choice',
  strike_swapped: 'strike swap',
  batter_retired: 'retirement',
  batter_dismissed: 'dismissal',
  penalty_awarded: 'penalty runs',
  overs_revised: 'overs revision',
  play_suspended: 'suspension of play',
  play_resumed: 'resumption of play',
  innings_ended: 'end of the innings',
  super_over_started: 'start of the super over',
  match_ended: 'match result',
};

interface Located {
  readonly innings: InningsState;
  readonly ball: BallRecord;
}

function locateBall(state: MatchState, matches: (ball: BallRecord) => boolean): Located | null {
  for (let index = state.innings.length - 1; index >= 0; index -= 1) {
    const innings = state.innings[index];
    for (let position = innings.balls.length - 1; position >= 0; position -= 1) {
      const ball = innings.balls[position];
      if (matches(ball)) {
        return { innings, ball };
      }
    }
  }
  return null;
}

export function ballDescription(setup: MatchSetup, ball: BallRecord): string {
  if (ball.wicket === null) {
    return ball.token.accessibilityLabel;
  }
  return `${ball.token.accessibilityLabel}, ${playerName(setup, ball.wicket.playerOutId)} ${ball.wicket.text}`;
}

function scoreSentence(setup: MatchSetup, innings: InningsState): string {
  const overs = formatOvers(innings.legalBalls, setup.rules.ballsPerOver, { alwaysShowBalls: true });
  return `${teamName(setup, innings.battingTeamId)} ${innings.runs} for ${innings.wickets}, ${overs} overs.`;
}

function overSentence(innings: InningsState, ball: BallRecord): string | null {
  if (!ball.endsOver) {
    return null;
  }
  const over = innings.overs.find((entry) => entry.overIndex === ball.overIndex);
  if (over === undefined) {
    return null;
  }
  return `End of over ${over.overIndex + 1}. ${over.runs} ${over.runs === 1 ? 'run' : 'runs'} from the over.`;
}

export function commitAnnouncement(previous: LiveMatch | null, next: LiveMatch | null): string | null {
  if (previous === null || next === null || previous.match.id !== next.match.id) {
    return null;
  }
  const since = previous.state.lastSeq;
  if (next.state.lastSeq <= since) {
    return null;
  }
  const found = locateBall(next.state, (ball) => ball.seq > since);
  if (found === null) {
    return null;
  }
  const { innings, ball } = found;
  const sentences = [`${ballDescription(next.setup, ball)}.`, scoreSentence(next.setup, innings), overSentence(innings, ball)];
  if (innings.status === 'in_progress' && innings.isFreeHitNext) {
    sentences.push('Next ball is a free hit.');
  }
  return sentences.filter((sentence): sentence is string => sentence !== null).join(' ');
}

export function lastActionText(live: LiveMatch | null): string | null {
  if (live === null) {
    return null;
  }
  const group = lastActionGroup(live.events);
  const first = group[0];
  if (first === undefined) {
    return null;
  }
  const delivery = group.find((event) => event.kind === 'delivery');
  if (delivery !== undefined) {
    const found = locateBall(live.state, (ball) => ball.seq === delivery.seq);
    if (found !== null) {
      return `${found.ball.label} · ${ballDescription(live.setup, found.ball)}`;
    }
  }
  return ACTION_TEXT[first.kind];
}

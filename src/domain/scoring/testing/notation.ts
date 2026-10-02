import type { DeliveryDismissalType, MatchState, PlayerId } from '../../types';
import {
  batterIn,
  bye,
  legBye,
  noBall,
  overthrowBoundary,
  scoreRuns,
  selectBowler,
  swapStrike,
  wicket,
  wide,
  type ScoringIntent,
} from '../commands';
import { currentInnings } from '../replay';
import { declare, endMatch, resumePlay, startInnings, startSuperOver, suspendPlay } from './intents';

export type IntentStep = ScoringIntent | ((state: MatchState) => ScoringIntent);
export type ScriptStep = IntentStep | string;

const ID = '[A-Za-z0-9_-]+';

const WICKET_TYPES: Readonly<Record<string, DeliveryDismissalType>> = {
  b: 'bowled',
  bowled: 'bowled',
  c: 'caught',
  caught: 'caught',
  lbw: 'lbw',
  st: 'stumped',
  stumped: 'stumped',
  hw: 'hit_wicket',
  htb: 'hit_ball_twice',
};

function digit(text: string | undefined): number {
  return text === undefined ? 0 : Number(text);
}

function parseRuns(token: string): ScoringIntent | null {
  if (token === '.') {
    return scoreRuns(0);
  }
  const plain = /^(\d)(r|s)?$/.exec(token);
  if (plain !== null) {
    const runs = Number(plain[1]);
    if (plain[2] === 'r') {
      return scoreRuns(runs, { allRun: true });
    }
    return plain[2] === 's' ? scoreRuns(runs, { shortRuns: 1 }) : scoreRuns(runs);
  }
  const overthrow = /^(\d)\+4$/.exec(token);
  return overthrow === null ? null : overthrowBoundary(Number(overthrow[1]));
}

function parseExtras(token: string): ScoringIntent | null {
  const wd = /^wd(\d)?(r|s)?$/.exec(token);
  if (wd !== null) {
    const runs = digit(wd[1]);
    if (runs === 4 && wd[2] === undefined) {
      return wide(0, { boundary: true });
    }
    return wd[2] === 's' ? wide(runs, { shortRuns: 1 }) : wide(runs);
  }
  const nb = /^nb(\d)?(lb|b)?(r)?$/.exec(token);
  if (nb !== null) {
    const runs = digit(nb[1]);
    const runsTo = nb[2] === 'b' ? 'bye' : nb[2] === 'lb' ? 'leg_bye' : 'bat';
    const boundary = nb[3] === undefined && (runs === 4 || (runs === 6 && runsTo === 'bat'));
    return boundary ? noBall({ runsTo, boundary: runs === 6 ? 6 : 4 }) : noBall({ runsTo, runsRun: runs });
  }
  const byes = /^(lb|b)(\d)(r|s)?$/.exec(token);
  if (byes !== null) {
    const make = byes[1] === 'b' ? bye : legBye;
    const runs = Number(byes[2]);
    if (runs === 4 && byes[3] === undefined) {
      return make(0, { boundary: true });
    }
    return byes[3] === 's' ? make(runs, { shortRuns: 1 }) : make(runs);
  }
  return null;
}

function parseWicket(token: string): IntentStep | null {
  const plain = new RegExp(`^W(?::([a-z]+))?(?::(${ID}))?(?:>(${ID}))?$`).exec(token);
  if (plain !== null) {
    const dismissal = WICKET_TYPES[plain[1] ?? 'b'];
    if (dismissal === undefined) {
      return null;
    }
    return wicket({
      dismissal,
      ...(plain[2] === undefined ? {} : { fielderIds: [plain[2]] }),
      ...(plain[3] === undefined ? {} : { nextBatterId: plain[3] }),
    });
  }
  const runOut = new RegExp(`^ro:([sn])([sn])(?::(\\d))?(?::(${ID}(?:/${ID})?))?(?:>(${ID}))?$`).exec(token);
  if (runOut === null) {
    return null;
  }
  const [, who, end, runs, fielders, next] = runOut;
  return (state: MatchState): ScoringIntent => {
    const innings = currentInnings(state);
    const playerOutId: PlayerId = (who === 's' ? innings?.strikerId : innings?.nonStrikerId) ?? '';
    return wicket({
      dismissal: 'run_out',
      playerOutId,
      dismissalEnd: end === 's' ? 'striker_end' : 'non_striker_end',
      runsRun: digit(runs),
      fielderIds: fielders === undefined ? [] : fielders.split('/'),
      ...(next === undefined ? {} : { nextBatterId: next }),
    });
  };
}

function parseControl(token: string): ScoringIntent | null {
  const bowler = new RegExp(`^@(${ID})(?::(injury|suspended))?$`).exec(token);
  if (bowler !== null) {
    return bowler[2] === undefined ? selectBowler(bowler[1]) : selectBowler(bowler[1], bowler[2] === 'injury' ? 'injury' : 'suspended');
  }
  const incoming = new RegExp(`^>(${ID})(?::([sn]))?$`).exec(token);
  if (incoming !== null) {
    return incoming[2] === undefined ? batterIn(incoming[1]) : batterIn(incoming[1], incoming[2] === 's' ? 'striker' : 'non_striker');
  }
  const start = new RegExp(`^start:(${ID}):(${ID}):(${ID})(?::(${ID}))?$`).exec(token);
  if (start !== null) {
    return startInnings(start[1], start[2], start[3], start[4]);
  }
  switch (token) {
    case 'sw':
      return swapStrike();
    case 'so':
      return startSuperOver();
    case 'end':
      return endMatch();
    case 'decl':
      return declare();
    case 'susp':
      return suspendPlay('rain');
    case 'resume':
      return resumePlay();
    default:
      return null;
  }
}

export function parseToken(token: string): IntentStep {
  const parsed = parseRuns(token) ?? parseExtras(token) ?? parseWicket(token) ?? parseControl(token);
  if (parsed === null) {
    throw new Error(`Unknown score notation "${token}"`);
  }
  return parsed;
}

export function parseNotation(text: string): readonly IntentStep[] {
  return text
    .split(/[\s|,]+/)
    .filter((token) => token.length > 0)
    .map(parseToken);
}

export function expandSteps(steps: readonly ScriptStep[]): readonly IntentStep[] {
  return steps.flatMap((step) => (typeof step === 'string' ? parseNotation(step) : [step]));
}

import type {
  BallCount,
  BallRecord,
  BallToken,
  BallTokenKind,
  BowlingCardRow,
  DismissalType,
  MatchPlayer,
  PlayerId,
  Runs,
} from '../types';

const UNDEFINED_VALUE = '–';

export function formatOvers(balls: BallCount, ballsPerOver: number, opts?: { readonly alwaysShowBalls?: boolean }): string {
  const safeBalls = Math.max(0, Math.floor(balls));
  const overs = Math.floor(safeBalls / ballsPerOver);
  const rest = safeBalls % ballsPerOver;
  if (rest === 0 && opts?.alwaysShowBalls !== true) {
    return `${overs}`;
  }
  return `${overs}.${rest}`;
}

export function formatScore(runs: Runs, wickets: number): string {
  return `${runs}/${wickets}`;
}

export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return UNDEFINED_VALUE;
  }
  const text = value.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}

export function formatNrr(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return UNDEFINED_VALUE;
  }
  const magnitude = Math.abs(value).toFixed(3);
  if (magnitude === '0.000') {
    return '0.000';
  }
  return `${value > 0 ? '+' : '-'}${magnitude}`;
}

export function formatBowlingFigures(row: Pick<BowlingCardRow, 'legalBalls' | 'maidens' | 'runsConceded' | 'wickets'>, ballsPerOver: number): string {
  return `${formatOvers(row.legalBalls, ballsPerOver)}-${row.maidens}-${row.runsConceded}-${row.wickets}`;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? `${value}`;
}

function counted(value: number, singular: string, plural: string): string {
  return `${numberWord(value)} ${value === 1 ? singular : plural}`;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

const DISMISSAL_WORDS: Readonly<Record<DismissalType, string>> = {
  bowled: 'bowled',
  caught: 'caught',
  lbw: 'leg before wicket',
  run_out: 'run out',
  stumped: 'stumped',
  hit_wicket: 'hit wicket',
  hit_ball_twice: 'hit the ball twice',
  obstructing_field: 'obstructing the field',
  handled_ball: 'handled the ball',
  timed_out: 'timed out',
  retired_out: 'retired out',
};

interface TokenParts {
  readonly text: string;
  readonly label: string;
  readonly kind: BallTokenKind;
}

function shortSuffix(shortRuns: number): { readonly text: string; readonly label: string } {
  if (shortRuns <= 0) {
    return { text: '', label: '' };
  }
  return { text: shortRuns === 1 ? 's' : `s${shortRuns}`, label: `, ${numberWord(shortRuns)} short` };
}

function wideParts(ball: Omit<BallRecord, 'token'>): TokenParts {
  const extra = ball.runsRun - ball.shortRuns + ball.boundary;
  const suffix = shortSuffix(ball.shortRuns);
  if (extra === 0 && ball.shortRuns === 0) {
    return { text: 'WD', label: 'Wide', kind: 'wide' };
  }
  return {
    text: `WD+${extra}${suffix.text}`,
    label: `Wide, plus ${counted(extra, 'run', 'runs')}${suffix.label}`,
    kind: 'wide',
  };
}

function noBallParts(ball: Omit<BallRecord, 'token'>): TokenParts {
  const extra = ball.runsRun - ball.shortRuns + ball.boundary;
  const suffix = shortSuffix(ball.shortRuns);
  if (extra === 0 && ball.shortRuns === 0) {
    return { text: 'NB', label: 'No ball', kind: 'no_ball' };
  }
  if (ball.runsTo === 'bye') {
    return { text: `NB+${extra}B${suffix.text}`, label: `No ball, plus ${counted(extra, 'bye', 'byes')}${suffix.label}`, kind: 'no_ball' };
  }
  if (ball.runsTo === 'leg_bye') {
    return {
      text: `NB+${extra}LB${suffix.text}`,
      label: `No ball, plus ${counted(extra, 'leg bye', 'leg byes')}${suffix.label}`,
      kind: 'no_ball',
    };
  }
  const shot = ball.isFour ? 'a four' : ball.isSix ? 'a six' : counted(extra, 'run', 'runs');
  return { text: `NB+${extra}${suffix.text}`, label: `No ball, plus ${shot}${suffix.label}`, kind: 'no_ball' };
}

function fairParts(ball: Omit<BallRecord, 'token'>, dotStyle: 'zero' | 'dot'): TokenParts {
  const runs = ball.runsRun - ball.shortRuns + ball.boundary;
  const suffix = shortSuffix(ball.shortRuns);
  if (ball.runsTo === 'bye') {
    return { text: `B${runs}${suffix.text}`, label: `${capitalize(counted(runs, 'bye', 'byes'))}${suffix.label}`, kind: 'bye' };
  }
  if (ball.runsTo === 'leg_bye') {
    return {
      text: `LB${runs}${suffix.text}`,
      label: `${capitalize(counted(runs, 'leg bye', 'leg byes'))}${suffix.label}`,
      kind: 'leg_bye',
    };
  }
  if (ball.isFour) {
    return { text: '4', label: 'Four', kind: 'four' };
  }
  if (ball.isSix) {
    return { text: '6', label: 'Six', kind: 'six' };
  }
  if (runs === 0 && ball.shortRuns === 0) {
    return { text: dotStyle === 'dot' ? '•' : '0', label: 'Dot ball', kind: 'dot' };
  }
  return { text: `${runs}${suffix.text}`, label: `${capitalize(counted(runs, 'run', 'runs'))}${suffix.label}`, kind: 'runs' };
}

export function ballToken(ball: Omit<BallRecord, 'token'>, opts?: { readonly dotStyle?: 'zero' | 'dot' }): BallToken {
  const parts =
    ball.call === 'wide' ? wideParts(ball) : ball.call === 'no_ball' ? noBallParts(ball) : fairParts(ball, opts?.dotStyle ?? 'zero');
  if (ball.wicket === null) {
    return { text: parts.text, kind: parts.kind, isLegal: ball.isLegal, isFreeHit: ball.isFreeHit, accessibilityLabel: parts.label };
  }
  const wicketWords = DISMISSAL_WORDS[ball.wicket.type];
  const scoredNothing = ball.runsRun === 0 && ball.boundary === 0;
  const runsPart = ball.call === 'fair' && scoredNothing ? '' : parts.text;
  if (runsPart === '') {
    return { text: 'W', kind: 'wicket', isLegal: ball.isLegal, isFreeHit: ball.isFreeHit, accessibilityLabel: `Wicket, ${wicketWords}` };
  }
  return {
    text: `${runsPart}+W`,
    kind: 'wicket',
    isLegal: ball.isLegal,
    isFreeHit: ball.isFreeHit,
    accessibilityLabel: `${parts.label}, wicket, ${wicketWords}`,
  };
}

type NamedPlayer = Pick<MatchPlayer, 'playerId' | 'name' | 'isSubstitute'>;

function fielderName(playerId: PlayerId, players: readonly NamedPlayer[]): string {
  const player = players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined) {
    return 'Unknown';
  }
  return player.isSubstitute ? `sub (${player.name})` : player.name;
}

function bowlerName(playerId: PlayerId | null, players: readonly NamedPlayer[]): string {
  if (playerId === null) {
    return 'Unknown';
  }
  return players.find((candidate) => candidate.playerId === playerId)?.name ?? 'Unknown';
}

export function dismissalText(
  d: { readonly type: DismissalType; readonly bowlerId: PlayerId | null; readonly fielderIds: readonly PlayerId[] },
  players: readonly Pick<MatchPlayer, 'playerId' | 'name' | 'isSubstitute'>[],
): string {
  const bowler = bowlerName(d.bowlerId, players);
  const first = d.fielderIds[0];
  switch (d.type) {
    case 'bowled':
      return `b ${bowler}`;
    case 'caught':
      if (first === undefined) {
        return `c ? b ${bowler}`;
      }
      if (first === d.bowlerId) {
        return `c & b ${bowler}`;
      }
      return `c ${fielderName(first, players)} b ${bowler}`;
    case 'lbw':
      return `lbw b ${bowler}`;
    case 'stumped':
      return `st ${first === undefined ? '?' : fielderName(first, players)} b ${bowler}`;
    case 'hit_wicket':
      return `hit wicket b ${bowler}`;
    case 'run_out':
      return d.fielderIds.length === 0 ? 'run out' : `run out (${d.fielderIds.map((id) => fielderName(id, players)).join('/')})`;
    case 'obstructing_field':
      return 'obstructing the field';
    case 'hit_ball_twice':
      return 'hit the ball twice';
    case 'handled_ball':
      return 'handled the ball';
    case 'timed_out':
      return 'timed out';
    case 'retired_out':
      return 'retired out';
    default: {
      const unreachable: never = d.type;
      return unreachable;
    }
  }
}

export function formatRequirement(runsRequired: Runs, ballsRemaining: BallCount): string {
  const runs = runsRequired === 1 ? '1 run' : `${runsRequired}`;
  const balls = ballsRemaining === 1 ? '1 ball' : `${ballsRemaining} balls`;
  return `Need ${runs} from ${balls}`;
}

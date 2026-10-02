import { BUILTIN_FORMAT_IDS, type BallToken, type BattingCardRow, type InningsState, type MatchSetup, type MatchState, type OverSummary, type PlayerId } from '@/domain/types';
import type { LiveMatch } from '@/services/contracts';
import { currentInnings } from '@/domain/scoring/replay';
import { formatBowlingFigures, formatOvers, formatRate, formatRequirement, formatScore } from '@/domain/scoring/format';
import { inningsTitle, regularNumberOf } from './labels';
import { playerName, teamName, teamShortName } from './names';

export type DotStyle = 'zero' | 'dot';

export interface ScoreHeaderVM {
  readonly started: boolean;
  readonly battingTeam: string;
  readonly inningsLabel: string;
  readonly score: string;
  readonly scoreLabel: string;
  readonly summaryLabel: string;
  readonly overs: string;
  readonly oversLabel: string;
  readonly oversOf: string | null;
  readonly crr: string;
  readonly target: string | null;
  readonly rrr: string | null;
  readonly requirement: string | null;
  readonly freeHit: boolean;
  readonly powerplay: string | null;
}

const NOT_STARTED: ScoreHeaderVM = {
  started: false,
  battingTeam: '',
  inningsLabel: 'Not started',
  score: '0/0',
  scoreLabel: 'Not started',
  summaryLabel: 'Not started',
  overs: '0.0',
  oversLabel: '0 overs',
  oversOf: null,
  crr: '–',
  target: null,
  rrr: null,
  requirement: null,
  freeHit: false,
  powerplay: null,
};

export function selectHeader(live: LiveMatch | null): ScoreHeaderVM {
  if (live === null) {
    return NOT_STARTED;
  }
  const { setup, state } = live;
  const innings = currentInnings(state);
  if (innings === null) {
    return NOT_STARTED;
  }
  const bpo = setup.rules.ballsPerOver;
  const inProgress = innings.status === 'in_progress';
  const chase = inProgress ? state.chase : null;
  const overs = formatOvers(innings.legalBalls, bpo, { alwaysShowBalls: true });
  const team = teamName(setup, innings.battingTeamId);
  const active = innings.powerplay.active;
  const limit = formatOvers(innings.limits.maxBalls, bpo);
  const crr = formatRate(state.currentRunRate ?? innings.runRate);
  const rrr = chase === null ? null : formatRate(chase.requiredRunRate);
  const requirement = chase === null ? null : formatRequirement(chase.runsRequired, chase.ballsRemaining);
  const freeHit = inProgress && innings.isFreeHitNext;
  return {
    started: true,
    battingTeam: team,
    inningsLabel: `${team} · ${inningsTitle(innings, regularNumberOf(state.innings, innings.index))}`,
    score: formatScore(innings.runs, innings.wickets),
    scoreLabel: `${team} ${innings.runs} for ${innings.wickets}`,
    summaryLabel: summaryOf({ team, runs: innings.runs, wickets: innings.wickets, overs, limit, revised: innings.limits.revised, crr, rrr, requirement, freeHit }),
    overs,
    oversLabel: `${overs} overs`,
    oversOf: `of ${limit}${innings.limits.revised ? ' (revised)' : ''}`,
    crr,
    target: chase === null ? null : `${chase.target}`,
    rrr,
    requirement,
    freeHit,
    powerplay: inProgress && active !== null ? `${active.name} · overs ${active.fromOver}–${active.toOver}` : null,
  };
}

interface SummaryParts {
  readonly team: string;
  readonly runs: number;
  readonly wickets: number;
  readonly overs: string;
  readonly limit: string;
  readonly revised: boolean;
  readonly crr: string;
  readonly rrr: string | null;
  readonly requirement: string | null;
  readonly freeHit: boolean;
}

function summaryOf(parts: SummaryParts): string {
  const sentences = [`${parts.team}, ${parts.runs} for ${parts.wickets}, ${parts.overs} overs of ${parts.limit}${parts.revised ? ', revised' : ''}.`];
  if (parts.requirement !== null) {
    sentences.push(`${parts.requirement}.`);
    if (parts.rrr !== null) {
      sentences.push(`Required run rate ${parts.rrr}.`);
    }
  } else {
    sentences.push(`Current run rate ${parts.crr}.`);
  }
  if (parts.freeHit) {
    sentences.push('Next ball is a free hit.');
  }
  return sentences.join(' ');
}

export interface BatterVM {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly figure: string;
  readonly balls: string;
  readonly detail: string | null;
  readonly isStriker: boolean;
  readonly accessibilityLabel: string;
}

function batterVM(row: BattingCardRow | undefined, playerId: PlayerId, setup: MatchSetup, isStriker: boolean): BatterVM {
  const name = row?.name ?? playerName(setup, playerId);
  const runs = row?.runs ?? 0;
  const balls = row?.balls ?? 0;
  const boundaries = row === undefined || (row.fours === 0 && row.sixes === 0) ? null : `4s ${row.fours} · 6s ${row.sixes}`;
  const detail = isStriker ? ['On strike', boundaries].filter((part): part is string => part !== null).join(' · ') : null;
  const ballsWord = balls === 1 ? 'ball' : 'balls';
  return {
    playerId,
    name,
    figure: `${runs}`,
    balls: `(${balls})`,
    detail,
    isStriker,
    accessibilityLabel: `${name}, ${isStriker ? 'on strike, ' : ''}${runs} off ${balls} ${ballsWord}`,
  };
}

export interface CreaseVM {
  readonly striker: BatterVM | null;
  readonly nonStriker: BatterVM | null;
  readonly canSwap: boolean;
}

export function selectCrease(live: LiveMatch | null): CreaseVM {
  const innings = live === null ? null : currentInnings(live.state);
  if (live === null || innings === null || innings.status !== 'in_progress') {
    return { striker: null, nonStriker: null, canSwap: false };
  }
  const find = (id: PlayerId | null) => (id === null ? undefined : innings.batting.find((row) => row.playerId === id));
  const striker = innings.strikerId === null ? null : batterVM(find(innings.strikerId), innings.strikerId, live.setup, true);
  const nonStriker = innings.nonStrikerId === null ? null : batterVM(find(innings.nonStrikerId), innings.nonStrikerId, live.setup, false);
  return { striker, nonStriker, canSwap: striker !== null && nonStriker !== null };
}

export interface BowlerVM {
  readonly name: string;
  readonly figures: string;
  readonly economy: string;
  readonly detail: string | null;
  readonly accessibilityLabel: string;
}

export function selectBowler(live: LiveMatch | null): BowlerVM | null {
  const innings = live === null ? null : currentInnings(live.state);
  if (live === null || innings === null || innings.status !== 'in_progress' || innings.bowlerId === null) {
    return null;
  }
  const bowlerId = innings.bowlerId;
  const row = innings.bowling.find((entry) => entry.playerId === bowlerId);
  const name = row?.name ?? playerName(live.setup, bowlerId);
  const figures = formatBowlingFigures(row ?? { legalBalls: 0, maidens: 0, runsConceded: 0, wickets: 0 }, live.setup.rules.ballsPerOver);
  const economy = formatRate(row?.economy ?? null);
  const dots = row?.dots ?? 0;
  return {
    name,
    figures,
    economy,
    detail: `${dots} ${dots === 1 ? 'dot ball' : 'dot balls'}`,
    accessibilityLabel: `Bowling: ${name}, ${figures}, economy ${economy}`,
  };
}

export interface ChipVM {
  readonly text: string;
  readonly kind: BallToken['kind'];
  readonly isFreeHit: boolean;
  readonly accessibilityLabel: string;
}

export function chipOf(token: BallToken, dotStyle: DotStyle): ChipVM {
  const text = token.kind === 'dot' && dotStyle === 'dot' ? '•' : token.text;
  return { text, kind: token.kind, isFreeHit: token.isFreeHit, accessibilityLabel: token.accessibilityLabel };
}

export interface OverStripVM {
  readonly balls: readonly ChipVM[];
  readonly remaining: number;
  readonly runs: string | null;
  readonly summary: string | null;
  readonly overKey: number;
}

function overSummaryLine(over: OverSummary, setup: MatchSetup): string {
  const bowlers = over.bowlerIds.map((id) => playerName(setup, id)).join(', ');
  return `Over ${over.overIndex + 1} · ${over.runs} ${over.runs === 1 ? 'run' : 'runs'}${bowlers ? ` · ${bowlers}` : ''}`;
}

export function selectOverStrip(live: LiveMatch | null, dotStyle: DotStyle): OverStripVM {
  const innings = live === null ? null : currentInnings(live.state);
  if (live === null || innings === null) {
    return { balls: [], remaining: 0, runs: null, summary: null, overKey: 0 };
  }
  const bpo = live.setup.rules.ballsPerOver;
  const over = innings.currentOver;
  if (over !== null) {
    return {
      balls: over.tokens.map((token) => chipOf(token, dotStyle)),
      remaining: Math.max(0, bpo - over.legalBalls),
      runs: `${over.runs}`,
      summary: null,
      overKey: over.overIndex,
    };
  }
  const last = innings.overs[innings.overs.length - 1];
  return {
    balls: [],
    remaining: innings.status === 'in_progress' ? bpo : 0,
    runs: null,
    summary: last === undefined ? null : overSummaryLine(last, live.setup),
    overKey: innings.overs.length,
  };
}

export interface MatchTitleVM {
  readonly title: string;
  readonly paused: boolean;
}

export function selectMatchTitle(live: LiveMatch | null): MatchTitleVM {
  if (live === null) {
    return { title: '', paused: false };
  }
  const [a, b] = live.setup.teams;
  return { title: `${a.shortName} v ${b.shortName} · ${formatLabel(live.match.formatId, live.setup.rules.oversPerInnings)}`, paused: live.state.lifecycle === 'paused' };
}

export function formatLabel(formatId: string, oversPerInnings: number): string {
  const builtin: readonly string[] = BUILTIN_FORMAT_IDS;
  return builtin.includes(formatId) ? formatId : `${oversPerInnings} ov`;
}

export interface LastBallVM {
  readonly seq: number;
  readonly kind: BallToken['kind'] | null;
  readonly six: boolean;
}

const NO_BALL: LastBallVM = { seq: 0, kind: null, six: false };

export function selectLastBall(live: LiveMatch | null): LastBallVM {
  const innings = live === null ? null : currentInnings(live.state);
  const last = innings?.balls[innings.balls.length - 1];
  if (last === undefined) {
    return NO_BALL;
  }
  return { seq: last.seq, kind: last.token.kind, six: last.isSix || last.boundary === 6 };
}

export type ControlMode = 'none' | 'pad' | 'pending' | 'repair' | 'complete';

export function controlModeOf(live: LiveMatch | null): ControlMode {
  if (live === null) {
    return 'none';
  }
  const state = live.state;
  if (state.needsRepair) {
    return 'repair';
  }
  if (state.pendingAction !== null) {
    return 'pending';
  }
  if (state.lifecycle === 'completed' || state.lifecycle === 'abandoned') {
    return 'complete';
  }
  return 'pad';
}

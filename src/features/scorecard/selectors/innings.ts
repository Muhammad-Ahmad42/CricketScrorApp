import type { BattingCardRow, BowlingCardRow, InningsState, MatchSetup, MatchState, OverSummary, Partnership } from '@/domain/types';
import { formatOvers, formatRate, formatScore } from '@/domain/scoring/format';
import { inningsTitle, regularNumberOf } from '@/features/scoring/selectors/labels';
import { firstName, ordinal, playerName, teamName, teamShortName } from '@/features/scoring/selectors/names';
import { chipOf, type ChipVM, type DotStyle } from '@/features/scoring/selectors/scoreboard';

export interface BattingRowVM {
  readonly key: string;
  readonly name: string;
  readonly dismissal: string;
  readonly runs: string;
  readonly balls: string;
  readonly fours: string;
  readonly sixes: string;
  readonly strikeRate: string;
  readonly isStriker: boolean;
  readonly accessibilityLabel: string;
}

export interface BowlingRowVM {
  readonly key: string;
  readonly name: string;
  readonly overs: string;
  readonly maidens: string;
  readonly runs: string;
  readonly wickets: string;
  readonly economy: string;
  readonly wides: string;
  readonly noBalls: string;
  readonly isCurrent: boolean;
  readonly accessibilityLabel: string;
}

export interface PartnershipVM {
  readonly key: string;
  readonly wicketLabel: string;
  readonly batters: string;
  readonly runs: number;
  readonly balls: number;
  readonly text: string;
  readonly accessibilityLabel: string;
}

export interface OverRowVM {
  readonly key: string;
  readonly overNumber: string;
  readonly chips: readonly ChipVM[];
  readonly runs: string;
  readonly scoreAtEnd: string;
  readonly bowlers: string;
  readonly accessibilityLabel: string;
}

export interface InningsCardVM {
  readonly index: number;
  readonly tabLabel: string;
  readonly title: string;
  readonly inProgress: boolean;
  readonly batting: readonly BattingRowVM[];
  readonly extrasLine: string;
  readonly extrasTotal: string;
  readonly totalLine: string;
  readonly total: string;
  readonly didNotBat: string | null;
  readonly absent: string | null;
  readonly fallOfWickets: string | null;
  readonly bowling: readonly BowlingRowVM[];
  readonly partnerships: readonly PartnershipVM[];
  readonly overs: readonly OverRowVM[];
}

function battingRow(row: BattingCardRow, innings: InningsState, live: boolean): BattingRowVM {
  const striker = live && row.playerId === innings.strikerId;
  const dismissal = row.dismissalText === '' ? (row.status === 'not_out' ? 'not out' : '') : row.dismissalText;
  const strikeRate = formatRate(row.strikeRate);
  return {
    key: row.playerId,
    name: row.name,
    dismissal: striker ? `${dismissal} · on strike` : dismissal,
    runs: `${row.runs}`,
    balls: `${row.balls}`,
    fours: `${row.fours}`,
    sixes: `${row.sixes}`,
    strikeRate,
    isStriker: striker,
    accessibilityLabel: `${row.name}${striker ? ', on strike' : ''}, ${dismissal}, ${row.runs} runs off ${row.balls} balls, ${row.fours} fours, ${row.sixes} sixes, strike rate ${strikeRate}`,
  };
}

function bowlingRow(row: BowlingCardRow, bpo: number, live: boolean): BowlingRowVM {
  const overs = formatOvers(row.legalBalls, bpo);
  const economy = formatRate(row.economy);
  return {
    key: row.playerId,
    name: row.name,
    overs,
    maidens: `${row.maidens}`,
    runs: `${row.runsConceded}`,
    wickets: `${row.wickets}`,
    economy,
    wides: `${row.wideDeliveries}`,
    noBalls: `${row.noBallDeliveries}`,
    isCurrent: live && row.isCurrent,
    accessibilityLabel: `${row.name}${live && row.isCurrent ? ', bowling now' : ''}, ${overs} overs, ${row.maidens} maidens, ${row.runsConceded} runs, ${row.wickets} wickets, economy ${economy}`,
  };
}

function partnershipVM(partnership: Partnership, setup: MatchSetup): PartnershipVM {
  const a = firstName(playerName(setup, partnership.batterAId));
  const b = partnership.batterBId === null ? null : firstName(playerName(setup, partnership.batterBId));
  const batters = b === null ? a : `${a} & ${b}`;
  const wicketLabel = `${ordinal(partnership.wicketNumber)} wkt`;
  const unbroken = partnership.endedBy === null ? '*' : '';
  return {
    key: `${partnership.index}`,
    wicketLabel,
    batters,
    runs: partnership.runs,
    balls: partnership.balls,
    text: `${partnership.runs}${unbroken} (${partnership.balls})`,
    accessibilityLabel: `${ordinal(partnership.wicketNumber)} wicket partnership, ${batters}, ${partnership.runs} runs off ${partnership.balls} balls${partnership.endedBy === null ? ', unbroken' : ''}`,
  };
}

function overRow(over: OverSummary, setup: MatchSetup, dotStyle: DotStyle): OverRowVM {
  const bowlers = over.bowlerIds.map((id) => playerName(setup, id)).join(', ');
  const scoreAtEnd = formatScore(over.scoreAtEnd.runs, over.scoreAtEnd.wickets);
  return {
    key: `${over.overIndex}`,
    overNumber: `${over.overIndex + 1}`,
    chips: over.tokens.map((token) => chipOf(token, dotStyle)),
    runs: `${over.runs}`,
    scoreAtEnd,
    bowlers,
    accessibilityLabel: `Over ${over.overIndex + 1}, ${bowlers}, ${over.runs} runs, ${scoreAtEnd} at the end${over.isComplete ? '' : ', in progress'}: ${over.tokens
      .map((token) => token.accessibilityLabel)
      .join(', ')}`,
  };
}

function extrasLine(innings: InningsState): string {
  const e = innings.extras;
  return `Extras (b ${e.byes}, lb ${e.legByes}, wd ${e.wides}, nb ${e.noBalls}, p ${e.penalty})`;
}

function totalLine(innings: InningsState, bpo: number): string {
  const overs = formatOvers(innings.legalBalls, bpo);
  const wickets = innings.completion?.reason === 'all_out' || innings.completion?.reason === 'batters_unavailable' ? 'all out' : `${innings.wickets} wkts`;
  return `Total · ${wickets} · ${overs} ov · RR ${formatRate(innings.runRate)}`;
}

function namesOf(rows: readonly BattingCardRow[]): string | null {
  return rows.length === 0 ? null : rows.map((row) => row.name).join(', ');
}

export function selectInningsCard(setup: MatchSetup, state: MatchState, innings: InningsState, dotStyle: DotStyle): InningsCardVM {
  const bpo = setup.rules.ballsPerOver;
  const live = innings.status === 'in_progress';
  const regular = regularNumberOf(state.innings, innings.index);
  const short = teamShortName(setup, innings.battingTeamId);
  const overs = formatOvers(innings.legalBalls, bpo);
  const batted = innings.batting
    .filter((row) => row.status !== 'yet_to_bat' && row.status !== 'absent')
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
  const yetToBat = innings.batting.filter((row) => row.status === 'yet_to_bat');
  const absent = innings.batting.filter((row) => row.status === 'absent');
  const fow = innings.fallOfWickets.map(
    (entry) => `${entry.wicketNumber}-${entry.teamRuns} (${firstName(playerName(setup, entry.playerOutId))}, ${entry.overLabel})`,
  );
  return {
    index: innings.index,
    tabLabel: innings.kind === 'super_over' ? `Super over ${innings.superOverRound ?? 1} · ${short}` : `${short} ${formatScore(innings.runs, innings.wickets)} (${overs})`,
    title: `${teamName(setup, innings.battingTeamId)} · ${inningsTitle(innings, regular)}`,
    inProgress: live,
    batting: batted.map((row) => battingRow(row, innings, live)),
    extrasLine: extrasLine(innings),
    extrasTotal: `${innings.extras.total}`,
    totalLine: totalLine(innings, bpo),
    total: formatScore(innings.runs, innings.wickets),
    didNotBat: namesOf(yetToBat),
    absent: absent.length === 0 ? null : absent.map((row) => `${row.name} (${row.dismissalText})`).join(', '),
    fallOfWickets: fow.length === 0 ? null : fow.join(' · '),
    bowling: [...innings.bowling].sort((a, b) => a.order - b.order).map((row) => bowlingRow(row, bpo, live)),
    partnerships: innings.partnerships.map((partnership) => partnershipVM(partnership, setup)),
    overs: [...innings.overs].reverse().map((over) => overRow(over, setup, dotStyle)),
  };
}

export function selectInningsCards(setup: MatchSetup, state: MatchState, dotStyle: DotStyle): readonly InningsCardVM[] {
  return state.innings.map((innings) => selectInningsCard(setup, state, innings, dotStyle));
}

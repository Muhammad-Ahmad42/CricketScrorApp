import { formatScore } from '@/domain/scoring/format';
import type { Fixture, FixtureSide, StageId, TeamId } from '@/domain/types';
import { joinList } from '@/features/shared';
import { formatDateTime } from './dates';
import { fixtureResultText, fixtureSummary } from './fixtures';
import type { SideVM, TournamentIndex } from './names';

export interface BracketSideVM {
  readonly text: string;
  readonly slotLabel: string | null;
  readonly score: string | null;
  readonly winner: boolean;
}

export interface BracketMatchVM {
  readonly key: string;
  readonly kind: 'match' | 'bye';
  readonly round: number;
  readonly position: number;
  readonly label: string;
  readonly when: string | null;
  readonly a: BracketSideVM;
  readonly b: BracketSideVM;
  readonly sidesText: string;
  readonly result: string | null;
  readonly winnerText: string | null;
  readonly fixtureId: string | null;
  readonly accessibilityLabel: string;
}

export interface BracketRoundVM {
  readonly round: number;
  readonly name: string;
  readonly matches: readonly BracketMatchVM[];
}

export interface BracketVM {
  readonly stageId: StageId;
  readonly stageName: string;
  readonly rounds: readonly BracketRoundVM[];
  readonly thirdPlace: BracketMatchVM | null;
  readonly champion: string | null;
  readonly byeNote: string | null;
}

const BYE_TEXT = 'Bye';

function scoreFor(index: TournamentIndex, fixture: Fixture, teamId: TeamId | null): string | null {
  const summary = fixtureSummary(index.snapshot, fixture);
  if (summary === null || teamId === null) {
    return null;
  }
  const innings = summary.innings.find((candidate) => candidate.battingTeamId === teamId);
  return innings ? formatScore(innings.runs, innings.wickets) : null;
}

function sideVM(index: TournamentIndex, fixture: Fixture, side: SideVM): BracketSideVM {
  const summary = fixtureSummary(index.snapshot, fixture);
  return {
    text: side.text,
    slotLabel: side.slotLabel,
    score: scoreFor(index, fixture, side.teamId),
    winner: summary !== null && side.teamId !== null && summary.winnerTeamId === side.teamId,
  };
}

function spokenSide(side: BracketSideVM): string {
  const label = side.slotLabel && side.slotLabel !== side.text ? `${side.slotLabel} ${side.text}` : side.text;
  return side.score ? `${label} ${side.score}` : label;
}

function matchVM(index: TournamentIndex, fixture: Fixture): BracketMatchVM {
  const sides = index.fixtureSides(fixture);
  const a = sideVM(index, fixture, sides.a);
  const b = sideVM(index, fixture, sides.b);
  const winner = a.winner ? a.text : b.winner ? b.text : null;
  const result = fixtureResultText(index, fixture);
  const label = index.fixtureLabel(fixture);
  const roundName = fixture.bracket?.roundName ?? label;
  const spoken = [`${roundName === label ? label : `${roundName}, ${label}`}: ${spokenSide(a)}, ${spokenSide(b)}`];
  if (winner) {
    spoken.push(`${winner} won`);
  }
  return {
    key: fixture.id,
    kind: 'match',
    round: fixture.bracket?.round ?? 1,
    position: fixture.bracket?.position ?? 0,
    label,
    when: formatDateTime(fixture.scheduledDate, fixture.scheduledTime),
    a,
    b,
    sidesText: `${a.text} v ${b.text}`,
    result,
    winnerText: winner,
    fixtureId: fixture.id,
    accessibilityLabel: `${spoken.join(', ')}.`,
  };
}

function byeVM(index: TournamentIndex, round: number, position: number, side: FixtureSide | null): BracketMatchVM {
  const shown = side ? index.side(side) : null;
  const text = shown?.text ?? 'To be decided';
  const entrant: BracketSideVM = { text, slotLabel: shown?.slotLabel ?? null, score: null, winner: false };
  const bye: BracketSideVM = { text: BYE_TEXT, slotLabel: null, score: null, winner: false };
  return {
    key: `bye-${round}-${position}`,
    kind: 'bye',
    round,
    position,
    label: BYE_TEXT,
    when: null,
    a: entrant,
    b: bye,
    sidesText: `${text} v ${BYE_TEXT}`,
    result: null,
    winnerText: null,
    fixtureId: null,
    accessibilityLabel: `${text} has a bye and goes straight through to the next round.`,
  };
}

function positionsPerRound(main: readonly Fixture[]): ReadonlyMap<number, number> {
  const observed = new Map<number, number>();
  for (const fixture of main) {
    if (fixture.bracket) {
      observed.set(fixture.bracket.round, Math.max(observed.get(fixture.bracket.round) ?? 0, fixture.bracket.position + 1));
    }
  }
  const rounds = [...observed.keys()].sort((a, b) => b - a);
  const result = new Map<number, number>();
  let below = 0;
  for (const round of rounds) {
    const count = Math.max(observed.get(round) ?? 0, below * 2);
    result.set(round, count);
    below = count;
  }
  return result;
}

export function bracketVM(index: TournamentIndex, stageId: StageId): BracketVM {
  const fixtures = index.snapshot.fixtures.filter((fixture) => fixture.stageId === stageId && fixture.bracket !== null);
  const main = fixtures.filter((fixture) => fixture.bracket?.kind === 'main');
  const counts = positionsPerRound(main);
  const roundNumbers = [...counts.keys()].sort((a, b) => a - b);
  const byes: string[] = [];
  const rounds: BracketRoundVM[] = roundNumbers.map((round) => {
    const inRound = main.filter((fixture) => fixture.bracket?.round === round);
    const matches: BracketMatchVM[] = [];
    for (let position = 0; position < (counts.get(round) ?? 0); position += 1) {
      const fixture = inRound.find((candidate) => candidate.bracket?.position === position);
      if (fixture) {
        matches.push(matchVM(index, fixture));
      } else if (round === roundNumbers[0]) {
        const parent = main.find((candidate) => candidate.bracket?.round === round + 1 && candidate.bracket.position === Math.floor(position / 2));
        const side = parent ? (position % 2 === 0 ? parent.sideA : parent.sideB) : null;
        const bye = byeVM(index, round, position, side);
        byes.push(bye.a.text);
        matches.push(bye);
      }
    }
    const roundName = inRound[0]?.bracket?.roundName ?? `Round ${round}`;
    return { round, name: roundName, matches };
  });
  const third = fixtures.find((fixture) => fixture.bracket?.kind === 'third_place');
  const stage = index.stage(stageId);
  const champion = index.evaluation?.champion ?? null;
  const decides = stage?.config.decidesChampion ?? false;
  const championText =
    champion && champion.teamIds.length > 0 && decides
      ? joinList(champion.teamIds.map((teamId) => index.teamName(teamId)))
      : decides
        ? 'To be decided'
        : null;
  return {
    stageId,
    stageName: index.stageName(stageId),
    rounds,
    thirdPlace: third ? matchVM(index, third) : null,
    champion: championText,
    byeNote: byes.length > 0 ? `Byes: ${joinList(byes)} go straight through to the next round.` : null,
  };
}

export function knockoutStages(index: TournamentIndex): readonly StageId[] {
  return index.stages
    .filter((stage) => index.snapshot.fixtures.some((fixture) => fixture.stageId === stage.id && fixture.bracket !== null) || stage.type === 'knockout')
    .map((stage) => stage.id);
}

import type { FixtureSide } from '../../types';

export interface CircleRound {
  readonly pairings: readonly (readonly [FixtureSide, FixtureSide])[];
  readonly bye: FixtureSide | null;
}

type CircleEntry = FixtureSide | null;

function orient(x: FixtureSide, y: FixtureSide, pairIndex: number, round: number): readonly [FixtureSide, FixtureSide] {
  if (pairIndex === 0) {
    return round % 2 === 0 ? [x, y] : [y, x];
  }
  return pairIndex % 2 === 1 ? [y, x] : [x, y];
}

function rotate(list: readonly CircleEntry[]): readonly CircleEntry[] {
  return [list[0], list[list.length - 1], ...list.slice(1, list.length - 1)];
}

export function circleRounds(entrants: readonly FixtureSide[]): readonly CircleRound[] {
  let list: readonly CircleEntry[] = entrants.length % 2 === 1 ? [null, ...entrants] : [...entrants];
  const size = list.length;
  const rounds: CircleRound[] = [];
  for (let round = 0; round < size - 1; round += 1) {
    const pairings: (readonly [FixtureSide, FixtureSide])[] = [];
    let bye: FixtureSide | null = null;
    for (let pairIndex = 0; pairIndex < size / 2; pairIndex += 1) {
      const x = list[pairIndex];
      const y = list[size - 1 - pairIndex];
      if (x === null) {
        bye = y;
      } else if (y === null) {
        bye = x;
      } else {
        pairings.push(orient(x, y, pairIndex, round));
      }
    }
    rounds.push({ pairings, bye });
    list = rotate(list);
  }
  return rounds;
}

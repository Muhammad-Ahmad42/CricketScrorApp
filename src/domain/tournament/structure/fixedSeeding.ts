import type { FixtureSide } from '../../types';
import type { SeededEntrant } from '../knockout';
import { bracketOrder, nextPowerOfTwo } from './bracketMath';

type PoolPlaced = SeededEntrant & { readonly poolIndex: number; readonly poolPosition: number };

function isPoolPlaced(entrant: SeededEntrant): entrant is PoolPlaced {
  return entrant.poolIndex !== null && entrant.poolPosition !== null;
}

function pairedPoolOrder(entrants: readonly SeededEntrant[]): readonly SeededEntrant[] | null {
  if (!entrants.every(isPoolPlaced)) {
    return null;
  }
  const placed = entrants.filter(isPoolPlaced);
  const byPool = new Map<number, PoolPlaced[]>();
  for (const entrant of placed) {
    byPool.set(entrant.poolIndex, [...(byPool.get(entrant.poolIndex) ?? []), entrant]);
  }
  const poolIndexes = [...byPool.keys()].sort((a, b) => a - b);
  const poolCount = poolIndexes.length;
  const size = placed.length;
  if (poolCount < 2 || poolCount % 2 !== 0 || nextPowerOfTwo(size) !== size || poolIndexes.some((pool) => byPool.get(pool)?.length !== 2)) {
    return null;
  }
  const ranked = (pool: number): readonly PoolPlaced[] => [...(byPool.get(pool) ?? [])].sort((a, b) => a.poolPosition - b.poolPosition);
  const couples = Array.from({ length: poolCount / 2 }, (_, index) => [ranked(poolIndexes[2 * index]), ranked(poolIndexes[2 * index + 1])]);
  const desired: (readonly [SeededEntrant, SeededEntrant])[] = [
    ...couples.map(([x, y]): readonly [SeededEntrant, SeededEntrant] => [x[0], y[1]]),
    ...couples.map(([x, y]): readonly [SeededEntrant, SeededEntrant] => [y[0], x[1]]),
  ];
  const order = bracketOrder(size);
  const seeds: SeededEntrant[] = new Array<SeededEntrant>(size);
  desired.forEach(([u, v], position) => {
    seeds[order[2 * position] - 1] = u;
    seeds[order[2 * position + 1] - 1] = v;
  });
  return seeds;
}

function positionOrder(entrants: readonly SeededEntrant[]): readonly SeededEntrant[] {
  const placed = entrants
    .filter(isPoolPlaced)
    .map((entrant, index) => ({ entrant, index }))
    .sort((a, b) => a.entrant.poolPosition - b.entrant.poolPosition || a.entrant.poolIndex - b.entrant.poolIndex || a.index - b.index)
    .map((entry) => entry.entrant);
  return [...placed, ...entrants.filter((entrant) => !isPoolPlaced(entrant))];
}

function samePool(a: SeededEntrant, b: SeededEntrant): boolean {
  return a.poolIndex !== null && a.poolIndex === b.poolIndex;
}

function repairSamePoolPairs(seeds: readonly SeededEntrant[]): readonly SeededEntrant[] {
  const result = [...seeds];
  const order = bracketOrder(nextPowerOfTwo(result.length));
  const pairs: (readonly [number, number])[] = [];
  for (let position = 0; position < order.length / 2; position += 1) {
    const high = order[2 * position] - 1;
    const low = order[2 * position + 1] - 1;
    if (low < result.length) {
      pairs.push([high, low]);
    }
  }
  pairs.forEach(([high, low], index) => {
    if (!samePool(result[high], result[low])) {
      return;
    }
    for (let step = 1; step < pairs.length; step += 1) {
      const [otherHigh, otherLow] = pairs[(index + step) % pairs.length];
      if (!samePool(result[high], result[otherLow]) && !samePool(result[otherHigh], result[low])) {
        const held = result[low];
        result[low] = result[otherLow];
        result[otherLow] = held;
        return;
      }
    }
  });
  return result;
}

export function fixedSeedOrder(entrants: readonly SeededEntrant[]): readonly FixtureSide[] {
  const paired = pairedPoolOrder(entrants);
  const ordered = paired ?? repairSamePoolPairs(positionOrder(entrants));
  return ordered.map((entrant) => entrant.side);
}

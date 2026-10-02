export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(size, 2);
}

export function bracketSeedOrder(size: number): readonly number[] {
  let order: number[] = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

export function byeSeedAt(entrants: number, position: number): number | null {
  const size = nextPowerOfTwo(entrants);
  const order = bracketSeedOrder(size);
  const first = order[position * 2];
  const second = order[position * 2 + 1];
  if (first === undefined || second === undefined) return null;
  const firstReal = first <= entrants;
  const secondReal = second <= entrants;
  if (firstReal === secondReal) return null;
  return firstReal ? first : second;
}

export function bracketGeometry(entrants: number, rounds: number | null): { readonly lastRound: number; readonly positions: number } {
  const size = nextPowerOfTwo(entrants);
  const totalRounds = Math.round(Math.log2(size));
  const played = rounds === null ? totalRounds : Math.max(1, Math.min(rounds, totalRounds));
  return { lastRound: played, positions: size / 2 ** played };
}

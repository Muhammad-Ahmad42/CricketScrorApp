export function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && nextPowerOfTwo(value) === value;
}

export function bracketOrder(size: number): readonly number[] {
  let order: readonly number[] = [1];
  while (order.length < size) {
    const doubled = order.length * 2;
    order = order.flatMap((seed) => [seed, doubled + 1 - seed]);
  }
  return order;
}

import type { FixtureSide } from '../../types';

export function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

export function sameSide(a: FixtureSide, b: FixtureSide): boolean {
  return sideKey(a) === sideKey(b);
}

export function pairKey(a: FixtureSide, b: FixtureSide): string {
  const ka = sideKey(a);
  const kb = sideKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function sideSet(sides: readonly FixtureSide[]): ReadonlySet<string> {
  return new Set(sides.map(sideKey));
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

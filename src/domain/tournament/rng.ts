import type { Seed } from '../types';

export type Rng = () => number;

const UINT32_RANGE = 4294967296;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

export function mulberry32(seed: Seed): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function wrapUint32(value: number): Seed {
  return ((value % UINT32_RANGE) + UINT32_RANGE) % UINT32_RANGE;
}

function digitsModUint32(digits: string): Seed {
  let result = 0;
  for (const digit of digits) {
    result = (result * 10 + Number(digit)) % UINT32_RANGE;
  }
  return result;
}

function fnv1a(text: string): Seed {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function normalizeSeed(input: number | string): Seed {
  if (typeof input === 'number') {
    return Number.isInteger(input) ? wrapUint32(input) : fnv1a(String(input).trim());
  }
  const trimmed = input.trim();
  const match = /^(-?)(\d+)$/.exec(trimmed);
  if (!match) {
    return fnv1a(trimmed);
  }
  const magnitude = digitsModUint32(match[2]);
  return match[1] === '-' ? wrapUint32(-magnitude) : magnitude;
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`randomInt needs a positive integer bound, got ${maxExclusive}.`);
  }
  return Math.floor(rng() * maxExclusive);
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    const held = result[i];
    result[i] = result[j];
    result[j] = held;
  }
  return result;
}

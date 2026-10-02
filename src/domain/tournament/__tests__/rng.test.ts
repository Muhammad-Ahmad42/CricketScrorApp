/** @jest-environment node */
import { mulberry32, normalizeSeed, randomInt, shuffle } from '@/domain/tournament/rng';
import { deepFreeze } from './structure/support';

function firstValues(seed: number, count: number): readonly number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => rng());
}

describe('mulberry32', () => {
  it('U-RNG-01 golden sequence for seed 847291', () => {
    const [a, b, c] = firstValues(847291, 3);
    expect(a).toBeCloseTo(0.4183025225, 10);
    expect(b).toBeCloseTo(0.6612153111, 10);
    expect(c).toBeCloseTo(0.4243005631, 10);
  });

  it('U-RNG-02 golden sequence for seed 1', () => {
    const [a, b, c] = firstValues(1, 3);
    expect(a).toBeCloseTo(0.6270739406, 10);
    expect(b).toBeCloseTo(0.0027357212, 10);
    expect(c).toBeCloseTo(0.52744704, 10);
  });

  it('produces the same sequence for the same seed and a different one for another seed', () => {
    expect(firstValues(42, 20)).toEqual(firstValues(42, 20));
    expect(firstValues(42, 20)).not.toEqual(firstValues(43, 20));
  });

  it('stays in [0, 1) over many draws', () => {
    const rng = mulberry32(2026);
    const values = Array.from({ length: 10000 }, () => rng());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('treats seeds as uint32 so 2^32 + 1 equals 1', () => {
    expect(firstValues(4294967297, 5)).toEqual(firstValues(1, 5));
  });
});

describe('normalizeSeed', () => {
  it.each<[number | string, number]>([
    ['847291', 847291],
    [847291, 847291],
    [4294967297, 1],
    ['4294967297', 1],
    [' 847291 ', 847291],
    [-1, 4294967295],
    ['-1', 4294967295],
    [0, 0],
    ['abc', 440920331],
    ['Summer Cup 2026', 3343153722],
    ['Spring Cup 2026', 520673282],
    ['  Spring Cup 2026  ', 520673282],
  ])('U-RNG-03 normalizeSeed(%p) = %p', (input, expected) => {
    expect(normalizeSeed(input)).toBe(expected);
  });

  it('hashes text seeds reproducibly into the uint32 range', () => {
    const seed = normalizeSeed('Spring Cup');
    expect(seed).toBe(normalizeSeed('Spring Cup'));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(4294967296);
  });

  it('hashes non-integer numbers instead of truncating them', () => {
    expect(normalizeSeed(1.5)).toBe(normalizeSeed('1.5'));
  });
});

describe('shuffle', () => {
  const items = deepFreeze(Array.from({ length: 20 }, (_, index) => `T${index + 1}`));

  it('U-RNG-04 returns a new permutation and leaves the input untouched', () => {
    const before = [...items];
    const result = shuffle(items, mulberry32(847291));
    expect(result).not.toBe(items);
    expect([...result].sort()).toEqual([...items].sort());
    expect(items).toEqual(before);
    expect(result).not.toEqual(before);
  });

  it('U-RNG-04 is reproducible for the same seed', () => {
    expect(shuffle(items, mulberry32(7))).toEqual(shuffle(items, mulberry32(7)));
    expect(shuffle(items, mulberry32(7))).not.toEqual(shuffle(items, mulberry32(8)));
  });

  it('handles empty and single-item lists', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['only'], mulberry32(1))).toEqual(['only']);
  });
});

describe('randomInt', () => {
  it('U-RNG-05 returns integers in [0, max) and hits every value', () => {
    const rng = mulberry32(99);
    const values = Array.from({ length: 10000 }, () => randomInt(rng, 10));
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < 10)).toBe(true);
    expect(new Set(values).size).toBe(10);
  });

  it('refuses a non-positive bound', () => {
    expect(() => randomInt(mulberry32(1), 0)).toThrow();
    expect(() => randomInt(mulberry32(1), 2.5)).toThrow();
  });
});

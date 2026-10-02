import { randomUUID } from 'expo-crypto';
import type { IdGenerator, IsoDateTime, Seed } from '@/domain/types';

export const newId: IdGenerator = () => randomUUID();

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export function freshSeed(): Seed {
  return 100000 + Math.floor(Math.random() * 900000);
}

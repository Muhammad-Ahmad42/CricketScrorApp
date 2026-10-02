import { CryptoDigestAlgorithm, digestStringAsync, getRandomValues, randomUUID } from 'expo-crypto';
import type { Seed } from '@/domain/types';
import type { Clock } from '../contracts';

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export function newUuid(): string {
  return randomUUID();
}

export function newSeed(): Seed {
  return getRandomValues(new Uint32Array(1))[0];
}

export function sha256(text: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text).then((digest) => digest.toLowerCase());
}

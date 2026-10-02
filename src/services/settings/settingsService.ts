import type { AppSettings } from '@/domain/types';
import type { Repositories } from '@/db';
import type { SettingsService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { deepEqual } from '../core/values';
import { mergeSettings } from './defaults';

const SETTING_KEYS: readonly (keyof AppSettings)[] = [
  'theme',
  'hapticsEnabled',
  'soundEnabled',
  'reducedMotion',
  'reduceTransparency',
  'defaultFormatId',
  'scoring',
];

function validate(settings: AppSettings): void {
  if (!['light', 'dark', 'system'].includes(settings.theme)) {
    throw failure('VALIDATION', 'Choose Light, Dark or System for the theme.');
  }
  if (!['system', 'on', 'off'].includes(settings.reducedMotion)) {
    throw failure('VALIDATION', 'Choose System, On or Off for reduced motion.');
  }
  if (typeof settings.hapticsEnabled !== 'boolean' || typeof settings.soundEnabled !== 'boolean') {
    throw failure('VALIDATION', 'Vibration and sound can only be switched on or off.');
  }
  if (settings.reduceTransparency !== undefined && typeof settings.reduceTransparency !== 'boolean') {
    throw failure('VALIDATION', 'Reduce transparency can only be switched on or off.');
  }
  if (settings.defaultFormatId.trim().length === 0) {
    throw failure('VALIDATION', 'Choose a default match format.');
  }
  if (!['zero', 'dot'].includes(settings.scoring.dotStyle)) {
    throw failure('VALIDATION', 'Choose how dot balls are shown.');
  }
  if (settings.scoring.padHand !== undefined && !['right', 'left'].includes(settings.scoring.padHand)) {
    throw failure('VALIDATION', 'Choose the side for the scoring pad.');
  }
}

async function persist<K extends keyof AppSettings>(repos: Repositories, key: K, settings: AppSettings, at: string): Promise<void> {
  await repos.settings.set(key, settings[key], at);
}

export function createSettingsService(ctx: ServiceContext): SettingsService {
  return {
    load() {
      return attempt(MESSAGES.settings, () => inTransaction(ctx, async (repos) => mergeSettings(await repos.settings.getAll())));
    },

    update(patch) {
      return attempt(MESSAGES.settings, () =>
        inTransaction(ctx, async (repos) => {
          const current = mergeSettings(await repos.settings.getAll());
          const next: AppSettings = {
            ...current,
            ...patch,
            scoring: patch.scoring === undefined ? current.scoring : { ...current.scoring, ...patch.scoring },
          };
          validate(next);
          const at = ctx.clock.now();
          for (const key of SETTING_KEYS) {
            if (key in patch && !deepEqual(current[key], next[key])) {
              await persist(repos, key, next, at);
            }
          }
          return next;
        }),
      );
    },
  };
}

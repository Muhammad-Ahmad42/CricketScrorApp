import type { FeedbackCue } from './cues';

export type ImpactStrength = 'light' | 'medium' | 'heavy';
export type NotificationKind = 'success' | 'error';
export type SoundName = 'run' | 'boundary' | 'wicket' | 'result';

export type HapticStep =
  | { readonly kind: 'impact'; readonly strength: ImpactStrength; readonly delayMs: number }
  | { readonly kind: 'notification'; readonly type: NotificationKind; readonly delayMs: number }
  | { readonly kind: 'selection'; readonly delayMs: number };

export interface HapticsDriver {
  impact(strength: ImpactStrength): Promise<void>;
  notification(type: NotificationKind): Promise<void>;
  selection(): Promise<void>;
}

export interface SoundDriver {
  play(sound: SoundName): void;
}

export interface FeedbackPreferences {
  readonly hapticsEnabled: boolean;
  readonly soundEnabled: boolean;
}

export interface ScoringFeedback {
  cue(cue: FeedbackCue): void;
}

export const SILENT_FEEDBACK: ScoringFeedback = { cue: () => undefined };

export function hapticSteps(cue: FeedbackCue): readonly HapticStep[] {
  switch (cue) {
    case 'run':
    case 'tab':
      return [{ kind: 'impact', strength: 'light', delayMs: 0 }];
    case 'four':
      return [{ kind: 'impact', strength: 'medium', delayMs: 0 }];
    case 'six':
      return [
        { kind: 'impact', strength: 'medium', delayMs: 0 },
        { kind: 'impact', strength: 'light', delayMs: 80 },
      ];
    case 'wicket':
      return [{ kind: 'impact', strength: 'heavy', delayMs: 0 }];
    case 'over_end':
    case 'undo':
      return [{ kind: 'selection', delayMs: 0 }];
    case 'result':
    case 'confirm':
      return [{ kind: 'notification', type: 'success', delayMs: 0 }];
    case 'error':
      return [{ kind: 'notification', type: 'error', delayMs: 0 }];
    default: {
      const unreachable: never = cue;
      return unreachable;
    }
  }
}

export function soundFor(cue: FeedbackCue): SoundName | null {
  switch (cue) {
    case 'run':
      return 'run';
    case 'four':
    case 'six':
      return 'boundary';
    case 'wicket':
      return 'wicket';
    case 'result':
      return 'result';
    case 'over_end':
    case 'undo':
    case 'error':
    case 'confirm':
    case 'tab':
      return null;
    default: {
      const unreachable: never = cue;
      return unreachable;
    }
  }
}

export interface FeedbackOptions {
  readonly haptics: HapticsDriver | null;
  readonly sound: SoundDriver | null;
  readonly preferences: () => FeedbackPreferences;
  readonly schedule?: (task: () => void, delayMs: number) => void;
}

function runStep(driver: HapticsDriver, step: HapticStep): Promise<void> {
  switch (step.kind) {
    case 'impact':
      return driver.impact(step.strength);
    case 'notification':
      return driver.notification(step.type);
    case 'selection':
      return driver.selection();
    default: {
      const unreachable: never = step;
      return unreachable;
    }
  }
}

export function createScoringFeedback(options: FeedbackOptions): ScoringFeedback {
  const schedule = options.schedule ?? ((task: () => void, delayMs: number) => setTimeout(task, delayMs));
  return {
    cue(cue) {
      const preferences = options.preferences();
      const haptics = options.haptics;
      if (preferences.hapticsEnabled && haptics !== null) {
        for (const step of hapticSteps(cue)) {
          const fire = () => {
            runStep(haptics, step).catch(() => undefined);
          };
          if (step.delayMs === 0) {
            fire();
          } else {
            schedule(fire, step.delayMs);
          }
        }
      }
      const sound = soundFor(cue);
      if (preferences.soundEnabled && options.sound !== null && sound !== null) {
        try {
          options.sound.play(sound);
        } catch {
          return;
        }
      }
    },
  };
}

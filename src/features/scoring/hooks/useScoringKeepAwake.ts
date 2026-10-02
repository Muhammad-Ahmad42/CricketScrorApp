import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export const SCORING_KEEP_AWAKE_TAG = 'scorebook-live-scoring';

export function useScoringKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    activateKeepAwakeAsync(SCORING_KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(SCORING_KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [enabled]);
}

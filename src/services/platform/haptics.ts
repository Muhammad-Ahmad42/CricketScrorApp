import { ImpactFeedbackStyle, impactAsync, notificationAsync, NotificationFeedbackType, selectionAsync } from 'expo-haptics';
import type { HapticsDriver, ImpactStrength, NotificationKind } from '../feedback/feedback';

const IMPACT: { readonly [K in ImpactStrength]: ImpactFeedbackStyle } = {
  light: ImpactFeedbackStyle.Light,
  medium: ImpactFeedbackStyle.Medium,
  heavy: ImpactFeedbackStyle.Heavy,
};

const NOTIFICATION: { readonly [K in NotificationKind]: NotificationFeedbackType } = {
  success: NotificationFeedbackType.Success,
  error: NotificationFeedbackType.Error,
};

export function createExpoHapticsDriver(): HapticsDriver {
  return {
    impact: (strength) => impactAsync(IMPACT[strength]),
    notification: (type) => notificationAsync(NOTIFICATION[type]),
    selection: () => selectionAsync(),
  };
}

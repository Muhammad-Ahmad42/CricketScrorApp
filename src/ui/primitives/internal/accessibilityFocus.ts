import { AccessibilityInfo, type HostInstance } from 'react-native';

export function moveAccessibilityFocus(target: HostInstance): void {
  AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
}

import { useState } from 'react';
import type { Insets, ViewStyle } from 'react-native';
import type { Theme } from '../../theme';

export const MIN_TOUCH = 44;

export function hitSlopFor(visibleHeight: number, visibleWidth: number = MIN_TOUCH): Insets | undefined {
  const vertical = Math.max(0, Math.ceil((MIN_TOUCH - visibleHeight) / 2));
  const horizontal = Math.max(0, Math.ceil((MIN_TOUCH - visibleWidth) / 2));
  if (vertical === 0 && horizontal === 0) {
    return undefined;
  }
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

export interface FocusRing {
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

export function useFocusRing(): FocusRing {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

export type FocusRingPlacement = 'outside' | 'inside';

export function focusRingStyle(theme: Theme, focused: boolean, placement: FocusRingPlacement = 'outside'): ViewStyle | null {
  if (!focused) {
    return null;
  }
  return {
    outlineColor: theme.color.focusRing,
    outlineWidth: theme.borderWidth.focus,
    outlineOffset: placement === 'inside' ? -theme.borderWidth.focus : 2,
    outlineStyle: 'solid',
  };
}

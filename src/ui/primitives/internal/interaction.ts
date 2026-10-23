import { useEffect, useState } from 'react';
import { Platform, type Insets, type ViewStyle } from 'react-native';
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

export type InputModality = 'keyboard' | 'pointer';

interface ModalityTarget {
  readonly addEventListener: (type: string, listener: (event: { readonly key?: string; readonly metaKey?: boolean; readonly ctrlKey?: boolean; readonly altKey?: boolean }) => void, capture?: boolean) => void;
}

let modality: InputModality = 'keyboard';
let tracking = false;
let focusesSinceTouch = 0;
const pointerListeners = new Set<() => void>();

export const KEYBOARD_FOCUS_RUN = 2;

const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home', 'End', 'PageUp', 'PageDown', 'Escape']);

export function noteKeyboard(): void {
  modality = 'keyboard';
}

export function notePointer(): void {
  modality = 'pointer';
  focusesSinceTouch = 0;
  for (const listener of [...pointerListeners]) {
    listener();
  }
}

export function noteNativeFocus(os: string = Platform.OS): void {
  if (os === 'web' || modality === 'keyboard') {
    return;
  }
  focusesSinceTouch += 1;
  if (focusesSinceTouch >= KEYBOARD_FOCUS_RUN) {
    noteKeyboard();
  }
}

export function noteTouchStart(): boolean {
  if (modality !== 'pointer') {
    notePointer();
  } else {
    focusesSinceTouch = 0;
  }
  return false;
}

export function inputModality(): InputModality {
  return modality;
}

export function trackInputModality(target: ModalityTarget | undefined): boolean {
  if (tracking || target === undefined) {
    return tracking;
  }
  tracking = true;
  target.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === undefined || NAVIGATION_KEYS.has(event.key)) {
        noteKeyboard();
      }
    },
    true,
  );
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    target.addEventListener(type, notePointer, true);
  }
  return true;
}

function webDocument(): ModalityTarget | undefined {
  const doc = (globalThis as { readonly document?: ModalityTarget }).document;
  return doc !== undefined && typeof doc.addEventListener === 'function' ? doc : undefined;
}

export function focusIsVisible(): boolean {
  return modality === 'keyboard';
}

export interface FocusRing {
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

export function useFocusRing(): FocusRing {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      trackInputModality(webDocument());
    }
    const hide = () => setFocused(false);
    pointerListeners.add(hide);
    return () => {
      pointerListeners.delete(hide);
    };
  }, []);
  return {
    focused,
    onFocus: () => {
      noteNativeFocus();
      setFocused(focusIsVisible());
    },
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

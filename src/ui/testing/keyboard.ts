import { DeviceEventEmitter, Dimensions, Platform, ScrollView, TextInput, View, type ScaledSize } from 'react-native';
import { act } from '@testing-library/react-native';
import { keyboardEventNames } from '../layout/keyboard';
import { TEST_METRICS } from './render';

export interface SimulatedKeyboard {
  readonly height: number;
  readonly screenY: number;
}

export function keyboardFrame(height: number, windowHeight: number = Dimensions.get('window').height): SimulatedKeyboard {
  return { height, screenY: windowHeight - height };
}

export function reportedKeyboardHeight(height: number, os: string, bottomInset: number = TEST_METRICS.insets.bottom): number {
  return os === 'android' ? Math.max(0, height - bottomInset) : height;
}

function emitAll(names: readonly string[], payload: unknown): void {
  for (const name of names) {
    DeviceEventEmitter.emit(name, payload);
  }
}

export async function showKeyboard(height: number, os: string = Platform.OS): Promise<SimulatedKeyboard> {
  const frame = keyboardFrame(height);
  await act(async () => {
    emitAll(keyboardEventNames(os).show, {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { height: reportedKeyboardHeight(frame.height, os), screenY: frame.screenY, screenX: 0, width: Dimensions.get('window').width },
    });
  });
  return frame;
}

export async function hideKeyboard(os: string = Platform.OS): Promise<void> {
  const window = Dimensions.get('window');
  await act(async () => {
    emitAll(keyboardEventNames(os).hide, {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { height: 0, screenY: window.height, screenX: 0, width: window.width },
    });
  });
}

export async function withPlatform<T>(os: 'ios' | 'android' | 'web', run: () => Promise<T>): Promise<T> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
}

export async function withWindow<T>(size: Partial<ScaledSize>, run: () => Promise<T>): Promise<T> {
  const original = Dimensions.get('window');
  const next = { ...original, ...size };
  await act(async () => {
    Dimensions.set({ window: next, screen: next });
  });
  try {
    return await run();
  } finally {
    await act(async () => {
      Dimensions.set({ window: original, screen: original });
    });
  }
}

type Measure = (callback: (x: number, y: number, width: number, height: number) => void) => void;

export function measureFieldsAt(y: number, height: number, width = 358) {
  const measure = jest.spyOn(View.prototype as unknown as { measureInWindow: Measure }, 'measureInWindow');
  measure.mockReset();
  measure.mockImplementation((callback) => {
    callback(0, y, width, height);
  });
  return measure;
}

export function scrollToSpy() {
  const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (options: unknown) => void }, 'scrollTo');
  scrollTo.mockClear();
  return scrollTo;
}

export function focusSpy() {
  const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus');
  focus.mockClear();
  return focus;
}

export function focusedTestIDs(focus: { readonly mock: { readonly contexts: readonly unknown[] } }): (string | undefined)[] {
  return focus.mock.contexts.map((context) => (context as { readonly props?: { readonly testID?: string } }).props?.testID);
}

export async function resetKeyboard(): Promise<void> {
  await hideKeyboard('android');
  await hideKeyboard('ios');
  (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow.mockReset();
}

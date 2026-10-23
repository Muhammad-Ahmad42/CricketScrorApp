import '../../testing';
import { useState } from 'react';
import { DeviceEventEmitter, Dimensions, Keyboard, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { focusSpy, focusedTestIDs, hideKeyboard, measureFieldsAt, renderWithTheme, resetKeyboard, scrollToSpy, showKeyboard, withPlatform, withWindow } from '../../testing';
import { AUTOFOCUS_RETRIES, AUTOFOCUS_RETRY_MS, Dialog, KEYBOARD_HOLD_MS, Sheet, TextField, nextChainKey, sheetMaxHeight, showKeyboardFor, useFormChain } from '../../primitives';
import { motionDuration } from '../../theme/tokens';
import {
  KEYBOARD_REVEAL_MARGIN,
  KeyboardGroup,
  Screen,
  SCREEN_END_SPACE,
  keyboardEventNames,
  keyboardInsetsMode,
  keyboardOverlap,
  revealFrame,
  revealScrollOffset,
  screenChrome,
  useKeyboardOverlap,
} from '..';

const WINDOW = { width: 390, height: 844, fontScale: 1, scale: 3 };
const KEYBOARD = 336;
const FOOTER = 100;

const measureAt = measureFieldsAt;
const scrollSpy = scrollToSpy;

function contentPadding(testID: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(`${testID}-scroll`).props.contentContainerStyle) as { paddingBottom?: number };
  return Number(style.paddingBottom ?? 0);
}

function FormScreen() {
  const [name, setName] = useState('');
  return (
    <Screen testID="form" footer={<RNText>Save</RNText>}>
      <View style={{ height: 600 }} />
      <TextField label="Team name" value={name} onChangeText={setName} testID="form-name" />
    </Screen>
  );
}

async function layoutFooter(height: number) {
  await act(async () => {
    screen.getByTestId('form-footer').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
}

afterEach(async () => {
  await resetKeyboard();
  jest.restoreAllMocks();
});

describe('keyboard metrics', () => {
  it('listens to will-events on iOS, did-events on Android and nothing on web', () => {
    expect(keyboardEventNames('ios')).toEqual({ show: ['keyboardWillShow', 'keyboardWillChangeFrame'], hide: ['keyboardWillHide'] });
    expect(keyboardEventNames('android')).toEqual({ show: ['keyboardDidShow'], hide: ['keyboardDidHide'] });
    expect(keyboardEventNames('web')).toEqual({ show: [], hide: [] });
    expect(keyboardInsetsMode('ios')).toBe('auto');
    expect(keyboardInsetsMode('android')).toBe('padding');
  });

  it('measures how much of the window the keyboard covers', () => {
    expect(keyboardOverlap({ height: 336, screenY: 508 }, 844, 'ios')).toBe(336);
    expect(keyboardOverlap({ height: 336, screenY: 844 }, 844, 'ios')).toBe(0);
    expect(keyboardOverlap({ height: 300, screenY: 496 }, 844, 'android')).toBe(348);
    expect(keyboardOverlap({ height: 300, screenY: 0 }, 844, 'android')).toBe(300);
    expect(keyboardOverlap({ height: 2000, screenY: 0 }, 844, 'android')).toBe(844);
    expect(keyboardOverlap(null, 844)).toBe(0);
  });

  it('counts the Android navigation bar under the keyboard: RN reports the IME height above the system bar (Android QA)', () => {
    expect(keyboardOverlap({ height: 312, screenY: 578 }, 890, 'android', 24)).toBe(336);
    expect(keyboardOverlap({ height: 312, screenY: 578 }, 914, 'android', 24)).toBe(336);
    expect(keyboardOverlap({ height: 312, screenY: 578 }, 890, 'android', 48)).toBe(360);
    expect(keyboardOverlap({ height: 0, screenY: 890 }, 890, 'android', 24)).toBe(0);
    expect(keyboardOverlap({ height: 336, screenY: 508 }, 844, 'ios', 34)).toBe(336);
  });

  it('keeps the reveal margin only while the room allows it, so a field always fits between header and dock', () => {
    expect(revealScrollOffset({ top: 340, bottom: 420, scrollY: 0, visibleTop: 130, visibleBottom: 216, margin: 32 })).toBe(207);
    expect(revealScrollOffset({ top: 340, bottom: 420, scrollY: 0, visibleTop: 130, visibleBottom: 400, margin: 32 })).toBe(52);
    expect(revealScrollOffset({ top: 340, bottom: 440, scrollY: 0, visibleTop: 130, visibleBottom: 216, margin: 32 })).toBe(210);
    expect(revealScrollOffset({ top: 200, bottom: 260, scrollY: 50, visibleTop: 130, visibleBottom: 400, margin: 32 })).toBeNull();
    expect(revealScrollOffset({ top: 140, bottom: 200, scrollY: 50, visibleTop: 130, visibleBottom: 216, margin: 32 })).toBe(47);
    expect(revealFrame([], 100)).toBeNull();
    expect(revealFrame([{ top: 0, bottom: 200 }, { top: 0, bottom: 80 }, { top: 20, bottom: 68 }], 100)).toEqual({ top: 0, bottom: 80 });
    expect(revealFrame([{ top: 0, bottom: 200 }, { top: 20, bottom: 168 }], 100)).toEqual({ top: 20, bottom: 168 });
  });

  it('scrolls a hidden field just above the keyboard and dock, or back down to one under the header', () => {
    expect(revealScrollOffset({ top: 600, bottom: 672, scrollY: 100, visibleTop: 120, visibleBottom: 400 })).toBe(372);
    expect(revealScrollOffset({ top: 60, bottom: 132, scrollY: 300, visibleTop: 120, visibleBottom: 400 })).toBe(240);
    expect(revealScrollOffset({ top: 200, bottom: 272, scrollY: 300, visibleTop: 120, visibleBottom: 400 })).toBeNull();
    expect(revealScrollOffset({ top: 300, bottom: 700, scrollY: 0, visibleTop: 120, visibleBottom: 400 })).toBe(180);
    expect(revealScrollOffset({ top: 20, bottom: 92, scrollY: 10, visibleTop: 120, visibleBottom: 400 })).toBe(0);
  });

  it('lifts the dock onto the keyboard and pads the content by the keyboard in padding mode only', () => {
    const resting = screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 0, headerHeight: null, footerHeight: FOOTER });
    const padded = screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 0, headerHeight: null, footerHeight: FOOTER, keyboard: KEYBOARD });
    const auto = screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 0, headerHeight: null, footerHeight: FOOTER, keyboard: KEYBOARD, keyboardInsets: 'auto' });
    expect(resting).toMatchObject({ footerOffset: 0, footerPadding: 16 + 34, contentBottom: FOOTER, obscuredBottom: FOOTER });
    expect(padded).toMatchObject({ footerOffset: KEYBOARD, footerPadding: 16, contentBottom: KEYBOARD + FOOTER, obscuredBottom: KEYBOARD + FOOTER });
    expect(auto).toMatchObject({ footerOffset: KEYBOARD, footerPadding: 16, contentBottom: FOOTER, obscuredBottom: KEYBOARD + FOOTER });
    const tabs = screenChrome({ safeTop: 47, safeBottom: 34, parentBottom: 60, headerHeight: null, footerHeight: null, keyboard: KEYBOARD });
    expect(tabs).toMatchObject({ footerOffset: 0, contentBottom: KEYBOARD, obscuredBottom: KEYBOARD });
  });

  it('tracks show and hide events in a hook', async () => {
    const seen: number[] = [];
    function Probe() {
      seen.push(useKeyboardOverlap());
      return null;
    }
    await withWindow(WINDOW, async () => {
      await renderWithTheme(<Probe />);
      await showKeyboard(KEYBOARD);
      expect(seen[seen.length - 1]).toBe(KEYBOARD);
      await hideKeyboard();
      expect(seen[seen.length - 1]).toBe(0);
    });
  });
});

describe('keyboard-aware Screen', () => {
  it('on Android pads the content by the keyboard, lifts the dock onto it and scrolls the focused field above both', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<FormScreen />);
        await layoutFooter(FOOTER);
        const restingPadding = contentPadding('form');
        expect(screen.getByTestId('form-scroll').props.keyboardShouldPersistTaps).toBe('handled');
        expect(screen.getByTestId('form-footer')).toHaveStyle({ bottom: 0, paddingBottom: 16 + 34 });
        const scrollTo = scrollSpy();
        const fieldTop = 640;
        const fieldHeight = 96;
        measureAt(fieldTop, fieldHeight);
        await act(async () => {
          screen.getByTestId('form-scroll').props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 40 } } });
        });
        await fireEvent(screen.getByTestId('form-name'), 'focus');
        expect(scrollTo).not.toHaveBeenCalled();
        await showKeyboard(KEYBOARD);
        expect(contentPadding('form')).toBe(KEYBOARD + FOOTER + SCREEN_END_SPACE);
        expect(contentPadding('form')).toBeGreaterThan(restingPadding);
        expect(screen.getByTestId('form-footer')).toHaveStyle({ bottom: KEYBOARD, paddingBottom: 16 });
        const visibleBottom = WINDOW.height - KEYBOARD - FOOTER - KEYBOARD_REVEAL_MARGIN;
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 40 + (fieldTop + fieldHeight - visibleBottom), animated: true });
        await hideKeyboard();
        expect(screen.getByTestId('form-footer')).toHaveStyle({ bottom: 0, paddingBottom: 16 + 34 });
        expect(contentPadding('form')).toBe(restingPadding);
      }),
    );
  });

  it('on iOS lets the scroll view inset itself for the keyboard but still lifts the dock and clears it', async () => {
    await withPlatform('ios', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<FormScreen />);
        await layoutFooter(FOOTER);
        expect(screen.getByTestId('form-scroll').props.automaticallyAdjustKeyboardInsets).toBe(true);
        const restingPadding = contentPadding('form');
        const scrollTo = scrollSpy();
        measureAt(600, 96);
        await fireEvent(screen.getByTestId('form-name'), 'focus');
        await showKeyboard(KEYBOARD);
        expect(contentPadding('form')).toBe(restingPadding);
        expect(screen.getByTestId('form-footer')).toHaveStyle({ bottom: KEYBOARD });
        const visibleBottom = WINDOW.height - KEYBOARD - FOOTER - KEYBOARD_REVEAL_MARGIN;
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 600 + 96 - visibleBottom, animated: true });
      }),
    );
  });

  it('reveals a field focused while the keyboard is already open, and leaves visible fields alone', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<FormScreen />);
        await layoutFooter(FOOTER);
        const scrollTo = scrollSpy();
        measureAt(120, 72);
        await showKeyboard(KEYBOARD);
        await fireEvent(screen.getByTestId('form-name'), 'focus');
        expect(scrollTo).not.toHaveBeenCalled();
        measureAt(700, 72);
        await fireEvent(screen.getByTestId('form-name'), 'blur');
        await fireEvent(screen.getByTestId('form-name'), 'focus');
        expect(scrollTo).toHaveBeenCalledTimes(1);
      }),
    );
  });

  it('jumps instead of animating the scroll when motion is reduced', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<FormScreen />, { reducedMotion: 'on' });
        await layoutFooter(FOOTER);
        const scrollTo = scrollSpy();
        measureAt(700, 72);
        await fireEvent(screen.getByTestId('form-name'), 'focus');
        await showKeyboard(KEYBOARD);
        expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
      }),
    );
  });
});

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;
type MeasuredView = { readonly props?: { readonly testID?: string; readonly style?: unknown } };

function measureByRole(frames: { readonly group?: readonly [number, number]; readonly root: readonly [number, number]; readonly core: readonly [number, number] }) {
  const measure = jest.spyOn(View.prototype as unknown as { measureInWindow: (callback: MeasureCallback) => void }, 'measureInWindow');
  measure.mockReset();
  measure.mockImplementation(function (this: MeasuredView, callback: MeasureCallback) {
    const style = (StyleSheet.flatten(this.props?.style as never) ?? {}) as { minHeight?: number };
    const [y, height] = this.props?.testID === 'group' && frames.group ? frames.group : typeof style.minHeight === 'number' ? frames.core : frames.root;
    callback(0, y, 320, height);
  });
  return measure;
}

function lastScrollY(scrollTo: { readonly mock: { readonly calls: readonly unknown[][] } }): number {
  const calls = scrollTo.mock.calls;
  return (calls[calls.length - 1][0] as { readonly y: number }).y;
}

describe('keyboard-aware Screen at 320 x 568 with a tall header (Android QA)', () => {
  const SMALL = { width: 320, height: 568, fontScale: 1, scale: 2 };
  const SMALL_METRICS = { frame: { x: 0, y: 0, width: 320, height: 568 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };
  const HEADER = 130;
  const SMALL_KEYBOARD = 284;

  function TallHeaderForm() {
    return (
      <Screen testID="tall" header={<RNText>New tournament</RNText>} footer={<RNText>Next</RNText>}>
        <View style={{ height: 300 }} />
        <TextField label="Organizer" value="" onChangeText={jest.fn()} testID="tall-organizer" />
      </Screen>
    );
  }

  async function layout(testID: string, height: number) {
    await act(async () => {
      screen.getByTestId(testID).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height } } });
    });
  }

  it('lands the field between the header and the dock, and a second reveal before the scroll settles never overshoots it under the header', async () => {
    await withPlatform('android', () =>
      withWindow(SMALL, async () => {
        await renderWithTheme(<TallHeaderForm />, { metrics: SMALL_METRICS });
        await layout('tall-header', HEADER);
        await layout('tall-footer', 116);
        const scrollTo = scrollSpy();
        measureByRole({ root: [340, 80], core: [372, 48] });
        await fireEvent(screen.getByTestId('tall-organizer'), 'focus');
        await showKeyboard(SMALL_KEYBOARD);
        await layout('tall-footer', 92);
        await layout('tall-footer', 100);
        expect(scrollTo.mock.calls.length).toBeGreaterThan(1);
        for (const [options] of scrollTo.mock.calls as [{ readonly y: number }][]) {
          expect(372 - options.y).toBeGreaterThanOrEqual(HEADER);
        }
        const last = lastScrollY(scrollTo);
        expect(420 - last).toBeLessThanOrEqual(SMALL.height - SMALL_KEYBOARD - 100);
      }),
    );
  });

  it('scrolls from the offset the scroll view reports, so a reveal after the scroll has moved stays put', async () => {
    await withPlatform('android', () =>
      withWindow(SMALL, async () => {
        await renderWithTheme(<TallHeaderForm />, { metrics: SMALL_METRICS });
        await layout('tall-header', HEADER);
        await layout('tall-footer', 100);
        const scrollTo = scrollSpy();
        measureByRole({ root: [340, 80], core: [372, 48] });
        await fireEvent(screen.getByTestId('tall-organizer'), 'focus');
        await showKeyboard(SMALL_KEYBOARD);
        const first = lastScrollY(scrollTo);
        await act(async () => {
          screen.getByTestId('tall-scroll').props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: first } } });
        });
        measureByRole({ root: [340 - first, 80], core: [372 - first, 48] });
        scrollTo.mockClear();
        await layout('tall-footer', 92);
        for (const [options] of scrollTo.mock.calls as [{ readonly y: number }][]) {
          expect(Math.abs(options.y - first)).toBeLessThanOrEqual(8);
        }
      }),
    );
  });
});

describe('KeyboardGroup', () => {
  function ReasonForm() {
    return (
      <Screen testID="reason">
        <View style={{ height: 300 }} />
        <KeyboardGroup testID="group">
          <TextField label="Reason" value="" onChangeText={jest.fn()} testID="reason-field" />
          <RNText>Apply change</RNText>
        </KeyboardGroup>
      </Screen>
    );
  }

  it('scrolls the primary action into view with the focused field when both fit above the keyboard', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<ReasonForm />);
        const scrollTo = scrollSpy();
        measureByRole({ group: [400, 200], root: [400, 80], core: [432, 48] });
        await fireEvent(screen.getByTestId('reason-field'), 'focus');
        await showKeyboard(KEYBOARD);
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 600 - (WINDOW.height - KEYBOARD - KEYBOARD_REVEAL_MARGIN), animated: true });
      }),
    );
  });

  it('falls back to the field alone when the group is taller than the room left', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(<ReasonForm />);
        const scrollTo = scrollSpy();
        measureByRole({ group: [400, 600], root: [700, 80], core: [732, 48] });
        await fireEvent(screen.getByTestId('reason-field'), 'focus');
        await showKeyboard(KEYBOARD);
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 780 - (WINDOW.height - KEYBOARD - KEYBOARD_REVEAL_MARGIN), animated: true });
      }),
    );
  });

  it('renders its children unchanged outside a keyboard scope', async () => {
    await renderWithTheme(
      <KeyboardGroup testID="group">
        <RNText>Alone</RNText>
      </KeyboardGroup>,
    );
    expect(screen.getByText('Alone')).toBeOnTheScreen();
  });
});

describe('keyboard-aware Sheet', () => {
  it('rises above the keyboard, shrinks to fit and drops the home-indicator padding', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        await renderWithTheme(
          <Sheet visible title="New player" onClose={jest.fn()} testID="sheet" footer={<RNText>Add</RNText>}>
            <TextField label="Name" value="" onChangeText={jest.fn()} testID="sheet-name" />
          </Sheet>,
        );
        expect(screen.getByTestId('sheet-keyboard')).toHaveStyle({ paddingBottom: 0 });
        expect(screen.getByTestId('sheet-footer')).toHaveStyle({ paddingBottom: 16 + 34 });
        const scrollTo = scrollSpy();
        measureAt(700, 72);
        await fireEvent(screen.getByTestId('sheet-name'), 'focus');
        await showKeyboard(KEYBOARD);
        expect(screen.getByTestId('sheet-keyboard')).toHaveStyle({ paddingBottom: KEYBOARD });
        expect(screen.getByTestId('sheet-footer')).toHaveStyle({ paddingBottom: 16 });
        expect(screen.getByTestId('sheet')).toHaveStyle({ maxHeight: sheetMaxHeight(WINDOW.height, KEYBOARD, 47) });
        expect(scrollTo).toHaveBeenCalled();
      }),
    );
  });

  it('sits on the IME top when Android reports the keyboard height above the navigation bar (Android QA)', async () => {
    const metrics = { frame: { x: 0, y: 0, width: 411, height: 914 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };
    await withPlatform('android', () =>
      withWindow({ width: 411, height: 890, fontScale: 1, scale: 2.625 }, async () => {
        await renderWithTheme(
          <Sheet visible title="New team" onClose={jest.fn()} testID="sheet" footer={<RNText>Create team</RNText>}>
            <TextField label="Team name" value="" onChangeText={jest.fn()} testID="sheet-name" />
          </Sheet>,
          { metrics },
        );
        await act(async () => {
          DeviceEventEmitter.emit('keyboardDidShow', { duration: 0, easing: 'keyboard', endCoordinates: { height: 312, screenY: 578, screenX: 0, width: 411 } });
        });
        expect(screen.getByTestId('sheet-keyboard')).toHaveStyle({ paddingBottom: 336 });
        expect(screen.getByTestId('sheet-footer')).toHaveStyle({ paddingBottom: 16 });
      }),
    );
  });

  it('on Android focuses an autoFocus field once the sheet has finished opening, so the keyboard shows (Android QA)', async () => {
    jest.useFakeTimers();
    try {
      await withPlatform('android', async () => {
        const focus = focusSpy();
        await renderWithTheme(
          <Sheet visible title="Add player" onClose={jest.fn()} testID="sheet">
            <TextField label="Name" value="" onChangeText={jest.fn()} autoFocus testID="sheet-name" />
          </Sheet>,
        );
        expect(screen.getByTestId('sheet-name').props.autoFocus).toBe(false);
        expect(focus).not.toHaveBeenCalled();
        await act(async () => {
          jest.advanceTimersByTime(motionDuration.base);
        });
        expect(focusedTestIDs(focus)).toEqual(['sheet-name']);
        await showKeyboard(KEYBOARD, 'android');
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
        expect(focus).toHaveBeenCalledTimes(1);
        focus.mockRestore();
      });
    } finally {
      await resetKeyboard();
      jest.useRealTimers();
    }
  });

  it('on Android asks again for the keyboard a few times when the sheet window was not ready for it (Android QA)', async () => {
    jest.useFakeTimers();
    try {
      await withPlatform('android', async () => {
        await resetKeyboard();
        const focused = jest.spyOn(TextInput.prototype as unknown as { isFocused: () => boolean }, 'isFocused').mockReturnValue(true);
        const focus = focusSpy();
        await renderWithTheme(
          <Sheet visible title="Add player" onClose={jest.fn()} testID="sheet">
            <TextField label="Name" value="" onChangeText={jest.fn()} autoFocus testID="sheet-name" />
          </Sheet>,
        );
        await act(async () => {
          jest.advanceTimersByTime(motionDuration.base);
        });
        expect(focus).toHaveBeenCalledTimes(1);
        await act(async () => {
          jest.advanceTimersByTime(AUTOFOCUS_RETRY_MS);
        });
        expect(focus).toHaveBeenCalledTimes(2);
        await showKeyboard(KEYBOARD, 'android');
        await act(async () => {
          jest.advanceTimersByTime(AUTOFOCUS_RETRY_MS * (AUTOFOCUS_RETRIES + 2));
        });
        expect(focus).toHaveBeenCalledTimes(2);
        await resetKeyboard();
        focus.mockClear();
        await renderWithTheme(
          <Sheet visible title="Add player" onClose={jest.fn()} testID="sheet">
            <TextField label="Name" value="" onChangeText={jest.fn()} autoFocus testID="sheet-name" />
          </Sheet>,
        );
        await act(async () => {
          jest.advanceTimersByTime(motionDuration.base);
        });
        for (let step = 0; step < AUTOFOCUS_RETRIES + 3; step += 1) {
          await act(async () => {
            jest.advanceTimersByTime(AUTOFOCUS_RETRY_MS);
          });
        }
        expect(focus).toHaveBeenCalledTimes(1 + AUTOFOCUS_RETRIES);
        focused.mockReturnValue(false);
        focus.mockClear();
        await renderWithTheme(
          <Sheet visible title="Add player" onClose={jest.fn()} testID="sheet">
            <TextField label="Name" value="" onChangeText={jest.fn()} autoFocus testID="sheet-name" />
          </Sheet>,
        );
        await act(async () => {
          jest.advanceTimersByTime(motionDuration.base);
        });
        for (let step = 0; step < AUTOFOCUS_RETRIES + 3; step += 1) {
          await act(async () => {
            jest.advanceTimersByTime(AUTOFOCUS_RETRY_MS);
          });
        }
        expect(focus).toHaveBeenCalledTimes(1);
        focused.mockRestore();
        focus.mockRestore();
      });
    } finally {
      await resetKeyboard();
      jest.useRealTimers();
    }
  });

  it('keeps native autoFocus outside overlays, and inside them on iOS and web', async () => {
    await renderWithTheme(<TextField label="Search" value="" onChangeText={jest.fn()} autoFocus testID="plain-search" />);
    expect(screen.getByTestId('plain-search').props.autoFocus).toBe(true);
    await withPlatform('ios', async () => {
      await renderWithTheme(
        <Sheet visible title="Add player" onClose={jest.fn()} testID="sheet">
          <TextField label="Name" value="" onChangeText={jest.fn()} autoFocus testID="ios-name" />
        </Sheet>,
      );
      expect(screen.getByTestId('ios-name').props.autoFocus).toBe(true);
    });
  });

  it('caps the sheet height by the space the keyboard leaves', () => {
    expect(sheetMaxHeight(844, 0, 47)).toBeCloseTo(844 * 0.9);
    expect(sheetMaxHeight(844, 336, 47)).toBe(844 - 336 - 47 - 16);
    expect(sheetMaxHeight(400, 380, 47)).toBe(0);
  });
});

describe('keyboard-aware Dialog', () => {
  it('centres itself in the space above the keyboard and returns when it hides, keeping the typed text', async () => {
    await withPlatform('android', () =>
      withWindow(WINDOW, async () => {
        function Rename() {
          const [name, setName] = useState('');
          return (
            <Dialog visible title="Rename" confirm={{ label: 'Save', onPress: jest.fn() }} cancel={{ label: 'Cancel', onPress: jest.fn() }} testID="rename">
              <TextField label="Name" value={name} onChangeText={setName} testID="rename-name" />
            </Dialog>
          );
        }
        await renderWithTheme(<Rename />);
        expect(screen.getByTestId('rename-keyboard')).toHaveStyle({ paddingBottom: 0 });
        await fireEvent.changeText(screen.getByTestId('rename-name'), 'Harbour Kings');
        await showKeyboard(KEYBOARD);
        expect(screen.getByTestId('rename-keyboard')).toHaveStyle({ paddingBottom: KEYBOARD });
        await hideKeyboard();
        expect(screen.getByTestId('rename-keyboard')).toHaveStyle({ paddingBottom: 0 });
        expect(screen.getByTestId('rename-name').props.value).toBe('Harbour Kings');
      }),
    );
  });
});

describe('useFormChain', () => {
  function Chain({ onSubmit, skipCode = false }: { readonly onSubmit: () => void; readonly skipCode?: boolean }) {
    const chain = useFormChain(['name', 'code', 'overs'] as const, { onSubmit, skip: (key) => skipCode && key === 'code' });
    return (
      <View>
        <TextField {...chain.field('name')} label="Name" value="" onChangeText={jest.fn()} testID="chain-name" />
        <TextField {...chain.field('code')} label="Code" value="" onChangeText={jest.fn()} testID="chain-code" />
        <TextField {...chain.field('overs')} label="Overs" value="" numeric onChangeText={jest.fn()} testID="chain-overs" />
      </View>
    );
  }

  it('moves to the next field on return and submits from the last one', async () => {
    const focus = focusSpy();
    const onSubmit = jest.fn();
    await renderWithTheme(<Chain onSubmit={onSubmit} />);
    expect(screen.getByTestId('chain-name').props.returnKeyType).toBe('next');
    expect(screen.getByTestId('chain-name').props.submitBehavior).toBe('submit');
    expect(screen.getByTestId('chain-overs').props.returnKeyType).toBe('done');
    expect(screen.getByTestId('chain-overs').props.submitBehavior).toBe('blurAndSubmit');
    expect(screen.getByTestId('chain-overs').props.keyboardType).toBe('number-pad');
    await fireEvent(screen.getByTestId('chain-name'), 'submitEditing');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focusedTestIDs(focus)).toEqual(['chain-code']);
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('chain-overs'), 'submitEditing');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('on Android re-opens the keyboard when a Return key event hides it right after moving to the next field (Android QA)', async () => {
    await withPlatform('android', async () => {
      const focus = focusSpy();
      const blur = jest.spyOn(TextInput.prototype as unknown as { blur: () => void }, 'blur');
      blur.mockClear();
      const focused = jest.spyOn(TextInput.prototype as unknown as { isFocused: () => boolean }, 'isFocused').mockReturnValue(true);
      try {
        await renderWithTheme(<Chain onSubmit={jest.fn()} />);
        await showKeyboard(KEYBOARD);
        await fireEvent(screen.getByTestId('chain-name'), 'submitEditing');
        expect(focusedTestIDs(focus)).toEqual(['chain-code']);
        await hideKeyboard();
        expect(blur).toHaveBeenCalledTimes(1);
        expect(focusedTestIDs(focus)).toEqual(['chain-code', 'chain-code']);
        await showKeyboard(KEYBOARD);
        await hideKeyboard();
        expect(focusedTestIDs(focus)).toEqual(['chain-code', 'chain-code']);
      } finally {
        focus.mockRestore();
        blur.mockRestore();
        focused.mockRestore();
      }
    });
  });

  it('lets the keyboard go once the hold window has passed', async () => {
    jest.useFakeTimers();
    try {
      await withPlatform('android', async () => {
        const focus = focusSpy();
        const focused = jest.spyOn(TextInput.prototype as unknown as { isFocused: () => boolean }, 'isFocused').mockReturnValue(true);
        try {
          await renderWithTheme(<Chain onSubmit={jest.fn()} />);
          await fireEvent(screen.getByTestId('chain-name'), 'submitEditing');
          await act(async () => {
            jest.advanceTimersByTime(KEYBOARD_HOLD_MS + 1);
          });
          await hideKeyboard();
          expect(focusedTestIDs(focus)).toEqual(['chain-code']);
        } finally {
          focus.mockRestore();
          focused.mockRestore();
        }
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-shows the keyboard when repeated entry refocuses a field that kept focus but lost the keyboard', () => {
    const calls: string[] = [];
    const input = {
      isFocused: () => true,
      blur: () => calls.push('blur'),
      focus: () => calls.push('focus'),
    } as unknown as TextInput;
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    showKeyboardFor(input, 'android');
    expect(calls).toEqual(['blur', 'focus']);
    calls.length = 0;
    showKeyboardFor(input, 'ios');
    expect(calls).toEqual(['focus']);
    calls.length = 0;
    visible.mockReturnValue(true);
    showKeyboardFor(input, 'android');
    expect(calls).toEqual(['focus']);
    visible.mockRestore();
  });

  it('skips fields that are not part of the chain right now', async () => {
    const focus = focusSpy();
    await renderWithTheme(<Chain onSubmit={jest.fn()} skipCode />);
    expect(screen.getByTestId('chain-name').props.returnKeyType).toBe('next');
    await fireEvent(screen.getByTestId('chain-name'), 'submitEditing');
    expect(focusedTestIDs(focus)).toEqual(['chain-overs']);
    expect(nextChainKey(['a', 'b', 'c'], 'c')).toBeNull();
    expect(nextChainKey(['a', 'b', 'c'], 'a', (key) => key === 'b')).toBe('c');
    expect(nextChainKey(['a'], 'x' as 'a')).toBeNull();
  });
});

describe('window used by these tests', () => {
  it('restores the jest window afterwards', () => {
    expect(Dimensions.get('window').width).not.toBe(WINDOW.width);
  });
});

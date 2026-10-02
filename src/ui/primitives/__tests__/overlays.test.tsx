import '../../testing';
import { AccessibilityInfo, Text as RNText } from 'react-native';
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { darkColors, lightColors } from '../../theme';
import { Screen, ToastAnchorProvider, latestToastAnchor, useToastAnchor, type ToastAnchor } from '../../layout';
import { TabChrome, floatingTabBarMetrics } from '../../navigation';
import {
  Dialog,
  Sheet,
  SWIPE_DISMISS_RATIO,
  TOAST_DURATION_MS,
  ToastHost,
  shouldDismissOnRelease,
  shouldStackActions,
  toastDurationMs,
  toastHostEdge,
  type ToastMessage,
} from '..';

function modalHost(container: { queryAll: (predicate: (node: { type: string; props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] }) {
  const [modal] = container.queryAll((node) => node.type === 'Modal');
  return modal;
}

describe('Sheet', () => {
  it('renders a modal container with a header title, content and a close button', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <Sheet visible title="Extras" subtitle="Wide penalty is 1 run" onClose={onClose} testID="sheet-extras">
        <RNText>WD+1</RNText>
      </Sheet>,
    );
    expect(screen.getByTestId('sheet-extras')).toHaveProp('accessibilityViewIsModal', true);
    expect(screen.getByRole('header', { name: 'Extras' })).toBeOnTheScreen();
    expect(screen.getByText('Wide penalty is 1 run')).toBeOnTheScreen();
    expect(screen.getByText('WD+1')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses a non-blocking sheet from the scrim and the Android back button', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <Sheet visible title="More" onClose={onClose} testID="sheet-more">
        <RNText>Body</RNText>
      </Sheet>,
    );
    await fireEvent.press(screen.getByTestId('sheet-more-scrim'));
    const modal = modalHost(view.container);
    await act(async () => {
      (modal.props.onRequestClose as () => void)();
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps a blocking sheet open: no close button, scrim and back do nothing', async () => {
    const onClose = jest.fn();
    const view = await renderWithTheme(
      <Sheet visible blocking title="Next batter" onClose={onClose} testID="prompt-next-batter">
        <RNText>Pick</RNText>
      </Sheet>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-next-batter-scrim'));
    await act(async () => {
      (modalHost(view.container).props.onRequestClose as () => void)();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves screen-reader focus to the title when it opens', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await renderWithTheme(
      <Sheet visible title="Wicket" onClose={jest.fn()}>
        <RNText>Bowled</RNText>
      </Sheet>,
    );
    await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus'));
    focus.mockRestore();
  });

  it('stays mounted for the exit motion and then unmounts', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(
        <Sheet visible title="Extras" onClose={jest.fn()} testID="sheet-extras">
          <RNText>Chips</RNText>
        </Sheet>,
      );
      await view.rerender(
        <Sheet visible={false} title="Extras" onClose={jest.fn()} testID="sheet-extras">
          <RNText>Chips</RNText>
        </Sheet>,
      );
      expect(screen.getByTestId('sheet-extras')).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('sheet-extras')).not.toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders nothing while closed', async () => {
    await renderWithTheme(
      <Sheet visible={false} title="Hidden">
        <RNText>Nope</RNText>
      </Sheet>,
    );
    expect(screen.queryByText('Nope')).not.toBeOnTheScreen();
  });

  it('dismisses on a swipe of more than 30 % of its height only', () => {
    expect(SWIPE_DISMISS_RATIO).toBe(0.3);
    expect(shouldDismissOnRelease(121, 400)).toBe(true);
    expect(shouldDismissOnRelease(119, 400)).toBe(false);
    expect(shouldDismissOnRelease(50, 0)).toBe(false);
  });

  it('slides in with motion and only fades with reduced motion', async () => {
    const full = await renderWithTheme(
      <Sheet visible title="Motion" testID="sheet-motion">
        <RNText>x</RNText>
      </Sheet>,
    );
    const moving = screen.getByTestId('sheet-motion');
    const translate = (moving.props.style as unknown[]).flat().find((s) => s && typeof s === 'object' && 'transform' in (s as object));
    expect(JSON.stringify(translate)).toContain('translateY');
    await full.unmount();
    await renderWithTheme(
      <Sheet visible title="Still" testID="sheet-still">
        <RNText>y</RNText>
      </Sheet>,
      { reducedMotion: 'on' },
    );
    expect(screen.getByTestId('sheet-still')).toHaveStyle({ transform: [{ translateY: 0 }] });
  });
});

describe('Dialog', () => {
  it('uses the E2E test ids and calls its actions', async () => {
    const confirm = jest.fn();
    const cancel = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <Dialog
        visible
        title="Replace pools?"
        message="Current pool arrangement will be replaced."
        confirm={{ label: 'Replace', onPress: confirm }}
        cancel={{ label: 'Cancel', onPress: cancel }}
      />,
    );
    expect(screen.getByTestId('dialog-confirm')).toHaveProp('accessibilityViewIsModal', true);
    expect(screen.getByTestId('dialog-text-message')).toHaveTextContent('Current pool arrangement will be replaced.');
    expect(screen.getByRole('header', { name: 'Replace pools?' })).toBeOnTheScreen();
    await user.press(screen.getByTestId('dialog-btn-confirm'));
    await user.press(screen.getByTestId('dialog-btn-cancel'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('puts Cancel first, uses the destructive confirm style and focuses Cancel', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await renderWithTheme(
      <Dialog
        visible
        destructive
        title="Discard this match?"
        message="The match and its balls are deleted from this phone."
        confirm={{ label: 'Discard', onPress: jest.fn() }}
        cancel={{ label: 'Cancel', onPress: jest.fn() }}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(['Cancel', 'Discard']);
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveStyle({ backgroundColor: lightColors.danger });
    await waitFor(() => expect(focus).toHaveBeenCalled());
    const target = focus.mock.calls[0][0] as unknown as { props?: Record<string, unknown> } | null;
    expect(target).not.toBeNull();
    focus.mockRestore();
  });

  it('stacks the actions for long labels or large text', () => {
    expect(shouldStackActions(['Cancel', 'Delete'], 1)).toBe(false);
    expect(shouldStackActions(['Cancel', 'Delete tournament and matches'], 1)).toBe(true);
    expect(shouldStackActions(['Cancel', 'OK'], 1.35)).toBe(true);
  });
});

describe('Toast', () => {
  const info: ToastMessage = { id: 't1', kind: 'info', message: 'Pools drawn, seed 847291', action: null };
  const error: ToastMessage = {
    id: 't2',
    kind: 'error',
    message: "Couldn't save this delivery. Your previous match data is still safe.",
    action: { label: 'Try again', run: jest.fn() },
  };

  it('times out info and success after 4 s, 6 s with an action, and never for errors', () => {
    expect(toastDurationMs({ kind: 'info', action: null })).toBe(TOAST_DURATION_MS.plain);
    expect(toastDurationMs({ kind: 'success', action: { label: 'Undo', run: jest.fn() } })).toBe(TOAST_DURATION_MS.withAction);
    expect(toastDurationMs(error)).toBeNull();
    expect(TOAST_DURATION_MS).toEqual({ plain: 4000, withAction: 6000 });
  });

  it('shows one toast at a time as a polite live region on pale popover glass with charcoal ink in light theme', async () => {
    await renderWithTheme(<ToastHost toasts={[info, error]} onDismiss={jest.fn()} />);
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(toast).toHaveStyle({ borderRadius: 16 });
    expect(screen.getByTestId('toast-glass', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('toast-text')).toHaveTextContent('Pools drawn, seed 847291');
    expect(screen.getByTestId('toast-text')).toHaveStyle({ color: lightColors.textPrimary });
  });

  it('uses the deep tinted popover glass with bright ink in dark theme', async () => {
    await renderWithTheme(<ToastHost toasts={[info]} onDismiss={jest.fn()} />, { mode: 'dark' });
    expect(screen.getByTestId('toast')).toHaveStyle({ borderRadius: 16 });
    expect(screen.getByTestId('toast-text')).toHaveStyle({ color: darkColors.textPrimary });
  });

  it('announces errors assertively, runs the action and can be dismissed', async () => {
    const onDismiss = jest.fn();
    const user = userEvent.setup();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderWithTheme(<ToastHost toasts={[error]} onDismiss={onDismiss} />);
    const toast = screen.getByTestId('toast');
    expect(toast).toHaveProp('accessibilityLiveRegion', 'assertive');
    expect(toast).toHaveProp('accessibilityRole', 'alert');
    expect(announce).toHaveBeenCalledWith(error.message);
    await user.press(screen.getByTestId('toast-btn-action'));
    expect(error.action?.run).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('t2');
    await user.press(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    announce.mockRestore();
  });

  it('auto-dismisses after its duration, but leaves errors in place', async () => {
    jest.useFakeTimers();
    try {
      const onDismiss = jest.fn();
      const view = await renderWithTheme(<ToastHost toasts={[info]} onDismiss={onDismiss} />);
      await act(async () => {
        jest.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledWith('t1');
      onDismiss.mockClear();
      await view.rerender(<ToastHost toasts={[error]} onDismiss={onDismiss} />);
      await act(async () => {
        jest.advanceTimersByTime(60000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('sits 16 above the home indicator when nothing else claims the bottom edge', async () => {
    await renderWithTheme(<ToastHost toasts={[info]} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('toast-host')).toHaveStyle({ position: 'absolute', bottom: 16 + 34 });
    expect(toastHostEdge('top', undefined, null, 34)).toEqual({ top: 16 });
    expect(toastHostEdge(undefined, 24, { edge: 'top', offset: 200 }, 34)).toEqual({ bottom: 24 + 34 });
    expect(toastHostEdge(undefined, undefined, { edge: 'top', offset: 200 }, 34)).toEqual({ top: 200 });
  });

  it('clears the floating glass tab bar and a glass footer, and the newest anchor wins (§6.10, §106)', async () => {
    function Pinned({ anchor }: { readonly anchor: ToastAnchor | null }) {
      useToastAnchor(anchor);
      return null;
    }
    const tree = (pinned: ToastAnchor | null, footer: boolean) => (
      <ToastAnchorProvider>
        <TabChrome>
          {footer ? (
            <Screen testID="screen-anchor" footer={<RNText>Next</RNText>}>
              <RNText>Body</RNText>
            </Screen>
          ) : null}
          <Pinned anchor={pinned} />
        </TabChrome>
        <ToastHost toasts={[info]} onDismiss={jest.fn()} />
      </ToastAnchorProvider>
    );
    const tabTop = floatingTabBarMetrics(34).footprint;
    const view = await renderWithTheme(tree(null, false));
    expect(screen.getByTestId('toast-host')).toHaveStyle({ bottom: tabTop + 16 });
    await view.rerender(tree({ edge: 'top', offset: 180 }, false));
    expect(screen.getByTestId('toast-host')).toHaveStyle({ top: 180 });
    await view.rerender(tree(null, false));
    expect(screen.getByTestId('toast-host')).toHaveStyle({ bottom: tabTop + 16 });
    await view.rerender(tree(null, true));
    await act(async () => {
      screen.getByTestId('screen-anchor-footer').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } } });
    });
    expect(screen.getByTestId('toast-host')).toHaveStyle({ bottom: tabTop + 80 + 16 });
  });

  it('picks the most recently mounted anchor', () => {
    const anchors = new Map<number, ToastAnchor>([
      [3, { edge: 'bottom', offset: 50 }],
      [7, { edge: 'top', offset: 120 }],
      [5, { edge: 'bottom', offset: 98 }],
    ]);
    expect(latestToastAnchor(anchors)).toEqual({ edge: 'top', offset: 120 });
    expect(latestToastAnchor(new Map())).toBeNull();
  });

  it('renders nothing without toasts', async () => {
    await renderWithTheme(<ToastHost toasts={[]} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId('toast')).not.toBeOnTheScreen();
  });
});

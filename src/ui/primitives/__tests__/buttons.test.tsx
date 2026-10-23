import '../../testing';
import { createRef } from 'react';
import type { View } from 'react-native';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { createTheme, darkColors, lightColors, relativeLuminance } from '../../theme';
import { Button, IconButton, type ButtonVariant } from '..';
import { buttonSurfaceStyle, disabledFill, disabledLookFor } from '../Button';

describe('Button', () => {
  it('exposes the button role, its label and fires once per tap', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<Button label="Start match" onPress={onPress} testID="setup-btn-start" />);
    const button = screen.getByRole('button', { name: 'Start match' });
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
  });

  it.each([
    ['primary', lightColors.accent, lightColors.onAccent],
    ['secondary', lightColors.surface, lightColors.textPrimary],
    ['destructive', lightColors.surface, lightColors.danger],
    ['destructiveConfirm', lightColors.danger, lightColors.onDanger],
  ] as const)('paints the %s variant from tokens', async (variant, background, label) => {
    await renderWithTheme(<Button label="Go" variant={variant as ButtonVariant} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({ backgroundColor: background });
    expect(screen.getByText('Go')).toHaveStyle({ color: label });
  });

  it('uses the dark palette in the dark theme', async () => {
    await renderWithTheme(<Button label="Go" onPress={jest.fn()} />, { mode: 'dark' });
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({ backgroundColor: darkColors.accent });
    expect(screen.getByText('Go')).toHaveStyle({ color: darkColors.onAccent });
  });

  it('marks the disabled state, greys the label and ignores presses', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Next" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Next' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ backgroundColor: lightColors.surfaceSunken });
    expect(screen.getByText('Next')).toHaveStyle({ color: lightColors.textMuted });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps its label while loading, reports busy and ignores presses', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<Button label="Save" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeBusy();
    expect(screen.getByText('Save')).toBeOnTheScreen();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reaches a 44 × 44 target at every size, the small size through hit slop', async () => {
    await renderWithTheme(
      <>
        <Button label="Large" size="lg" onPress={jest.fn()} />
        <Button label="Medium" size="md" onPress={jest.fn()} />
        <Button label="Small" size="sm" onPress={jest.fn()} />
      </>,
    );
    for (const name of ['Large', 'Medium', 'Small']) {
      const size = touchTargetSize(screen.getByRole('button', { name }));
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.width).toBeGreaterThanOrEqual(44);
    }
    expect(screen.getByRole('button', { name: 'Large' })).toHaveStyle({ height: 56 });
    expect(screen.getByRole('button', { name: 'Small' })).toHaveStyle({ height: 44 });
  });

  it.each(['light', 'dark'] as const)('never makes a disabled button look more pressable than an enabled one (%s)', (scheme) => {
    const theme = createTheme(scheme);
    expect(disabledLookFor('tertiary')).toBe('text');
    expect(disabledLookFor('tertiaryInverse')).toBe('text');
    expect(disabledLookFor('secondary')).toBe('outlined');
    expect(disabledLookFor('destructive')).toBe('outlined');
    expect(disabledLookFor('primary')).toBe('filled');
    expect(buttonSurfaceStyle(theme, 'tertiary', false, true)).toEqual(expect.objectContaining({ backgroundColor: 'transparent', borderWidth: 0 }));
    expect(buttonSurfaceStyle(theme, 'secondary', false, true)).toEqual(
      expect.objectContaining({ backgroundColor: 'transparent', borderWidth: theme.borderWidth.control, borderColor: theme.color.border }),
    );
    const fill = buttonSurfaceStyle(theme, 'primary', false, true).backgroundColor;
    expect(fill).toBe(disabledFill(theme));
    expect(fill).not.toBe(theme.color.accent);
    if (scheme === 'dark') {
      expect(relativeLuminance(String(fill))).toBeGreaterThan(relativeLuminance(theme.color.background));
    }
  });

  it.each(['light', 'dark'] as const)('presses as an instant background swap with no opacity flash, except the destructive confirm at 88%% (§6.1), in %s', (scheme) => {
    const theme = createTheme(scheme);
    const swaps: readonly (readonly [ButtonVariant, string, string])[] = [
      ['primary', theme.color.accent, theme.color.accentPressed],
      ['secondary', theme.color.surface, theme.color.surfaceSunken],
      ['tertiary', 'transparent', theme.color.surfaceSunken],
      ['destructive', theme.color.surface, theme.color.dangerSubtle],
    ];
    for (const [variant, rest, pressed] of swaps) {
      expect(buttonSurfaceStyle(theme, variant, false, false)).toEqual(expect.objectContaining({ backgroundColor: rest, opacity: 1 }));
      expect(buttonSurfaceStyle(theme, variant, true, false)).toEqual(expect.objectContaining({ backgroundColor: pressed, opacity: 1 }));
    }
    expect(buttonSurfaceStyle(theme, 'destructiveConfirm', true, false)).toEqual(expect.objectContaining({ backgroundColor: theme.color.danger, opacity: 0.88 }));
    expect(buttonSurfaceStyle(theme, 'tertiaryInverse', true, false)).toEqual(expect.objectContaining({ backgroundColor: 'transparent', opacity: 1 }));
  });

  it('forwards a ref to its own accessible element so focus can be placed on it', async () => {
    const ref = createRef<View>();
    await renderWithTheme(<Button ref={ref} label="Cancel" variant="secondary" onPress={jest.fn()} />);
    const host = ref.current as unknown as { readonly props: Readonly<Record<string, unknown>> } | null;
    expect(host?.props.accessibilityRole).toBe('button');
    expect(host?.props.accessibilityLabel).toBe('Cancel');
  });

  it('accepts a separate accessibility label and hint', async () => {
    await renderWithTheme(<Button label="+ NEW MATCH" caps accessibilityLabel="New match" accessibilityHint="Opens match setup" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'New match' })).toBeOnTheScreen();
    expect(screen.getByHintText('Opens match setup')).toBeOnTheScreen();
  });
});

describe('IconButton', () => {
  it('is 44 × 44 with a required label', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<IconButton icon="undo-2" accessibilityLabel="Undo last ball" onPress={onPress} testID="score-btn-undo" />);
    const button = screen.getByRole('button', { name: 'Undo last ball' });
    const size = touchTargetSize(button);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('can show a caption and a disabled state', async () => {
    await renderWithTheme(<IconButton icon="redo-2" label="Redo" accessibilityLabel="Nothing to redo" onPress={jest.fn()} disabled />);
    const button = screen.getByRole('button', { name: 'Nothing to redo' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Redo')).toHaveStyle({ color: lightColors.textMuted });
    expect(touchTargetSize(button).height).toBeGreaterThanOrEqual(44);
  });

  it('exposes a selected state when given one', async () => {
    await renderWithTheme(<IconButton icon="check" accessibilityLabel="Selected" onPress={jest.fn()} selected />);
    expect(screen.getByRole('button', { name: 'Selected' })).toBeSelected();
  });
});

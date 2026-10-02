import '../../testing';
import { useState } from 'react';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { lightColors } from '../../theme';
import { REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, SegmentedControl, Stepper, Tabs, TextField, clampStep, fieldAccessibilityLabel } from '..';

describe('TextField', () => {
  function Controlled({ error }: { readonly error?: string }) {
    const [value, setValue] = useState('');
    return <TextField label="Team name" value={value} onChangeText={setValue} placeholder="e.g. Lions" error={error} testID="team-input-name" />;
  }

  it('labels the input and accepts typing', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<Controlled />);
    const input = screen.getByLabelText('Team name');
    await user.type(input, 'Tigers');
    expect(input).toHaveDisplayValue('Tigers');
    expect(screen.getByPlaceholderText('e.g. Lions')).toBeOnTheScreen();
  });

  it('shows the error message and includes it in the accessible name', async () => {
    await renderWithTheme(<Controlled error="Enter a team name" />);
    expect(screen.getByLabelText('Team name, Enter a team name')).toBeOnTheScreen();
    expect(screen.getByText('Enter a team name', { includeHiddenElements: true })).toHaveStyle({ color: lightColors.danger });
    expect(fieldAccessibilityLabel('Overs', null)).toBe('Overs');
  });

  it('shows helper text when there is no error', async () => {
    await renderWithTheme(<TextField label="Reason" value="" onChangeText={jest.fn()} helper="Required for completed matches" multiline />);
    expect(screen.getByText('Required for completed matches')).toHaveStyle({ color: lightColors.textMuted });
  });

  it('switches to the number pad and right alignment for numeric fields', async () => {
    await renderWithTheme(<TextField label="Overs" value="20" onChangeText={jest.fn()} numeric />);
    const input = screen.getByLabelText('Overs');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input).toHaveStyle({ textAlign: 'right', fontVariant: ['tabular-nums'] });
  });
});

describe('Stepper', () => {
  function Overs({ max = 50 }: { readonly max?: number }) {
    const [value, setValue] = useState(20);
    return <Stepper label="Overs" value={value} onChange={setValue} min={1} max={max} testID="overs" />;
  }

  it('is an adjustable control with its value in the label', async () => {
    await renderWithTheme(<Overs />);
    const adjustable = screen.getByRole('adjustable', { name: 'Overs, 20' });
    expect(adjustable).toHaveAccessibilityValue({ min: 1, max: 50, now: 20 });
  });

  it('increments and decrements with 44 × 44 buttons', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<Overs />);
    const plus = screen.getByRole('button', { name: 'Increase Overs' });
    const minus = screen.getByRole('button', { name: 'Decrease Overs' });
    expect(touchTargetSize(plus)).toEqual({ width: 44, height: 44 });
    expect(touchTargetSize(minus)).toEqual({ width: 44, height: 44 });
    await user.press(plus);
    await user.press(plus);
    await user.press(minus);
    expect(screen.getByRole('adjustable', { name: 'Overs, 21' })).toBeOnTheScreen();
  });

  it('disables the button at a bound', async () => {
    await renderWithTheme(<Stepper label="Legs" value={1} onChange={jest.fn()} min={1} max={2} />);
    expect(screen.getByRole('button', { name: 'Decrease Legs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase Legs' })).toBeEnabled();
  });

  it('responds to the screen reader increment and decrement actions', async () => {
    await renderWithTheme(<Overs />);
    const adjustable = screen.getByRole('adjustable');
    await fireEvent(adjustable, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByRole('adjustable', { name: 'Overs, 21' })).toBeOnTheScreen();
    await fireEvent(adjustable, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(adjustable, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByRole('adjustable', { name: 'Overs, 19' })).toBeOnTheScreen();
  });

  it('repeats on long press after 400 ms every 100 ms and stops on release', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<Overs />);
      const plus = screen.getByRole('button', { name: 'Increase Overs' });
      expect(REPEAT_DELAY_MS).toBe(400);
      await fireEvent(plus, 'longPress');
      await act(async () => {
        jest.advanceTimersByTime(REPEAT_INTERVAL_MS * 3);
      });
      await fireEvent(plus, 'pressOut');
      await act(async () => {
        jest.advanceTimersByTime(REPEAT_INTERVAL_MS * 5);
      });
      expect(screen.getByRole('adjustable', { name: 'Overs, 24' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens a numeric field when the value is tapped and clamps what is typed', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<Overs max={50} />);
    await user.press(screen.getByRole('button', { name: 'Type Overs' }));
    const input = screen.getByLabelText('Overs');
    await fireEvent.changeText(input, '75');
    await fireEvent(input, 'submitEditing');
    expect(screen.getByRole('adjustable', { name: 'Overs, 50' })).toBeOnTheScreen();
    expect(clampStep(-3, 0, 10)).toBe(0);
  });
});

describe('SegmentedControl', () => {
  function Theme() {
    const [value, setValue] = useState<'light' | 'dark' | 'system'>('system');
    return (
      <SegmentedControl
        accessibilityLabel="Theme"
        testID="settings-theme"
        value={value}
        onChange={setValue}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
      />
    );
  }

  it('is a radio group whose options expose their selection', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<Theme />);
    expect(screen.getByTestId('settings-theme')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByTestId('settings-theme')).toHaveProp('accessibilityLabel', 'Theme');
    expect(screen.getByRole('radio', { name: 'System' })).toBeSelected();
    await user.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeSelected();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('shows selection by weight and a raised segment, and a check icon with two options', async () => {
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Toss decision"
        value="bat"
        onChange={jest.fn()}
        options={[
          { value: 'bat', label: 'Bat' },
          { value: 'bowl', label: 'Bowl' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Bat' })).toHaveStyle({ backgroundColor: lightColors.surface, borderColor: lightColors.borderStrong });
    expect(screen.getByTestId('lucide-check')).toBeOnTheScreen();
    for (const name of ['Bat', 'Bowl']) {
      expect(touchTargetSize(screen.getByRole('radio', { name })).height).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('Tabs', () => {
  it('is a tab list with selected state and position hints', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <Tabs
        accessibilityLabel="Pools"
        testID="standings-tabs"
        selectedKey="a"
        onSelect={onSelect}
        tabs={[
          { key: 'a', label: 'Pool A', testID: 'standings-tab-a' },
          { key: 'b', label: 'Pool B', testID: 'standings-tab-b' },
        ]}
      />,
    );
    expect(screen.getByTestId('standings-tabs')).toHaveProp('accessibilityRole', 'tablist');
    const poolA = screen.getByRole('tab', { name: 'Pool A' });
    expect(poolA).toBeSelected();
    expect(poolA).toHaveProp('accessibilityHint', '1 of 2');
    expect(touchTargetSize(poolA).height).toBeGreaterThanOrEqual(44);
    await user.press(screen.getByRole('tab', { name: 'Pool B' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

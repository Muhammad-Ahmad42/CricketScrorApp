import '../../testing';
import { createRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { lightColors, lightGlass } from '../../theme';
import { REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, SEGMENT_SELECTED_BORDER, SegmentedControl, Stepper, Tabs, TextField, clampStep, fieldAccessibilityLabel, revealOffset, rowOverflow } from '..';

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

  it('hands its input to a ref so a form can move focus back to it, and can hide the visible label while keeping the accessible name', async () => {
    const ref = createRef<TextInput>();
    await renderWithTheme(<TextField ref={ref} label="Player name" hideLabel value="" onChangeText={() => undefined} testID="field" />);
    expect(ref.current).not.toBeNull();
    expect(screen.getByLabelText('Player name')).toBeOnTheScreen();
    expect(screen.queryByText('Player name', { includeHiddenElements: true })).toBeNull();
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

  it('switches to the number pad for numeric fields and keeps them start-aligned like every form field', async () => {
    await renderWithTheme(<TextField label="Overs" value="20" onChangeText={jest.fn()} numeric />);
    const input = screen.getByLabelText('Overs');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input).toHaveStyle({ fontVariant: ['tabular-nums'] });
    expect(input).not.toHaveStyle({ textAlign: 'right' });
  });

  it('uses the decimal pad for decimal fields', async () => {
    await renderWithTheme(<TextField label="Net run rate" value="1.25" onChangeText={jest.fn()} numeric="decimal" />);
    expect(screen.getByLabelText('Net run rate').props.keyboardType).toBe('decimal-pad');
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

  it('shows selection by a filled lens, an accent outline, weight and a check icon, with two options', async () => {
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
    expect(screen.getByRole('radio', { name: 'Bat' })).toHaveStyle({
      backgroundColor: lightGlass.selection,
      borderColor: lightGlass.ink.accent,
      borderWidth: SEGMENT_SELECTED_BORDER,
    });
    expect(screen.getByRole('radio', { name: 'Bat' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bowl' })).not.toBeChecked();
    expect(screen.getByTestId('lucide-check')).toBeOnTheScreen();
    for (const name of ['Bat', 'Bowl']) {
      expect(touchTargetSize(screen.getByRole('radio', { name })).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('shows the check for three or more options too, and sizes segments to their labels so none is cut', async () => {
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Status"
        value="done"
        onChange={jest.fn()}
        options={[
          { value: 'all', label: 'All' },
          { value: 'live', label: 'Live' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'done', label: 'Completed' },
        ]}
      />,
    );
    expect(screen.getAllByTestId('lucide-check')).toHaveLength(1);
    const done = screen.getByRole('radio', { name: 'Completed' });
    expect(done).toHaveStyle({ flexGrow: 1, flexShrink: 1, flexBasis: 'auto' });
    expect(done).toBeChecked();
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
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

describe('Stepper caption (#6)', () => {
  it('shows its label as a visible caption next to the controls, hidden from the reader because the control already names it', async () => {
    await renderWithTheme(<Stepper label="Qualifiers from each pool" caption="Top teams go through" value={2} onChange={jest.fn()} min={1} max={8} testID="qualifiers" />);
    const caption = screen.getByTestId('qualifiers-label', { includeHiddenElements: true });
    expect(caption).toHaveTextContent('Qualifiers from each pool');
    expect(screen.getByText('Top teams go through', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Qualifiers from each pool')).toBeNull();
    expect(screen.getByRole('adjustable', { name: 'Qualifiers from each pool, 2' })).toBeOnTheScreen();
  });

  it('can hide the caption where the screen already labels the stepper', async () => {
    await renderWithTheme(<Stepper label="Overs" hideLabel value={20} onChange={jest.fn()} testID="overs" />);
    expect(screen.queryByTestId('overs-label', { includeHiddenElements: true })).toBeNull();
  });

  it('draws a disabled step button as an outline, never a filled block that looks more pressable than the enabled one', async () => {
    await renderWithTheme(<Stepper label="Overs" value={1} onChange={jest.fn()} min={1} max={5} testID="overs" />);
    expect(screen.getByTestId('overs-decrement')).toHaveStyle({ backgroundColor: 'transparent', borderColor: lightColors.border });
    expect(screen.getByTestId('overs-increment')).toHaveStyle({ backgroundColor: 'transparent', borderColor: lightColors.borderStrong });
  });
});

describe('TextField in a narrow column', () => {
  it('lets the input shrink below its intrinsic width so two fields fit side by side', async () => {
    await renderWithTheme(<TextField label="Players per side" value="8" onChangeText={jest.fn()} numeric testID="players" />);
    expect(screen.getByTestId('players')).toHaveStyle({ minWidth: 0, flex: 1 });
  });
});

describe('Tabs that overflow', () => {
  it('marks only the selected tab as selected', async () => {
    await renderWithTheme(
      <Tabs
        accessibilityLabel="Status"
        selectedKey="cancelled"
        onSelect={jest.fn()}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'scheduled', label: 'Scheduled' },
          { key: 'live', label: 'Live' },
          { key: 'completed', label: 'Completed' },
          { key: 'postponed', label: 'Postponed' },
          { key: 'cancelled', label: 'Cancelled' },
        ]}
      />,
    );
    const tab = screen.getByRole('tab', { name: 'Cancelled' });
    expect(tab).toBeSelected();
    expect(screen.getByRole('tab', { name: 'All' })).not.toBeSelected();
  });

  it('knows when there is more to either side and how far to scroll to reveal the selected tab', () => {
    expect(rowOverflow(0, 300, 290)).toEqual({ start: false, end: false });
    expect(rowOverflow(0, 300, 600)).toEqual({ start: false, end: true });
    expect(rowOverflow(150, 300, 600)).toEqual({ start: true, end: true });
    expect(rowOverflow(300, 300, 600)).toEqual({ start: true, end: false });
    expect(revealOffset({ x: 500, width: 80 }, 0, 300, 600)).toBe(300);
    expect(revealOffset({ x: 100, width: 60 }, 0, 300, 600)).toBeNull();
    expect(revealOffset({ x: 40, width: 60 }, 200, 300, 600)).toBe(12);
  });
});

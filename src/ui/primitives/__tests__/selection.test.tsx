import '../../testing';
import { useState } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { GlassSurface } from '../../glass';
import { Text } from '../../typography';
import { contrastRatio, createTheme, darkColors, darkGlass, lightColors, lightGlass } from '../../theme';
import {
  Button,
  Chip,
  ChipGroup,
  ChoiceList,
  ListRow,
  Monogram,
  MONOGRAM_MIN_WIDTH,
  OptionTile,
  SHEET_MAX_WIDTH,
  SIDE_SHEET_WIDTH,
  Sheet,
  Table,
  focusIsVisible,
  inputModality,
  sheetPresentation,
  shouldSplitTable,
  switchColors,
  tableMinWidth,
  toggleValue,
  type TableColumn,
} from '..';
import { InputModalityRoot } from '../../shell';
import { KEYBOARD_FOCUS_RUN, noteKeyboard, noteNativeFocus, notePointer, noteTouchStart, trackInputModality } from '../internal/interaction';

type Outcome = 'win' | 'tie' | 'nr';

function SingleList() {
  const [value, setValue] = useState<Outcome | null>('tie');
  return (
    <ChoiceList
      accessibilityLabel="Result"
      value={value}
      onChange={setValue}
      choices={[
        { value: 'win', label: 'Win', testID: 'choice-win' },
        { value: 'tie', label: 'Tie', testID: 'choice-tie' },
        { value: 'nr', label: 'No result', description: 'Both sides get a point', testID: 'choice-nr' },
      ]}
    />
  );
}

describe('ChoiceList (#20)', () => {
  it('renders a single choice as a radio group with radios, a checked state and a filled dot, never a checkbox', async () => {
    const user = userEvent.setup();
    const view = await renderWithTheme(<SingleList />);
    expect(view.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'Result').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'Tie' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Win' })).not.toBeChecked();
    expect(screen.getByTestId('choice-tie-mark', { includeHiddenElements: true })).toHaveStyle({ borderRadius: 22, borderColor: lightColors.accent });
    await user.press(screen.getByRole('radio', { name: 'No result. Both sides get a point' }));
    expect(screen.getByRole('radio', { name: 'No result. Both sides get a point' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tie' })).not.toBeChecked();
    for (const radio of screen.getAllByRole('radio')) {
      expect(touchTargetSize(radio).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('keeps checkboxes for multi-select lists, in option order', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <ChoiceList
        mode="multi"
        accessibilityLabel="Venues"
        values={['b']}
        onChange={onChange}
        choices={[
          { value: 'a', label: 'Riverside Oval' },
          { value: 'b', label: 'Harbour Park' },
        ]}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Harbour Park' })).toBeChecked();
    await user.press(screen.getByRole('checkbox', { name: 'Riverside Oval' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a', ['a', 'b'])).toEqual(['b']);
  });
});

describe('Chip, ChipGroup and OptionTile (#20, §78)', () => {
  it('shows a selected chip with a check, heavier weight and a 2 pt accent outline, not by colour alone', async () => {
    await renderWithTheme(
      <ChipGroup
        accessibilityLabel="Format"
        value="t20"
        onChange={jest.fn()}
        options={[
          { value: 't10', label: 'T10' },
          { value: 't20', label: 'T20' },
        ]}
      />,
    );
    const selected = screen.getByRole('radio', { name: 'T20' });
    const other = screen.getByRole('radio', { name: 'T10' });
    expect(selected).toBeChecked();
    expect(other).not.toBeChecked();
    expect(selected).toHaveStyle({ borderWidth: 2, borderColor: lightColors.accent, backgroundColor: lightColors.accentSubtle });
    expect(other).toHaveStyle({ borderWidth: 1, borderColor: lightColors.borderStrong });
    expect(screen.getAllByTestId('lucide-check')).toHaveLength(1);
    expect(screen.getByText('T20')).toHaveStyle({ fontFamily: expect.stringMatching(/600SemiBold$/) });
    expect(screen.getByText('T10')).toHaveStyle({ fontFamily: expect.stringMatching(/500Medium$/) });
    expect(touchTargetSize(other).height).toBeGreaterThanOrEqual(44);
  });

  it('marks an option tile with a selection mark instead of the word SELECTED', async () => {
    await renderWithTheme(<OptionTile title="Bat first" description="Tigers bat" selected onPress={jest.fn()} testID="tile" />, { mode: 'dark' });
    const tile = screen.getByRole('radio', { name: 'Bat first. Tigers bat' });
    expect(tile).toBeChecked();
    expect(tile).toHaveStyle({ borderColor: darkColors.accent, borderWidth: 2 });
    expect(screen.queryByText(/selected/i)).toBeNull();
    expect(screen.getByTestId('tile-mark', { includeHiddenElements: true })).toBeTruthy();
  });

  it('lets a standalone chip work as a checkbox', async () => {
    await renderWithTheme(<Chip kind="checkbox" label="Powerplay" selected={false} onPress={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Powerplay' })).not.toBeChecked();
  });
});

describe('focus rings follow the input, not every focus event', () => {
  afterEach(() => {
    noteKeyboard();
  });

  it('natively hides the ring for a focus restored after a touch, and shows it again once focus moves on by keyboard', () => {
    noteKeyboard();
    expect(focusIsVisible()).toBe(true);
    expect(noteTouchStart()).toBe(false);
    expect(inputModality()).toBe('pointer');
    noteNativeFocus('android');
    expect(focusIsVisible()).toBe(false);
    noteTouchStart();
    noteNativeFocus('android');
    expect(focusIsVisible()).toBe(false);
    for (let step = 1; step < KEYBOARD_FOCUS_RUN; step += 1) {
      noteNativeFocus('android');
    }
    expect(inputModality()).toBe('keyboard');
    expect(focusIsVisible()).toBe(true);
  });

  it('on web shows the ring after keyboard navigation and hides it after a pointer press', () => {
    noteKeyboard();
    expect(inputModality()).toBe('keyboard');
    expect(focusIsVisible()).toBe(true);
    notePointer();
    expect(inputModality()).toBe('pointer');
    noteNativeFocus('web');
    noteNativeFocus('web');
    expect(focusIsVisible()).toBe(false);
  });

  it('keeps no ring on a touch-device row whose focus comes back after a sheet closes (Android)', async () => {
    noteKeyboard();
    await renderWithTheme(
      <InputModalityRoot>
        <ListRow title="Team A" trailing={{ kind: 'chevron' }} onPress={jest.fn()} />
      </InputModalityRoot>,
    );
    const root = screen.getByTestId('input-modality-root');
    expect(root.props.onStartShouldSetResponderCapture()).toBe(false);
    expect(inputModality()).toBe('pointer');
    await fireEvent(screen.getByRole('button', { name: 'Team A' }), 'focus');
    expect(screen.getByRole('button', { name: 'Team A' })).not.toHaveStyle({ outlineColor: lightColors.focusRing });
  });

  it('listens on the document in the capture phase for keys and pointers, once', () => {
    const listeners: Record<string, (event: { key?: string; metaKey?: boolean }) => void> = {};
    const target = { addEventListener: jest.fn((type: string, listener: (event: { key?: string }) => void) => { listeners[type] = listener; }) };
    const installed = trackInputModality(target);
    expect(installed).toBe(true);
    expect(target.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(target.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    listeners.pointerdown?.({});
    expect(inputModality()).toBe('pointer');
    listeners.keydown?.({ key: 'a' });
    expect(inputModality()).toBe('pointer');
    listeners.keydown?.({ key: 'Tab' });
    expect(inputModality()).toBe('keyboard');
    listeners.mousedown?.({});
    listeners.keydown?.({ key: 'Tab', metaKey: true });
    expect(inputModality()).toBe('pointer');
    expect(trackInputModality(target)).toBe(true);
    expect(target.addEventListener).toHaveBeenCalledTimes(4);
  });

  it('drops a ring that is showing as soon as the pointer is used', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      noteKeyboard();
      await renderWithTheme(<Button label="Regenerate" onPress={jest.fn()} />);
      const button = screen.getByRole('button', { name: 'Regenerate' });
      await fireEvent(button, 'focus');
      expect(screen.getByRole('button', { name: 'Regenerate' })).toHaveStyle({ outlineColor: lightColors.focusRing });
      await act(async () => {
        notePointer();
      });
      expect(screen.getByRole('button', { name: 'Regenerate' })).not.toHaveStyle({ outlineColor: lightColors.focusRing });
      await fireEvent(screen.getByRole('button', { name: 'Regenerate' }), 'focus');
      expect(screen.getByRole('button', { name: 'Regenerate' })).not.toHaveStyle({ outlineColor: lightColors.focusRing });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      noteKeyboard();
    }
  });
});

describe('Switch theming', () => {
  it.each(['light', 'dark'] as const)('uses palette colours with a knob at 3:1 or more against its track in %s, never the Material teal', (scheme) => {
    const theme = createTheme(scheme);
    const colors = switchColors(theme);
    expect(contrastRatio(colors.thumbOn, colors.trackOn)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.thumbOff, colors.trackOff)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.trackOn, theme.color.surface)).toBeGreaterThanOrEqual(3);
    expect(Object.values(colors).map((c) => c.toUpperCase())).not.toContain('#009688');
  });

  it.each(['light', 'dark'] as const)('keeps a disabled switch readable in %s: the knob stays at 3:1 on a muted on-track, and on reads apart from off', (scheme) => {
    const theme = createTheme(scheme);
    const colors = switchColors(theme);
    expect(contrastRatio(colors.thumbDisabledOn, colors.trackDisabledOn)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.thumbDisabled, colors.trackDisabled)).toBeGreaterThanOrEqual(1.8);
    expect(colors.trackDisabledOn).not.toBe(colors.trackDisabled);
    expect(colors.trackDisabledOn).not.toBe(colors.trackOn);
  });

  it('passes the thumb and track colours to the platform switch, web included', async () => {
    const view = await renderWithTheme(<ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange: jest.fn() }} />, { mode: 'dark' });
    expect(screen.getByRole('switch', { name: 'Vibration' })).toBeChecked();
    const host = view.container.queryAll((node) => node.props.trackColor !== undefined || node.props.onTintColor !== undefined)[0];
    const colors = switchColors(createTheme('dark'));
    expect(host.props.thumbTintColor ?? host.props.thumbColor).toBe(colors.thumbOn);
    expect(host.props.onTintColor ?? host.props.trackColor?.true).toBe(colors.trackOn);
    expect(host.props.tintColor ?? host.props.trackColor?.false).toBe(darkColors.borderStrong);
  });
});

describe('team monogram', () => {
  it('grows with three-letter codes instead of overflowing, on an accent tint rather than a near-black hole', async () => {
    await renderWithTheme(<Monogram text="WFW" testID="mono" />, { mode: 'dark' });
    const badge = screen.getByTestId('mono', { includeHiddenElements: true });
    expect(badge).toHaveStyle({ minWidth: MONOGRAM_MIN_WIDTH, backgroundColor: darkColors.accentSubtle });
    expect(badge).not.toHaveStyle({ width: 32 });
    expect(screen.getByText('WFW', { includeHiddenElements: true })).toHaveStyle({ color: darkColors.accent, fontFamily: expect.stringMatching(/^BarlowCondensed/) });
  });
});

interface Row {
  readonly name: string;
  readonly runs: string;
}

const COLUMNS: readonly TableColumn<Row>[] = [
  { key: 'name', header: 'Batter', kind: 'name', value: (row) => row.name },
  { key: 'r', header: 'R', kind: 'numeric', width: 40, value: (row) => row.runs },
  { key: 'b', header: 'B', kind: 'numeric', width: 40, value: () => '30' },
  { key: '4s', header: '4s', kind: 'numeric', value: () => '4' },
  { key: '6s', header: '6s', kind: 'numeric', value: () => '1' },
  { key: 'sr', header: 'SR', kind: 'numeric', width: 56, value: () => '140.0' },
];

describe('Table column sizing and overflow', () => {
  it('packs numeric columns tightly and works out the width the columns need', () => {
    expect(tableMinWidth(COLUMNS)).toBe(16 * 2 + 120 + 8 + 40 + 4 + 40 + 4 + 32 + 4 + 32 + 4 + 56);
    expect(shouldSplitTable('auto', COLUMNS, 390)).toBe(false);
    expect(shouldSplitTable('auto', COLUMNS, 320)).toBe(true);
    expect(shouldSplitTable('auto', COLUMNS, 0)).toBe(false);
    expect(shouldSplitTable(true, COLUMNS, 0)).toBe(true);
    expect(shouldSplitTable(false, COLUMNS, 200)).toBe(false);
  });

  it('pins the name column and scrolls the numbers sideways when they do not fit, with an edge hint', async () => {
    await renderWithTheme(
      <Table columns={COLUMNS} rows={[{ name: 'Rizwan', runs: '42' }]} rowKey={(row) => row.name} rowAccessibilityLabel={(row) => `${row.name} ${row.runs}`} testID="batting" />,
    );
    const table = screen.getByTestId('batting');
    expect(screen.queryByTestId('batting-scroll')).toBeNull();
    await fireEvent(table, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 100 } } });
    const scroller = screen.getByTestId('batting-scroll');
    await fireEvent(scroller, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 100 } } });
    await fireEvent(scroller, 'contentSizeChange', 260, 100);
    expect(screen.getByTestId('batting-scroll-more-end', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Rizwan 42')).toBeOnTheScreen();
    expect(scroller).toHaveStyle({ flexShrink: 1, minWidth: 0 });
  });
});

describe('Sheet presentation on tablets (#19)', () => {
  it('stays a bottom sheet on phones, floats as a constrained card on portrait tablets and becomes a side sheet in landscape', () => {
    expect(sheetPresentation(390, 844)).toBe('bottom');
    expect(sheetPresentation(820, 1180)).toBe('floating');
    expect(sheetPresentation(1024, 768)).toBe('side');
    expect(sheetPresentation(700, 1000)).toBe('floating');
    expect(SHEET_MAX_WIDTH).toBeLessThanOrEqual(600);
  });

  it.each([
    [820, 1180, 'floating'],
    [1024, 768, 'side'],
    [390, 844, 'bottom'],
  ] as const)('lays the sheet out for a %d × %d window as %s', async (width, height, kind) => {
    const dimensions = jest.requireActual<{ default: () => unknown }>('react-native/Libraries/Utilities/useWindowDimensions');
    const spy = jest.spyOn(dimensions, 'default').mockReturnValue({ width, height, scale: 2, fontScale: 1 });
    try {
      await renderWithTheme(
        <Sheet visible title="Wicket" onClose={jest.fn()} testID="sheet">
          <RNText>Bowled</RNText>
        </Sheet>,
      );
      const sheet = screen.getByTestId('sheet');
      if (kind === 'bottom') {
        expect(sheet).toHaveStyle({ borderTopLeftRadius: 24 });
        expect(sheet).not.toHaveStyle({ maxWidth: SHEET_MAX_WIDTH });
      } else if (kind === 'floating') {
        expect(sheet).toHaveStyle({ maxWidth: SHEET_MAX_WIDTH, borderRadius: 24, alignSelf: 'center' });
      } else {
        expect(sheet).toHaveStyle({ width: SIDE_SHEET_WIDTH, borderRadius: 24 });
      }
    } finally {
      spy.mockRestore();
    }
  });
});

describe('glass inks', () => {
  it('re-inks secondary, muted and accent text inside short-text glass, and leaves sheets and plain content alone', async () => {
    await renderWithTheme(
      <View>
        <GlassSurface level="bar" testID="bar">
          <Text tone="secondary">On the bar</Text>
          <Text tone="muted">Muted on the bar</Text>
          <Text tone="accent">Accent on the bar</Text>
          <Text>Primary on the bar</Text>
        </GlassSurface>
        <GlassSurface level="sheet">
          <Text tone="secondary">In a sheet</Text>
        </GlassSurface>
        <Text tone="secondary">On the page</Text>
      </View>,
    );
    expect(screen.getByText('On the bar')).toHaveStyle({ color: lightGlass.ink.secondary });
    expect(screen.getByText('Muted on the bar')).toHaveStyle({ color: lightGlass.ink.secondary });
    expect(screen.getByText('Accent on the bar')).toHaveStyle({ color: lightGlass.ink.accent });
    expect(screen.getByText('Primary on the bar')).toHaveStyle({ color: lightColors.textPrimary });
    expect(screen.getByText('In a sheet')).toHaveStyle({ color: lightColors.textSecondary });
    expect(screen.getByText('On the page')).toHaveStyle({ color: lightColors.textSecondary });
  });

  it('uses the brighter dark glass ink in dark', async () => {
    await renderWithTheme(
      <GlassSurface level="dock">
        <Text tone="secondary">Dock caption</Text>
      </GlassSurface>,
      { mode: 'dark' },
    );
    expect(screen.getByText('Dock caption')).toHaveStyle({ color: darkGlass.ink.secondary });
  });
});

describe('ListRow as a choice in a filter sheet (#20)', () => {
  it('shows the active choice with the same radio mark as ChoiceList and a heavier title, and exposes it as a checked radio', async () => {
    await renderWithTheme(
      <View>
        <ListRow title="All" selected onPress={jest.fn()} testID="status-all" />
        <ListRow title="Live" selected={false} onPress={jest.fn()} testID="status-live" />
      </View>,
    );
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Live' })).not.toBeChecked();
    expect(screen.queryAllByTestId('lucide-check')).toHaveLength(0);
    expect(screen.getByTestId('status-all-check', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('status-live-check', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('All')).toHaveStyle({ fontFamily: expect.stringMatching(/600SemiBold$/) });
    expect(screen.getByText('Live')).not.toHaveStyle({ fontFamily: expect.stringMatching(/600SemiBold$/) });
  });
});

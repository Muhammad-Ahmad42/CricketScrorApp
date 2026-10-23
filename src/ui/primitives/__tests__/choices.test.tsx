import '../../testing';
import { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize, withWindow } from '../../testing';
import { lightColors } from '../../theme';
import {
  ActionRow,
  ActionTile,
  CHIP_HEIGHT,
  CheckboxList,
  ChipGroup,
  ChoiceRow,
  ChoiceSheet,
  OptionTile,
  PressableArea,
  PressableCard,
  PressableRow,
  RadioList,
  chipBasis,
  pressableRole,
  type SheetChoice,
} from '..';

type Format = 't10' | 't20' | 'odi';

const FORMATS = [
  { value: 't10' as const, label: 'T10', testID: 'f-t10' },
  { value: 't20' as const, label: 'T20', testID: 'f-t20' },
  { value: 'odi' as const, label: 'ODI', testID: 'f-odi' },
];

describe('RadioList and CheckboxList', () => {
  it('is a radio group whose rows show a ring and dot, a checked state and a heavier label', async () => {
    function Harness() {
      const [value, setValue] = useState<Format | null>(null);
      return <RadioList accessibilityLabel="Format" value={value} onChange={setValue} choices={FORMATS} />;
    }
    const user = userEvent.setup();
    const view = await renderWithTheme(<Harness />);
    expect(view.container.queryAll((n) => n.props.accessibilityRole === 'radiogroup').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await user.press(screen.getByRole('radio', { name: 'T20' }));
    expect(screen.getByRole('radio', { name: 'T20' })).toBeChecked();
    expect(screen.getByTestId('f-t20-mark', { includeHiddenElements: true })).toHaveStyle({ borderColor: lightColors.accent });
    expect(screen.getByText('T20')).toHaveStyle({ fontFamily: expect.stringMatching(/600SemiBold$/) });
    expect(screen.getByText('T10')).toHaveStyle({ fontFamily: expect.stringMatching(/400Regular$/) });
    for (const radio of screen.getAllByRole('radio')) {
      expect(touchTargetSize(radio).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('does not re-fire a change when the selected radio is pressed again', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<RadioList accessibilityLabel="Format" value="t20" onChange={onChange} choices={FORMATS} />);
    await user.press(screen.getByRole('radio', { name: 'T20' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a list of checkboxes for multi choice', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<CheckboxList accessibilityLabel="Formats" values={['odi']} onChange={onChange} choices={FORMATS} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await user.press(screen.getByRole('checkbox', { name: 'T10' }));
    expect(onChange).toHaveBeenCalledWith(['t10', 'odi']);
  });

  it('marks a risky option with an icon and danger text, not colour alone', async () => {
    await renderWithTheme(
      <RadioList
        accessibilityLabel="Delete"
        value="keep"
        onChange={jest.fn()}
        choices={[
          { value: 'keep', label: 'Keep matches' },
          { value: 'wipe', label: 'Delete matches', description: 'Cannot be undone', tone: 'danger' },
        ]}
      />,
    );
    expect(screen.getByText('Cannot be undone')).toHaveStyle({ color: lightColors.danger });
    expect(screen.getByTestId('lucide-triangle-alert')).toBeTruthy();
  });
});

describe('ChoiceRow', () => {
  it('carries a lead number, a meta tag and trailing controls outside its own target', async () => {
    const onPress = jest.fn();
    const onUp = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <ChoiceRow
        kind="checkbox"
        label="Babar Azam"
        lead="3"
        meta="C, WK"
        selected
        onPress={onPress}
        trailing={
          <PressableArea accessibilityLabel="Move up" onPress={onUp} testID="up">
            <RNText>Up</RNText>
          </PressableArea>
        }
        testID="squad"
      />,
    );
    const row = screen.getByRole('checkbox', { name: 'Babar Azam, C, WK' });
    expect(row).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Move up' }));
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    await user.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Chip and ChipGroup', () => {
  it('makes every chip a real 44 pt target with check, fill and weight when selected', async () => {
    await renderWithTheme(<ChipGroup accessibilityLabel="Format" value="t20" onChange={jest.fn()} options={FORMATS} />);
    const selected = screen.getByRole('radio', { name: 'T20' });
    expect(CHIP_HEIGHT).toBe(44);
    expect(selected).toHaveStyle({ minHeight: 44, backgroundColor: lightColors.accentSubtle, borderColor: lightColors.accent, borderWidth: 2 });
    expect(selected.props.hitSlop).toBeUndefined();
    for (const chip of screen.getAllByRole('radio')) {
      expect(touchTargetSize(chip).height).toBeGreaterThanOrEqual(44);
    }
  });

  it('lays chips out as an even grid when columns are given', async () => {
    expect(chipBasis(undefined)).toBeUndefined();
    expect(chipBasis(1)).toBeUndefined();
    expect(chipBasis(4)).toBe('21%');
    expect(chipBasis(3)).toBe('29%');
    await renderWithTheme(<ChipGroup accessibilityLabel="Overs" value={null} columns={3} onChange={jest.fn()} options={FORMATS} />);
    expect(screen.getByRole('radio', { name: 'T10' })).toHaveStyle({ flexBasis: '29%', flexGrow: 1 });
  });
});

describe('OptionTile', () => {
  it('works as a radio tile with a tag and a trailing value, and as a plain action tile', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <View>
        <OptionTile title="Shaheen Afridi" tag="Last over" value="3-0-21-1" selected onPress={onPress} testID="bowler" />
        <OptionTile title="Choose later" kind="action" onPress={onPress} testID="later" />
        <OptionTile title="Haris Rauf" description="Bowled 4" highlighted onPress={onPress} testID="suggested" />
      </View>,
    );
    const bowler = screen.getByRole('radio', { name: 'Shaheen Afridi. Last over. 3-0-21-1' });
    expect(bowler).toBeChecked();
    expect(bowler).toHaveStyle({ backgroundColor: lightColors.accentSubtle, borderWidth: 2 });
    const later = screen.getByRole('button', { name: 'Choose later' });
    expect(screen.queryByTestId('later-mark', { includeHiddenElements: true })).toBeNull();
    await user.press(later);
    expect(onPress).toHaveBeenCalledTimes(1);
    const suggested = screen.getByRole('radio', { name: 'Haris Rauf. Bowled 4' });
    expect(suggested).not.toBeChecked();
    expect(suggested).toHaveStyle({ borderColor: lightColors.accent, borderWidth: 2 });
    expect(suggested).not.toHaveStyle({ backgroundColor: lightColors.accentSubtle });
  });
});

describe('ChoiceSheet and ActionRow', () => {
  const choices = (onPress: jest.Mock): readonly SheetChoice[] => [
    { key: 'edit', title: 'Edit ball', icon: 'pencil-line', onPress },
    { key: 'share', title: 'Share', kind: 'action', icon: 'share', onPress },
    { key: 'delete', title: 'Delete match', destructive: true, kind: 'action', icon: 'trash-2', onPress },
  ];

  it('lists navigate and action rows, separates destructive ones and paints them danger', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<ChoiceSheet visible title="Match" choices={choices(onPress)} onClose={jest.fn()} testID="menu" />);
    expect(screen.getByRole('button', { name: 'Edit ball' })).toBeTruthy();
    expect(screen.getByTestId('menu-edit', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Delete match')).toHaveStyle({ color: lightColors.danger });
    expect(screen.getAllByTestId('lucide-chevron-right').length).toBe(1);
    await user.press(screen.getByRole('button', { name: 'Delete match' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows option rows as radios with the shared radio mark', async () => {
    await renderWithTheme(
      <View>
        <ActionRow choice={{ key: 'a', title: 'Batting first', kind: 'option', selected: true, onPress: jest.fn() }} testID="opt-a" />
        <ActionRow choice={{ key: 'b', title: 'Bowling first', kind: 'option', selected: false, onPress: jest.fn() }} testID="opt-b" />
      </View>,
    );
    expect(screen.getByRole('radio', { name: 'Batting first' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bowling first' })).not.toBeChecked();
    expect(screen.getByTestId('opt-a-mark', { includeHiddenElements: true })).toHaveStyle({ borderColor: lightColors.accent });
  });
});

describe('PressableRow, PressableCard, PressableArea and ActionTile', () => {
  it('chooses button or plain text by whether it can be pressed', () => {
    expect(pressableRole(undefined, 'link')).toBe('text');
    expect(pressableRole(jest.fn(), undefined)).toBe('button');
    expect(pressableRole(jest.fn(), 'tab')).toBe('tab');
  });

  it('renders a navigating row with the gutter, a separator, a chevron and an optional menu', async () => {
    const onPress = jest.fn();
    const onMenu = jest.fn();
    const user = userEvent.setup();
    await withWindow({ width: 390, height: 844, fontScale: 1 }, async () => {
      await renderWithTheme(
        <PressableRow accessibilityLabel="Tigers v Lions" accessibilityHint="Opens the scorecard" onPress={onPress} chevron menu={{ accessibilityLabel: 'Match actions', onPress: onMenu }} testID="row">
          <RNText>Tigers v Lions</RNText>
        </PressableRow>,
      );
      const row = screen.getByRole('button', { name: 'Tigers v Lions' });
      expect(row).toHaveStyle({ paddingLeft: 16, minHeight: 56 });
      expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(44);
      expect(screen.getByTestId('lucide-chevron-right')).toBeTruthy();
      await user.press(row);
      await user.press(screen.getByRole('button', { name: 'Match actions' }));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onMenu).toHaveBeenCalledTimes(1);
    });
  });

  it('reads a row without a handler as text and never as a disabled button', async () => {
    await renderWithTheme(
      <PressableRow accessibilityLabel="Over 3, 7 runs" testID="still">
        <RNText>Over 3</RNText>
      </PressableRow>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('still').props.accessibilityRole).toBe('text');
  });

  it('draws a card that shows selection with an accent outline and fill, and an area that dims when pressed', async () => {
    await renderWithTheme(
      <View>
        <PressableCard accessibilityLabel="Semi-final 1" onPress={jest.fn()} selected testID="card">
          <RNText>Semi-final 1</RNText>
        </PressableCard>
        <PressableArea accessibilityLabel="Score 142 for 3" onPress={jest.fn()} accessibilityActions={[{ name: 'activate' }]} testID="area">
          <RNText>142/3</RNText>
        </PressableArea>
      </View>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveStyle({ borderColor: lightColors.accent, backgroundColor: lightColors.accentSubtle, minHeight: 44 });
    expect(card).toBeSelected();
    expect(screen.getByTestId('area').props.accessibilityActions).toEqual([{ name: 'activate' }]);
  });

  it('gives quick-pick tiles a figure label, a caption and a 56 pt target', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<ActionTile label="1" caption="Wide + 1" accessibilityLabel="One wide" onPress={onPress} testID="tile" />);
    const tile = screen.getByRole('button', { name: 'One wide' });
    expect(tile).toHaveStyle({ minHeight: 56, flexBasis: '30%' });
    await user.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

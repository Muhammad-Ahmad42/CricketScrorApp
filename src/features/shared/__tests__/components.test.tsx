import '@/ui/testing';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { lightColors } from '@/ui';
import { renderWithTheme } from '@/ui/testing';
import {
  ChoiceList,
  ManualOverrideBadge,
  NavHeader,
  Notice,
  QualificationText,
  ReasonField,
  TypedNameConfirm,
  canConfirmTypedName,
  footprintText,
  joinList,
  ordinal,
  plural,
  qualificationSummary,
} from '..';

describe('text helpers', () => {
  it('formats ordinals, plurals and lists', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
    expect(plural(1, 'team')).toBe('1 team');
    expect(plural(3, 'match', 'matches')).toBe('3 matches');
    expect(joinList(['Lions'])).toBe('Lions');
    expect(joinList(['Lions', 'Tigers', 'Hawks'])).toBe('Lions, Tigers and Hawks');
  });
});

describe('ReasonField', () => {
  it('labels the field as required or optional', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<ReasonField required value="" onChange={onChange} />);
    expect(screen.getByLabelText('Reason (required)')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('input-reason'), 'Rain');
    expect(onChange).toHaveBeenCalledWith('Rain');
  });

  it('can be optional', async () => {
    await renderWithTheme(<ReasonField required={false} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Reason (optional)')).toBeOnTheScreen();
  });
});

describe('ManualOverrideBadge (§47)', () => {
  it('reads exactly "Manual Override" with the reason in text', async () => {
    await renderWithTheme(<ManualOverrideBadge reason="Pool washed out" testID="badge" />);
    expect(screen.getByTestId('badge')).toHaveTextContent('Manual Override');
    expect(screen.getByLabelText('Manual Override. Reason: Pool washed out')).toBeOnTheScreen();
  });
});

describe('QualificationText (§51)', () => {
  it('states the status in text, not colour alone', async () => {
    await renderWithTheme(
      <QualificationText state="qualified" certainty="mathematical" explanation="Tigers have mathematically qualified for the Semifinal." manual={false} detail="1 match left" testID="q" />,
    );
    expect(screen.getByTestId('q')).toHaveProp('accessibilityLabel', 'Qualified · Mathematical. 1 match left. Tigers have mathematically qualified for the Semifinal.');
    expect(screen.getByText('Qualified')).toBeOnTheScreen();
    expect(screen.getByText('Mathematical')).toBeOnTheScreen();
  });

  it('marks manual qualification as Manual Override', async () => {
    await renderWithTheme(<QualificationText state="qualified" certainty="manual" explanation="Qualified by the organizer." manual badgeTestID="b" />);
    expect(screen.getByTestId('b')).toHaveTextContent('Manual Override');
    expect(qualificationSummary('qualified', 'manual', true)).toBe('Qualified · Manual Override');
    expect(qualificationSummary('in_contention', 'provisional', false)).toBe('In contention');
  });
});

describe('TypedNameConfirm', () => {
  const footprint = { matches: 24, completedMatches: 18, events: 4210 };

  it('describes what will be lost', () => {
    expect(footprintText(footprint)).toBe('24 matches, 18 completed, 4210 balls will be deleted.');
    expect(canConfirmTypedName('City Cup', 'City Cup', footprint, false)).toBe(false);
    expect(canConfirmTypedName('City Cup', 'City Cup', footprint, true)).toBe(true);
    expect(canConfirmTypedName('City Cup', 'City cup', { ...footprint, completedMatches: 0 }, false)).toBe(false);
  });

  it('enables delete only with the typed name and the completed-matches opt-in', async () => {
    const onConfirm = jest.fn();
    await renderWithTheme(<TypedNameConfirm visible expected="City Cup" footprint={footprint} onCancel={jest.fn()} onConfirm={onConfirm} onBackup={jest.fn()} />);
    expect(screen.getByTestId('typed-btn-backup')).toBeOnTheScreen();
    expect(screen.getByTestId('typed-btn-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('typed-input-name'), 'City Cup');
    expect(screen.getByTestId('typed-btn-confirm')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('typed-toggle-completed'));
    expect(screen.getByTestId('typed-btn-confirm')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('typed-btn-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ typedName: 'City Cup', deleteCompletedMatches: true });
  });
});

describe('NavHeader, Notice and ChoiceList', () => {
  it('offers a labelled back button', async () => {
    const onBack = jest.fn();
    await renderWithTheme(<NavHeader title="Standings" onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('nav-btn-back'));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Standings' })).toBeOnTheScreen();
  });

  it('puts the notice text on its own test id with token colours', async () => {
    await renderWithTheme(<Notice tone="warning" message="Teams in different pools may play different numbers of matches." testID="n" />);
    expect(screen.getByTestId('n')).toHaveTextContent('Teams in different pools may play different numbers of matches.');
    let node = screen.getByTestId('n').parent;
    while (node && StyleSheet.flatten(node.props.style)?.backgroundColor === undefined) {
      node = node.parent;
    }
    expect(node).toHaveStyle({ backgroundColor: lightColors.warningSubtle });
  });

  it('exposes radio semantics and selection', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <ChoiceList
        choices={[
          { value: 'a', label: 'Alpha', testID: 'c-a' },
          { value: 'b', label: 'Beta', testID: 'c-b' },
        ]}
        value="a"
        onChange={onChange}
        accessibilityLabel="Pick"
      />,
    );
    expect(screen.getByTestId('c-a')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    await fireEvent.press(screen.getByTestId('c-b'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

import '../../testing';
import { Text as RNText } from 'react-native';
import { screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { lightColors } from '../../theme';
import { Banner, Disclosure, ExplainedText, HEADLINE_MAX, InlineNotice, SUPPORTING_MAX, WHY_LABEL, isScannable } from '..';

const WHY =
  'Riverside are level on points with Northside. The tournament breaks the tie on net run rate first, and Riverside lead it by 0.412 after the abandoned match was excluded.';

describe('scannable copy limits', () => {
  it('checks the headline and supporting-line budgets from CLAUDE.md Microcopy', () => {
    expect(HEADLINE_MAX).toBe(40);
    expect(SUPPORTING_MAX).toBe(80);
    expect(isScannable('Qualified on net run rate')).toEqual({ headline: true, supporting: true });
    expect(isScannable(WHY, null).headline).toBe(false);
    expect(isScannable('Needs 12 off 9', WHY).supporting).toBe(false);
  });
});

describe('Disclosure', () => {
  it('is a button with an expanded state that reveals its body in place', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <Disclosure label="Details" expandedLabel="Hide details" onToggle={onToggle} testID="d">
        <RNText>Long explanation</RNText>
      </Disclosure>,
    );
    const toggle = screen.getByRole('button', { name: 'Details' });
    expect(toggle).not.toBeExpanded();
    expect(screen.queryByText('Long explanation')).toBeNull();
    await user.press(toggle);
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeExpanded();
    expect(screen.getByText('Long explanation')).toBeOnTheScreen();
    expect(onToggle).toHaveBeenLastCalledWith(true);
  });

  it('can be controlled', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <Disclosure expanded={false} onToggle={onToggle}>
        <RNText>Hidden</RNText>
      </Disclosure>,
    );
    await user.press(screen.getByRole('button', { name: 'Details' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('ExplainedText', () => {
  it('shows a headline and one supporting line, with the long why behind "Why?"', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<ExplainedText headline="Riverside go through" supporting="Level on 6 points; ahead on NRR" detail={WHY} testID="x" />);
    expect(screen.getByText('Riverside go through')).toHaveStyle({ fontFamily: expect.stringMatching(/600SemiBold$/) });
    expect(screen.getByText('Level on 6 points; ahead on NRR')).toHaveStyle({ color: lightColors.textSecondary });
    expect(screen.queryByText(WHY)).toBeNull();
    await user.press(screen.getByRole('button', { name: WHY_LABEL }));
    expect(screen.getByText(WHY)).toBeOnTheScreen();
  });

  it('opens the why in a detail sheet for rows and tables', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<ExplainedText headline="Out of contention" detail={[WHY, 'Rules: points, then NRR.']} presentation="sheet" detailTitle="Why out" testID="row-why" />);
    expect(screen.queryByText(WHY)).toBeNull();
    await user.press(screen.getByRole('button', { name: WHY_LABEL }));
    expect(screen.getByRole('header', { name: 'Why out' })).toBeTruthy();
    expect(screen.getByText(WHY)).toBeTruthy();
    expect(screen.getByText('Rules: points, then NRR.')).toBeTruthy();
  });

  it('shows no disclosure when there is nothing more to say', async () => {
    await renderWithTheme(<ExplainedText headline="Saved" detail={['  ']} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('InlineNotice and Banner', () => {
  it('renders a compact notice: icon, headline, supporting line, why and an action', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <InlineNotice tone="warning" headline="2 slots unfilled" supporting="Add teams before the knockout" detail={WHY} action={{ label: 'Add teams', onPress }} testID="notice" />,
    );
    expect(screen.getByTestId('notice')).toHaveStyle({ backgroundColor: lightColors.warningSubtle, borderLeftColor: lightColors.warning });
    expect(screen.getByTestId('lucide-triangle-alert')).toBeTruthy();
    expect(screen.getByText('2 slots unfilled')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Add teams' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: WHY_LABEL })).toBeTruthy();
  });

  it('announces danger notices and banners as alerts', async () => {
    await renderWithTheme(<InlineNotice tone="danger" headline="Replay failed" testID="bad" />);
    expect(screen.getByTestId('bad').props.accessibilityRole).toBe('alert');
  });

  it('lets a banner keep its message as the headline and move the long text into a detail sheet', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<Banner tone="info" message="Abandoned match left out" detail={WHY} testID="banner" />);
    expect(screen.getByText('Abandoned match left out')).toBeTruthy();
    expect(screen.queryByText(WHY)).toBeNull();
    await user.press(screen.getByRole('button', { name: WHY_LABEL }));
    expect(screen.getByText(WHY)).toBeTruthy();
  });
});

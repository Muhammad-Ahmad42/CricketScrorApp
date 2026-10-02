import '@/ui/testing';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ImpactSummary } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { ImpactSheet, impactViewModel, type ImpactNames } from '..';

const NAMES: ImpactNames = {
  team: (teamId) => ({ HAW: 'Hawks', RHI: 'Rhinos', TIG: 'Tigers', LIO: 'Lions' })[teamId] ?? 'Team',
  pool: (poolId) => (poolId === null ? null : ({ pb: 'Pool B', pc: 'Pool C' })[poolId] ?? null),
  stage: () => 'Group Stage',
};

function impact(overrides: Partial<ImpactSummary> = {}): ImpactSummary {
  return {
    severity: 'warning',
    headline: 'Moving Pumas to Pool C changes 5 fixtures and the Pool B and C tables.',
    lines: ['2 completed matches stay as they are.'],
    fixtures: [
      { fixtureId: 'f8', label: 'M8 Pumas v Hawks (Pool B)', change: 'removed', hasMatchData: false },
      { fixtureId: 'f20', label: 'Pumas v Rhinos (Pool C)', change: 'created', hasMatchData: false },
      { fixtureId: 'f3', label: 'M3 Pumas v Owls', change: 'teams_changed', hasMatchData: true },
    ],
    standings: [
      { stageId: 's1', poolId: 'pb', teamId: 'HAW', before: { position: 2, points: 4, nrr: 0.21 }, after: { position: 1, points: 4, nrr: 0.54 } },
    ],
    qualification: [{ stageId: 's1', teamId: 'HAW', before: 'in_contention', after: 'qualified' }],
    slots: [{ slotId: 'a1', label: 'A1', beforeTeamId: 'TIG', afterTeamId: 'LIO', playedFixtureIds: ['sf1'] }],
    nrrChanged: true,
    completedMatchesAffected: 2,
    requiresConfirmation: true,
    requiresReason: false,
    blocked: null,
    ...overrides,
  };
}

describe('impactViewModel', () => {
  it('turns every section into plain text with arrows and glyphs', () => {
    const vm = impactViewModel(impact(), NAMES);
    expect(vm.fixtures.map((fixture) => `${fixture.glyph} ${fixture.change}`)).toEqual(['− removed', '+ created', '~ teams changed']);
    expect(vm.standings[0].text).toBe('Hawks · Pool B · 2nd → 1st · 4 pts · NRR +0.210 → +0.540');
    expect(vm.qualification[0].text).toBe('Hawks: In contention → Qualified (Group Stage)');
    expect(vm.slots[0]).toMatchObject({ text: 'A1: Tigers → Lions', note: 'Already played as Tigers. The result stands.', warn: true });
    expect(vm.severityNotice).toBe('2 completed matches are affected.');
    expect(vm.nrrText).toBe('Net run rate changes for the affected teams.');
  });

  it('falls back to neutral names when none are given', () => {
    const vm = impactViewModel(impact());
    expect(vm.standings[0].text).toMatch(/^A team · Group Stage|^A team · Stage/);
  });
});

describe('ImpactSheet (§34, §99)', () => {
  it('renders the headline, lines and every non-empty section', async () => {
    await renderWithTheme(<ImpactSheet impact={impact()} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} names={NAMES} />);
    expect(screen.getByRole('header', { name: 'What will change' })).toBeOnTheScreen();
    expect(screen.getByTestId('impact-text-headline')).toHaveTextContent(/Moving Pumas to Pool C/);
    expect(screen.getByText('2 completed matches stay as they are.')).toBeOnTheScreen();
    expect(screen.getByText('(has scores)')).toBeOnTheScreen();
    expect(screen.getByTestId('impact-text-standing-1')).toHaveTextContent(/^Hawks · Pool B · 2nd → 1st/);
    expect(screen.getByTestId('impact-text-qualification-1')).toHaveTextContent(/^Hawks: In contention → Qualified/);
    expect(screen.getByTestId('impact-text-slot-1')).toHaveTextContent(/^A1: Tigers → Lions/);
    expect(screen.getByTestId('impact-text-severity')).toHaveTextContent('2 completed matches are affected.');
  });

  it('applies only on Continue and passes no reason when none is needed', async () => {
    const onContinue = jest.fn();
    const onCancel = jest.fn();
    await renderWithTheme(<ImpactSheet impact={impact()} busy={false} onCancel={onCancel} onContinue={onContinue} names={NAMES} />);
    expect(onContinue).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    expect(onContinue).toHaveBeenCalledWith(null);
  });

  it('requires a reason before Continue when the impact says so', async () => {
    const onContinue = jest.fn();
    await renderWithTheme(<ImpactSheet impact={impact({ requiresReason: true })} busy={false} onCancel={jest.fn()} onContinue={onContinue} />);
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), '  Scorer error  ');
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    expect(onContinue).toHaveBeenCalledWith('Scorer error');
  });

  it('turns Continue into a destructive "Apply changes" for destructive changes', async () => {
    await renderWithTheme(<ImpactSheet impact={impact({ severity: 'destructive' })} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeOnTheScreen();
  });

  it('shows only Close and the reason when the change is blocked', async () => {
    const onCancel = jest.fn();
    await renderWithTheme(
      <ImpactSheet impact={impact({ blocked: { reason: 'This team has played matches. Withdraw it instead of removing it.' } })} busy={false} onCancel={onCancel} onContinue={jest.fn()} />,
    );
    expect(screen.getByTestId('impact-text-blocked')).toHaveTextContent(/Withdraw it instead/);
    expect(screen.queryByTestId('impact-btn-continue')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('impact-btn-close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows a conflict notice and keeps a prefilled reason', async () => {
    await renderWithTheme(
      <ImpactSheet impact={impact()} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} notice="The tournament changed while you were reviewing." reasonRequired initialReason="Rain" />,
    );
    expect(screen.getByTestId('impact-text-notice')).toHaveTextContent('The tournament changed while you were reviewing.');
    expect(screen.getByTestId('impact-input-reason')).toHaveProp('value', 'Rain');
  });

  it('renders nothing without an impact', async () => {
    await renderWithTheme(<ImpactSheet impact={null} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} />);
    expect(screen.queryByTestId('sheet-impact')).not.toBeOnTheScreen();
  });
});

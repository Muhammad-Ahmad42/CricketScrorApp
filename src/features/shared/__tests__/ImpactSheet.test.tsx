import '@/ui/testing';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ImpactSummary } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { ImpactSheet, REASON_HINT, impactDetailsLabel, impactViewModel, shortfallHeadline, type ImpactNames } from '..';

const SHORTFALL = 'Pool B would be left with 1 team, but “Top 2 from each pool” needs 2 teams there, so slot B2 in Knockouts could never be filled and SF1 could not be played.';

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
  it('turns every section into plain text with arrows and worded changes', () => {
    const vm = impactViewModel(impact(), NAMES);
    expect(vm.fixtures.map((fixture) => `${fixture.kind} ${fixture.change}`)).toEqual(['removed Removed', 'added New fixture', 'changed Teams change']);
    expect(vm.fixtures[2].note).toBe('Played · stays in the match history');
    expect(vm.standings[0].text).toBe('Hawks · Pool B · 2nd → 1st · 4 pts · NRR +0.210 → +0.540');
    expect(vm.qualification[0].text).toBe('Hawks: In contention → Qualified (Group Stage)');
    expect(vm.slots[0]).toMatchObject({ text: 'A1: Tigers → Lions', note: 'Already played as Tigers. The result stands.', warn: true });
    expect(vm.severityNotice).toBe('2 completed matches are affected.');
    expect(vm.nrrText).toBeNull();
  });

  it('prefers the domain sentences, names and key lines so nothing is said twice (#15)', () => {
    const vm = impactViewModel(
      impact({
        headline: 'This change affects 1 fixture, 1 of them completed.',
        lines: ['The result of Match 6 · Tigers v Eagles changes.', 'Net run rate changes for 2 teams.', 'Tigers stay 1st in Group Stage · Pool A.'],
        keyLines: ['The result of Match 6 · Tigers v Eagles changes.'],
        fixtures: [
          {
            fixtureId: 'f6',
            label: 'M6 Tigers v Eagles',
            change: 'result_changed',
            hasMatchData: true,
            changeText: 'Result changes',
            note: 'Completed match: points, net run rate and qualification are recalculated from the corrected scores.',
          },
        ],
        standings: [
          {
            stageId: 's1',
            poolId: 'pa',
            teamId: 'TIG',
            before: { position: 1, points: 2, nrr: 3.5 },
            after: { position: 1, points: 2, nrr: 2.5 },
            where: 'Group Stage · Pool A',
            text: 'Tigers stay 1st in Group Stage · Pool A; net run rate +3.500 → +2.500.',
          },
        ],
        qualification: [],
        slots: [],
        completedMatchesAffected: 1,
      }),
      { team: () => 'Team', pool: () => null, stage: () => 'Stage' },
    );
    expect(vm.lines).toEqual(['The result of Match 6 · Tigers v Eagles changes.']);
    expect(vm.standings[0].text).toBe('Tigers stay 1st in Group Stage · Pool A; net run rate +3.500 → +2.500.');
    expect(vm.standings[0].text).not.toMatch(/· Stage ·/);
    expect(vm.fixtures[0]).toMatchObject({ kind: 'changed', change: 'Result changes' });
    expect(vm.severityNotice).toBeNull();
    expect(vm.nrrText).toBeNull();
  });

  it('lists slot shortfalls separately and keeps them out of the key lines (#16)', () => {
    const vm = impactViewModel(
      impact({
        keyLines: [SHORTFALL],
        slotShortfalls: [
          { slotId: 'b2', label: 'B2', stageId: 'ko', stageName: 'Knockouts', sourceStageId: 's1', poolId: 'pb', poolName: 'Pool B', needed: 2, available: 1, fixtureLabels: ['SF1'], message: SHORTFALL },
        ],
      }),
      NAMES,
    );
    expect(vm.lines).toEqual([]);
    expect(vm.shortfalls).toEqual([{ key: 'b2', text: "B2 in Knockouts can't be filled", note: null, warn: true, detail: SHORTFALL }]);
    expect(shortfallHeadline({ slotId: 'b2', label: 'B2', stageId: 'ko', stageName: 'Knockouts', sourceStageId: 's1', poolId: 'pb', poolName: 'Pool B', needed: 2, available: 1, fixtureLabels: ['SF1'], message: SHORTFALL }).length).toBeLessThanOrEqual(40);
  });

  it('falls back to neutral names when none are given', () => {
    const vm = impactViewModel(impact());
    expect(vm.standings[0].text).toMatch(/^A team · Group Stage|^A team · Stage/);
  });
});

describe('ImpactSheet (§34, §99)', () => {
  it('leads with the headline and key lines and keeps each section behind Details', async () => {
    await renderWithTheme(<ImpactSheet impact={impact()} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} names={NAMES} />);
    expect(screen.getByRole('header', { name: 'What will change' })).toBeOnTheScreen();
    expect(screen.getByTestId('impact-text-headline')).toHaveTextContent(/Moving Pumas to Pool C/);
    expect(screen.getByText('2 completed matches stay as they are.')).toBeOnTheScreen();
    expect(screen.queryByText('(has scores)')).not.toBeOnTheScreen();
    expect(screen.getByTestId('impact-text-severity')).toHaveTextContent('2 completed matches are affected.');
    expect(screen.queryByTestId('impact-row-1')).not.toBeOnTheScreen();
    expect(screen.getByTestId('impact-btn-details')).toHaveTextContent(/^Details$/);
    await fireEvent.press(screen.getByTestId('impact-btn-details'));
    expect(screen.getByTestId('impact-row-3')).toHaveTextContent(/Teams change/);
    expect(screen.getByTestId('impact-row-3')).toHaveTextContent(/Played · stays in the match history/);
    expect(screen.getByTestId('impact-text-standing-1')).toHaveTextContent(/^Hawks · Pool B · 2nd → 1st/);
    expect(screen.getByTestId('impact-text-qualification-1')).toHaveTextContent(/^Hawks: In contention → Qualified/);
    expect(screen.getByTestId('impact-text-slot-1')).toHaveTextContent(/^A1: Tigers → Lions/);
  });

  it('labels Details without repeating the counts the headline already gives (Android QA wave 4)', () => {
    expect(impactDetailsLabel(impactViewModel(impact({ standings: [], qualification: [], slots: [] }), NAMES))).toBe('Details');
    expect(impactDetailsLabel(impactViewModel(impact({ fixtures: [], slots: [] }), NAMES))).toBe('Details');
  });

  it('collapses a lone result change into the headline instead of repeating it (Android QA wave 4)', () => {
    const vm = impactViewModel(
      impact({
        headline: '1 fixture affected, 1 completed',
        keyItems: [{ headline: 'Match 1 result changes', detail: 'Northside Strikers v Westside Warriors.' }],
        fixtures: [{ fixtureId: 'f1', label: 'Match 1 · Northside Strikers v Westside Warriors', change: 'result_changed', hasMatchData: true }],
        completedMatchesAffected: 1,
      }),
      NAMES,
    );
    expect(vm.headline).toBe('Match 1 result changes');
    expect(vm.keyItems).toEqual([]);
    expect(vm.severityNotice).toBeNull();
    expect(vm.fixtures).toHaveLength(1);
  });

  it('keeps the key items when more than one thing changes', () => {
    const vm = impactViewModel(
      impact({
        headline: '1 fixture affected, 1 completed',
        keyItems: [{ headline: 'Match 1 result changes' }, { headline: 'New champion: Lions', detail: 'Was Tigers.' }],
        fixtures: [{ fixtureId: 'f1', label: 'Match 1 · Lions v Tigers', change: 'result_changed', hasMatchData: true }],
      }),
      NAMES,
    );
    expect(vm.headline).toBe('1 fixture affected, 1 completed');
    expect(vm.keyItems.map((item) => item.headline)).toEqual(['Match 1 result changes', 'New champion: Lions']);
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

  it('shows an unfillable knockout slot as a warning next to Continue (#16)', async () => {
    await renderWithTheme(
      <ImpactSheet
        impact={impact({
          keyLines: [SHORTFALL],
          slotShortfalls: [
            { slotId: 'b2', label: 'B2', stageId: 'ko', stageName: 'Knockouts', sourceStageId: 's1', poolId: 'pb', poolName: 'Pool B', needed: 2, available: 1, fixtureLabels: ['SF1'], message: SHORTFALL },
          ],
        })}
        busy={false}
        onCancel={jest.fn()}
        onContinue={jest.fn()}
        names={NAMES}
      />,
    );
    expect(screen.getByTestId('impact-text-shortfall-1-text-headline')).toHaveTextContent("B2 in Knockouts can't be filled");
    expect(screen.queryByText(SHORTFALL)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('impact-text-shortfall-1-text-why'));
    expect(screen.getAllByText(SHORTFALL)).toHaveLength(1);
  });

  it('shows one reason hint, under the field, and keeps the button hint for screen readers (Android QA wave 4)', async () => {
    await renderWithTheme(<ImpactSheet impact={impact({ requiresReason: true })} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} />);
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    expect(screen.getAllByText('At least 3 characters')).toHaveLength(1);
    expect(screen.queryByText(REASON_HINT)).not.toBeOnTheScreen();
    expect(screen.getByTestId('impact-btn-continue')).toHaveProp('accessibilityHint', REASON_HINT);
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), 'Scorer error');
    expect(screen.getByTestId('impact-btn-continue')).not.toBeDisabled();
  });

  it('renders nothing without an impact', async () => {
    await renderWithTheme(<ImpactSheet impact={null} busy={false} onCancel={jest.fn()} onContinue={jest.fn()} />);
    expect(screen.queryByTestId('sheet-impact')).not.toBeOnTheScreen();
  });
});

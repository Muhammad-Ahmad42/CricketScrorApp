import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { TournamentSnapshot } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FixtureDetailScreen } from '../screens/FixtureDetailScreen';
import { StageDetailScreen } from '../screens/StageDetailScreen';
import { OverrideSheet } from '../sheets/OverrideSheet';
import { ReasonSheet } from '../sheets/ReasonSheet';
import { ScheduleSheet } from '../sheets/ScheduleSheet';
import { WithdrawTeamSheet } from '../sheets/WithdrawTeamSheet';
import { loadTournament, resetAll } from './support/harness';
import { useTournamentStore } from './support/mockStores';
import { pickDate } from './support/pickers';
import { AT, cupSnapshot, playGroups } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

const EMPTY_SCHEDULE = { scheduledDate: null, scheduledTime: null, venueId: null, notes: null, label: null };

function withSlotOverride(snapshot: TournamentSnapshot, reason: string): TournamentSnapshot {
  const knockout = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex)[1];
  const slot = snapshot.slots.find((candidate) => candidate.stageId === knockout.id && candidate.label === 'A2');
  if (!slot) {
    throw new Error('No slot A2');
  }
  return {
    ...snapshot,
    overrides: [
      {
        id: 'ov1',
        tournamentId: 't1',
        kind: 'qualification',
        stageId: knockout.id,
        teamId: 'EAG',
        action: 'qualify',
        slotId: slot.id,
        poolId: null,
        reason,
        createdAt: AT,
        revokedAt: null,
        revokeReason: null,
      },
    ],
  };
}

describe('Wave 4 · sheets never silently discard input', () => {
  it('closes an untouched reason sheet at once', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<ReasonSheet visible title="Postpone this match?" confirmLabel="Postpone" required={false} onClose={onClose} onSubmit={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('sheet-reason-btn-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dialog-discard')).not.toBeOnTheScreen();
  });

  it('asks before discarding a typed reason, and keeps it on Keep editing', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<ReasonSheet visible title="Cancel this match?" confirmLabel="Cancel match" required onClose={onClose} onSubmit={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('reason-input'), 'Ground flooded');
    await fireEvent.press(screen.getByTestId('sheet-reason-btn-close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog-discard')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('dialog-discard-cancel'));
    expect(screen.getByTestId('reason-input')).toHaveProp('value', 'Ground flooded');
    await fireEvent.press(screen.getByTestId('sheet-reason-btn-close'));
    await fireEvent.press(screen.getByTestId('dialog-discard-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding a picked date in the schedule sheet', async () => {
    const onClose = jest.fn();
    await renderWithTheme(
      <ScheduleSheet visible title="Edit schedule" initial={EMPTY_SCHEDULE} venues={[]} confirmLabel="Save" onClose={onClose} onSubmit={jest.fn()} />,
    );
    await pickDate('schedule-input-date', '2026-10-12');
    await fireEvent.press(screen.getByTestId('sheet-schedule-btn-close'));
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('dialog-discard-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding a changed withdrawal choice', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<WithdrawTeamSheet visible teamName="Northside Strikers" onClose={onClose} onSubmit={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('withdraw-chip-cancel'));
    await fireEvent.press(screen.getByTestId('sheet-withdraw-team-btn-close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog-discard')).toBeOnTheScreen();
  });
});

describe('Wave 4 · short sheet titles', () => {
  it('names the team in the subtitle, not the title', async () => {
    await renderWithTheme(<WithdrawTeamSheet visible teamName="Northside Strikers" onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByText('Withdraw team')).toBeOnTheScreen();
    expect(screen.getByText('Northside Strikers')).toBeOnTheScreen();
  });

  it('titles the override sheet Manual Override with the team underneath', async () => {
    await renderWithTheme(<OverrideSheet visible teamName="Riverside Lions" targets={[]} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByText('Manual Override')).toBeOnTheScreen();
    expect(screen.getByText('Riverside Lions')).toBeOnTheScreen();
    expect(screen.queryByText('Add or deduct points')).not.toBeOnTheScreen();
  });
});

describe('Wave 4 · core copy fields', () => {
  it('shows only the override reason under a manually filled slot', async () => {
    const snapshot = withSlotOverride(playGroups(cupSnapshot()), 'Pool washed out');
    loadTournament(snapshot);
    const knockout = snapshot.stages.find((stage) => stage.type === 'knockout');
    await renderWithTheme(<StageDetailScreen tournamentId="t1" stageId={knockout?.id ?? ''} />);
    expect(screen.getByText('“Pool washed out”')).toBeOnTheScreen();
    expect(screen.queryByText(/Manual Override: '/)).not.toBeOnTheScreen();
  });

  it('offers no Why? when a waiting slot has nothing more to say', async () => {
    const snapshot = cupSnapshot();
    loadTournament(snapshot);
    const semi = snapshot.fixtures.find((fixture) => fixture.bracket?.round === 1 && fixture.bracket.position === 0);
    await renderWithTheme(<FixtureDetailScreen tournamentId="t1" fixtureId={semi?.id ?? ''} />);
    expect(screen.getByTestId('fixture-text-waiting-headline')).toHaveTextContent('Waiting for Pool A winner and Pool B runner-up');
    expect(screen.queryByTestId('fixture-text-waiting-why')).not.toBeOnTheScreen();
  });

  it('shows the error headline when a tournament cannot open', async () => {
    useTournamentStore.setState({
      tournamentId: 't1',
      status: 'error',
      snapshot: null,
      evaluation: null,
      error: { code: 'NOT_FOUND', message: 'This tournament was deleted. Open another one.', headline: 'This tournament was deleted', supporting: 'Open another one.', domainCode: null, detail: null },
    });
    await renderWithTheme(<DashboardScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('tournament-error')).toBeOnTheScreen());
    expect(screen.getByText('This tournament was deleted')).toBeOnTheScreen();
    expect(screen.queryByText('This tournament was deleted. Open another one.')).not.toBeOnTheScreen();
  });
});

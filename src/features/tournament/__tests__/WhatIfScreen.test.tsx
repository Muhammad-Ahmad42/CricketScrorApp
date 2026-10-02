import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { simulate } from '@/domain/tournament/whatif';
import type { HypotheticalResult } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { WhatIfScreen } from '../screens/WhatIfScreen';
import { loadTournament, resetAll } from './support/harness';
import { useTournamentStore } from './support/mockStores';
import { cupSnapshot, playGroups } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function remainingMatchNumber(): number {
  const snapshot = useTournamentStore.getState().snapshot;
  const fixture = snapshot?.fixtures.find((candidate) => candidate.status === 'scheduled' && candidate.poolId !== null);
  if (!fixture) {
    throw new Error('No remaining fixture');
  }
  return fixture.matchNumber;
}

describe('WhatIfScreen (§48)', () => {
  it('states that it is a simulation and lists the remaining fixtures', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    expect(screen.getByTestId('whatif-text-banner')).toHaveTextContent('Simulation only. Nothing in the tournament changes.');
    expect(screen.getByTestId(`whatif-row-${remainingMatchNumber()}`)).toBeOnTheScreen();
    expect(screen.getByTestId('whatif-btn-run')).toBeDisabled();
  });

  it('simulates hypothetical results and never calls applyChange', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals));
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remainingMatchNumber();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-b`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    expect(screen.getByTestId('whatif-text-count')).toHaveTextContent('1 hypothetical result');
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(screen.getByTestId('whatif-result')).toBeOnTheScreen());
    expect(whatIf).toHaveBeenCalledWith([expect.objectContaining({ outcome: 'side_b_win', score: null })]);
    const state = useTournamentStore.getState();
    expect(state.applyChange).not.toHaveBeenCalled();
    expect(state.previewChange).not.toHaveBeenCalled();
    expect(state.snapshot).toBe(data.snapshot);
    expect(screen.queryByText(/apply/i)).not.toBeOnTheScreen();
  });

  it('shows the narrative and the simulated table with movement as text', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    useTournamentStore.setState({ whatIf: jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals)) });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remainingMatchNumber();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-b`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(screen.getByTestId('whatif-result')).toBeOnTheScreen());
    expect(screen.getByTestId('whatif-text-narrative-1')).toBeOnTheScreen();
    expect(screen.getAllByText(/▲|▼|–/).length).toBeGreaterThan(0);
  });

  it('clears every hypothetical with Clear', async () => {
    loadTournament(playGroups(cupSnapshot(), 5));
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remainingMatchNumber();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-tie`));
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    expect(screen.getByTestId('whatif-text-count')).toHaveTextContent('1 hypothetical result');
    await fireEvent.press(screen.getByTestId('whatif-btn-reset'));
    expect(screen.getByTestId('whatif-text-count')).toHaveTextContent('0 hypothetical results');
  });

  it('passes an optional score for net run rate', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 5));
    const whatIf = jest.fn(async (hypotheticals: readonly HypotheticalResult[]) => simulate(data.snapshot, hypotheticals));
    useTournamentStore.setState({ whatIf });
    await renderWithTheme(<WhatIfScreen tournamentId="t1" />);
    const mn = remainingMatchNumber();
    await fireEvent.press(screen.getByTestId(`whatif-row-${mn}`));
    await fireEvent.press(screen.getByTestId(`whatif-chip-${mn}-side-a`));
    await fireEvent.press(screen.getByTestId('whatif-toggle-score'));
    expect(screen.getByTestId('whatif-btn-done')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('whatif-input-first-runs'), '165');
    await fireEvent.changeText(screen.getByTestId('whatif-input-first-overs'), '20');
    await fireEvent.changeText(screen.getByTestId('whatif-input-second-runs'), '150');
    await fireEvent.changeText(screen.getByTestId('whatif-input-second-overs'), '19.3');
    await fireEvent.press(screen.getByTestId('whatif-btn-done'));
    await fireEvent.press(screen.getByTestId('whatif-btn-run'));
    await waitFor(() => expect(whatIf).toHaveBeenCalled());
    expect(whatIf.mock.calls[0][0][0].score).toEqual({
      battingFirst: 'side_a',
      firstInnings: { runs: 165, balls: 120, allOut: false },
      secondInnings: { runs: 150, balls: 117, allOut: false },
    });
  });
});

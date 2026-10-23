import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ProposedChange } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { PoolsScreen } from '../screens/PoolsScreen';
import { loadTournament, previewOf, resetAll } from './support/harness';
import { useTeamLibraryStore, useToastStore, useTournamentStore } from './support/mockStores';
import { cupSnapshot, playPair, teamView } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function stubPreview() {
  const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change, { headline: 'Moving changes 5 fixtures.' }));
  const applyChange = jest.fn(async () => true);
  useTournamentStore.setState({ previewChange, applyChange });
  return { previewChange, applyChange };
}

async function openActions(row: string) {
  await fireEvent.press(screen.getByTestId(`${row}-menu`));
}

describe('PoolsScreen (§33, §34)', () => {
  it('lists pool members with played counts', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    expect(screen.getByTestId('pools-row-a-1')).toHaveProp('accessibilityLabel', 'Lions, 1 played');
    expect(screen.getByText('Pool A · 4 teams · 1 of 6 fixtures')).toBeOnTheScreen();
  });

  it('moves a team only after the impact sheet is confirmed with Continue', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    const { previewChange, applyChange } = stubPreview();
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-4');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    expect(screen.getByText('Moving changes 5 fixtures.')).toBeOnTheScreen();
    const change = previewChange.mock.calls[0][0];
    expect(change.kind).toBe('pool_move');
    if (change.kind === 'pool_move') {
      expect(change.member).toEqual({ kind: 'team', teamId: 'HAW' });
      expect(change.removeFixtureIds).toHaveLength(3);
      expect(change.addFixtures).toHaveLength(4);
    }
    expect(applyChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), 'Hawks asked to move');
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledWith(change, 'Hawks asked to move', expect.objectContaining({ version: 'v1' })));
  });

  it('cancelling the impact sheet changes nothing', async () => {
    loadTournament(cupSnapshot());
    const { applyChange } = stubPreview();
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-1');
    await fireEvent.press(screen.getByTestId('pools-btn-swap'));
    await fireEvent.press(screen.getByTestId('pools-swap-row-1'));
    await waitFor(() => expect(screen.getByTestId('sheet-impact')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('impact-btn-cancel'));
    expect(screen.queryByTestId('sheet-impact')).not.toBeOnTheScreen();
    expect(applyChange).not.toHaveBeenCalled();
  });

  it('swaps two teams through the impact sheet', async () => {
    loadTournament(cupSnapshot());
    const { previewChange, applyChange } = stubPreview();
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-1');
    await fireEvent.press(screen.getByTestId('pools-btn-swap'));
    await fireEvent.press(screen.getByTestId('pools-swap-row-1'));
    await waitFor(() => expect(previewChange).toHaveBeenCalled());
    expect(previewChange.mock.calls[0][0]).toEqual({
      kind: 'pool_swap',
      stageId: expect.any(String),
      memberA: { kind: 'team', teamId: 'LIO' },
      memberB: { kind: 'team', teamId: 'BUL' },
    });
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledTimes(1));
  });

  it('replaces a team with a library team and the chosen results policy, applying only on Continue', async () => {
    loadTournament(cupSnapshot());
    useTeamLibraryStore.setState({ teams: [teamView('RHI', 'Rhinos').team, teamView('LIO').team] });
    const { previewChange, applyChange } = stubPreview();
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-2');
    await fireEvent.press(screen.getByTestId('pools-btn-replace'));
    await fireEvent.press(screen.getByTestId('replace-chip-keep'));
    await fireEvent.press(screen.getByTestId('replace-row-team-1'));
    await fireEvent.press(screen.getByTestId('replace-btn-review'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith({
      kind: 'team_replace',
      outTeamId: 'TIG',
      inTeamId: 'RHI',
      inSeed: null,
      priorResults: 'keep_for_opponents',
    }));
    expect(applyChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledTimes(1));
  });

  it('requires a reason when the impact says so', async () => {
    loadTournament(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO'));
    const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change, { requiresReason: true, severity: 'destructive', completedMatchesAffected: 1 }));
    const applyChange = jest.fn(async () => true);
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-1');
    await fireEvent.press(screen.getByTestId('pools-btn-move'));
    await fireEvent.press(screen.getByTestId('pools-target-row-1'));
    await waitFor(() => expect(screen.getByTestId('impact-btn-continue')).toBeOnTheScreen());
    expect(screen.getByText('Apply changes')).toBeOnTheScreen();
    expect(screen.getByTestId('impact-text-severity')).toHaveTextContent('1 completed match is affected.');
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), 'Lions asked to move');
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledWith(expect.anything(), 'Lions asked to move', expect.anything()));
  });

  it('warns before re-drawing and shows the seed in the result', async () => {
    loadTournament(cupSnapshot());
    const { previewChange } = stubPreview();
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('pools-btn-redraw'));
    await fireEvent.press(screen.getByTestId('pools-btn-repeat-draw'));
    await fireEvent.changeText(screen.getByTestId('pools-input-seed'), '847291');
    await fireEvent.press(screen.getByTestId('pools-btn-draw'));
    expect(screen.getByTestId('pools-text-replace-warning')).toHaveTextContent('Current pool arrangement will be replaced.');
    expect(previewChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    await waitFor(() => expect(previewChange).toHaveBeenCalled());
    const change = previewChange.mock.calls[0][0];
    expect(change).toMatchObject({ kind: 'pools_replace', seed: 847291 });
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalledWith(expect.objectContaining({ message: 'Pools drawn (no. 847291)' })));
  });

  it('re-previews when the tournament changed during review (CONFLICT)', async () => {
    loadTournament(cupSnapshot());
    const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change));
    const applyChange = jest.fn(async () => {
      useTournamentStore.setState({ error: { code: 'CONFLICT', message: 'Changed', domainCode: null, detail: null } });
      return false;
    });
    useTournamentStore.setState({ previewChange, applyChange });
    await renderWithTheme(<PoolsScreen tournamentId="t1" />);
    await openActions('pools-row-a-1');
    await fireEvent.press(screen.getByTestId('pools-btn-swap'));
    await fireEvent.press(screen.getByTestId('pools-swap-row-2'));
    await waitFor(() => expect(screen.getByTestId('impact-btn-continue')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(screen.getByTestId('impact-text-notice')).toHaveTextContent('Tournament changed. Review again.'));
    expect(useTournamentStore.getState().refresh).toHaveBeenCalled();
    expect(previewChange).toHaveBeenCalledTimes(2);
  });
});

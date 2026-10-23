import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ProposedChange } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { ManageTournamentScreen } from '../screens/ManageTournamentScreen';
import { TournamentTeamsScreen } from '../screens/TournamentTeamsScreen';
import { libraryTeams, loadTournament, previewOf, resetAll } from './support/harness';
import { useBackupStore, useExportStore, useTeamLibraryStore, useTournamentListStore, useTournamentStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { cupSnapshot, playToChampion } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function stubFlow() {
  const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change));
  const applyChange = jest.fn(async () => true);
  useTournamentStore.setState({ previewChange, applyChange });
  return { previewChange, applyChange };
}

describe('ManageTournamentScreen', () => {
  it('completes the tournament after a confirmation dialog', async () => {
    loadTournament(playToChampion(cupSnapshot()));
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-complete'));
    await fireEvent.press(screen.getByTestId('dialog-btn-confirm'));
    await waitFor(() => expect(useTournamentStore.getState().setStatus).toHaveBeenCalledWith('completed', null));
    expect(useTournamentListStore.getState().load).toHaveBeenCalled();
  });

  it('explains why the tournament cannot be completed yet', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    expect(screen.getByTestId('tmanage-btn-complete')).toBeDisabled();
    expect(screen.getByText("The champion hasn't been decided yet.")).toBeOnTheScreen();
  });

  it('reopens a completed tournament only with a reason', async () => {
    loadTournament(playToChampion(cupSnapshot({ status: 'completed' })));
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-reopen'));
    expect(screen.getByTestId('reason-btn-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('reason-input'), 'Correct the final');
    await fireEvent.press(screen.getByTestId('reason-btn-confirm'));
    await waitFor(() => expect(useTournamentStore.getState().setStatus).toHaveBeenCalledWith('active', 'Correct the final'));
    expect(screen.getByTestId('tmanage-btn-archive')).toBeOnTheScreen();
  });

  it('changes rules through the impact preview', async () => {
    loadTournament(cupSnapshot());
    const { previewChange, applyChange } = stubFlow();
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-rules'));
    await fireEvent(screen.getByTestId('tmanage-input-points-win'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByTestId('tmanage-btn-rules-review'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rules_change', stageId: null, pointsSystem: expect.objectContaining({ win: 3 }) })));
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledTimes(1));
  });

  it('exports a PDF and a backup through the export and backup stores', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-export-pdf'));
    await waitFor(() => expect(useExportStore.getState().share).toHaveBeenCalledWith('file:///tournament.pdf', 'application/pdf'));
    await fireEvent.press(screen.getByTestId('tmanage-btn-backup'));
    await waitFor(() => expect(useBackupStore.getState().exportBackup).toHaveBeenCalledWith({ kind: 'tournament', tournamentId: 't1' }));
    await waitFor(() => expect(useExportStore.getState().share).toHaveBeenCalledWith('file:///backup.json', 'application/json'));
  });

  it('saves the structure as a template', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-save-template'));
    await fireEvent.press(screen.getByTestId('tmanage-btn-template-save'));
    await waitFor(() => expect(useTournamentStore.getState().saveAsTemplate).toHaveBeenCalledWith({ name: 'City Cup format', description: '' }));
  });

  it('deletes only after the typed name and the completed-matches opt-in', async () => {
    loadTournament(cupSnapshot());
    useTournamentStore.setState({ previewDelete: jest.fn(async () => ({ matches: 15, completedMatches: 3, events: 400 })) });
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-delete'));
    await waitFor(() => expect(screen.getByTestId('typed-input-name')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('typed-input-name'), 'City Cup');
    expect(screen.getByTestId('typed-btn-confirm')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('typed-toggle-completed'));
    await fireEvent.press(screen.getByTestId('typed-btn-confirm'));
    await waitFor(() => expect(useTournamentStore.getState().delete).toHaveBeenCalledWith({ typedName: 'City Cup', deleteCompletedMatches: true }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/tournaments'));
  });

  it('edits the details', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<ManageTournamentScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tmanage-btn-info'));
    await fireEvent.changeText(screen.getByTestId('info-input-name'), 'City Cup Final Edition');
    await fireEvent.press(screen.getByTestId('info-btn-save'));
    await waitFor(() => expect(useTournamentStore.getState().updateInfo).toHaveBeenCalledWith(expect.objectContaining({ name: 'City Cup Final Edition', season: '2026' })));
  });
});

describe('TournamentTeamsScreen (§27, §33)', () => {
  it('lists teams with seeds and pools', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<TournamentTeamsScreen tournamentId="t1" />);
    expect(screen.getByTestId('tteams-text-count')).toHaveTextContent('8 teams');
    expect(screen.getByTestId('tteams-row-1')).toHaveProp('accessibilityLabel', 'Lions, Pool A');
  });

  it('withdraws a team through the impact preview', async () => {
    loadTournament(cupSnapshot());
    const { previewChange, applyChange } = stubFlow();
    await renderWithTheme(<TournamentTeamsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tteams-btn-menu-4'));
    await fireEvent.press(screen.getByTestId('tteams-btn-withdraw'));
    await fireEvent.press(screen.getByTestId('withdraw-chip-cancel'));
    await fireEvent.press(screen.getByTestId('withdraw-btn-review'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith({ kind: 'team_withdraw', teamId: 'HAW', remainingFixtures: 'cancel', expungeResults: false }));
    expect(applyChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledTimes(1));
  });

  it('changes a seed and replaces a team through the impact preview', async () => {
    loadTournament(cupSnapshot());
    useTeamLibraryStore.setState({ teams: libraryTeams(['RHI']) });
    const { previewChange } = stubFlow();
    await renderWithTheme(<TournamentTeamsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('tteams-btn-menu-1'));
    await fireEvent.press(screen.getByTestId('tteams-btn-seed'));
    await fireEvent.changeText(screen.getByTestId('seed-input'), '1');
    await fireEvent.press(screen.getByTestId('seed-btn-review'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith({ kind: 'team_seeds_change', seeds: [{ teamId: 'LIO', seed: 1 }] }));
    await fireEvent.press(screen.getByTestId('impact-btn-cancel'));
    await fireEvent.press(screen.getByTestId('tteams-btn-menu-2'));
    await fireEvent.press(screen.getByTestId('tteams-btn-replace'));
    await fireEvent.press(screen.getByTestId('replace-row-team-1'));
    await fireEvent.press(screen.getByTestId('replace-btn-review'));
    await waitFor(() =>
      expect(previewChange).toHaveBeenLastCalledWith({ kind: 'team_replace', outTeamId: 'TIG', inTeamId: 'RHI', inSeed: null, priorResults: 'transfer_to_replacement' }),
    );
  });
});

import '@/ui/testing';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { BracketScreen } from '../screens/BracketScreen';
import { loadTournament, resetAll } from './support/harness';
import { mockRouter } from './support/router';
import { cupSnapshot, knockoutSnapshot, playBracket, playGroups, playToChampion } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

describe('BracketScreen (§46)', () => {
  it('shows slot labels until the qualifiers are known', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-bracket')).toBeOnTheScreen();
    expect(screen.getByTestId('bracket-text-sides-1-0')).toHaveTextContent('A1 v B2');
    expect(screen.getByTestId('bracket-text-sides-1-1')).toHaveTextContent('B1 v A2');
    expect(screen.getByTestId('bracket-text-sides-2-0')).toHaveTextContent('Winner SF1 v Winner SF2');
    expect(screen.getByTestId('bracket-text-champion')).toHaveTextContent('To be decided');
  });

  it('fills the sides from the slots once the pools are complete (§92)', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-sides-1-0')).toHaveTextContent('Lions v Bears');
    expect(screen.getByTestId('bracket-text-sides-1-1')).toHaveTextContent('Bulls v Tigers');
    expect(screen.getByTestId('bracket-text-sides-2-0')).toHaveTextContent('Winner SF1 v Winner SF2');
  });

  it('advances winners to the next round', async () => {
    loadTournament(playBracket(playBracket(playGroups(cupSnapshot()), 1, 0, 'a'), 1, 1, 'a'));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-sides-2-0')).toHaveTextContent('Lions v Bulls');
    expect(screen.getByTestId('bracket-text-winner-1-0')).toHaveTextContent('Lions won');
  });

  it('names the champion after the final', async () => {
    loadTournament(playToChampion(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-champion')).toHaveTextContent('Lions');
  });

  it('renders byes for the top seeds with their names', async () => {
    loadTournament(knockoutSnapshot(6));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const byes = screen.getAllByText('Bye: straight through to the next round');
    expect(byes).toHaveLength(2);
    expect(screen.getByTestId('bracket-text-byes')).toHaveTextContent('Byes: Seed 1 and Seed 2 go straight through to the next round.');
    expect(screen.getByTestId('bracket-row-1-0')).toHaveProp('accessibilityLabel', 'Seed 1 has a bye and goes straight through to the next round.');
  });

  it('reads each match as one accessible element and opens the fixture on tap', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const box = screen.getByTestId('bracket-row-1-0');
    expect(box).toHaveProp('accessibilityLabel', expect.stringContaining('A1 Lions'));
    await fireEvent.press(box);
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/tournament/[tournamentId]/fixtures/[fixtureId]' }),
    );
  });

  it('shows a third-place play-off when configured', async () => {
    loadTournament(knockoutSnapshot(8, true));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getAllByText(/Third place/i).length).toBeGreaterThan(0);
  });
});

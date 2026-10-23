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
    expect(screen.getByTestId('bracket-text-side-1-0-a')).toHaveTextContent(/^A1/);
    expect(screen.getByTestId('bracket-text-side-1-0-b')).toHaveTextContent(/^B2/);
    expect(screen.getByTestId('bracket-text-side-1-1-a')).toHaveTextContent(/^B1/);
    expect(screen.getByTestId('bracket-text-side-1-1-b')).toHaveTextContent(/^A2/);
    expect(screen.getByTestId('bracket-text-side-2-0-a')).toHaveTextContent('Winner SF1');
    expect(screen.getByTestId('bracket-text-side-2-0-b')).toHaveTextContent('Winner SF2');
    expect(screen.getByTestId('bracket-text-champion')).toHaveTextContent('To be decided');
  });

  it('gives every semifinal card both teams on their own line, never one sentence that cuts the second team off', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const card = screen.getByTestId('bracket-text-sides-1-0');
    const a = screen.getByTestId('bracket-text-side-1-0-a');
    const b = screen.getByTestId('bracket-text-side-1-0-b');
    expect(card).toContainElement(a);
    expect(card).toContainElement(b);
    expect(a).not.toHaveTextContent(/·|\(provisional\)/);
    expect(b).not.toHaveTextContent(/·|\(provisional\)/);
  });

  it('fills the sides from the slots once the pools are complete (§92)', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-side-1-0-a')).toHaveTextContent(/Lions/);
    expect(screen.getByTestId('bracket-text-side-1-0-b')).toHaveTextContent(/Bears/);
    expect(screen.getByTestId('bracket-text-side-1-1-a')).toHaveTextContent(/Bulls/);
    expect(screen.getByTestId('bracket-text-side-1-1-b')).toHaveTextContent(/Tigers/);
    expect(screen.getByTestId('bracket-text-side-2-0-a')).toHaveTextContent('Winner SF1');
  });

  it('advances winners to the next round', async () => {
    loadTournament(playBracket(playBracket(playGroups(cupSnapshot()), 1, 0, 'a'), 1, 1, 'a'));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-side-2-0-a')).toHaveTextContent(/Lions/);
    expect(screen.getByTestId('bracket-text-side-2-0-b')).toHaveTextContent(/Bulls/);
    expect(screen.queryByTestId('bracket-text-winner-1-0')).not.toBeOnTheScreen();
    expect(screen.getByTestId('bracket-row-1-0').props.accessibilityLabel).toMatch(/Lions won/);
  });

  it('names the champion after the final', async () => {
    loadTournament(playToChampion(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    expect(screen.getByTestId('bracket-text-champion')).toHaveTextContent('Lions');
  });

  it('renders byes for the top seeds with their names', async () => {
    loadTournament(knockoutSnapshot(6));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const byes = screen.getAllByText('Bye: straight through');
    expect(byes).toHaveLength(2);
    expect(screen.queryByTestId('bracket-text-byes')).not.toBeOnTheScreen();
    expect(screen.getByTestId('bracket-row-1-0')).toHaveProp('accessibilityLabel', 'Seed 1 has a bye and goes straight through to the next round.');
  });

  it('reads each match as one accessible element and opens the fixture on tap', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<BracketScreen tournamentId="t1" />);
    const box = screen.getByTestId('bracket-row-1-0');
    expect(box).toHaveProp('accessibilityLabel', expect.stringContaining('A1, Lions'));
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

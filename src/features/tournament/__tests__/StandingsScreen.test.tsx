import '@/ui/testing';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/ui/testing';
import { StandingsScreen } from '../screens/StandingsScreen';
import { loadTournament, resetAll } from './support/harness';
import { cupSnapshot, leagueSnapshot, playGroups, playPair } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

describe('StandingsScreen (§50, §51, §98)', () => {
  it('has pool tabs and an overall tab', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-standings')).toBeOnTheScreen();
    expect(screen.getByTestId('standings-tab-pool-a')).toBeOnTheScreen();
    expect(screen.getByTestId('standings-tab-pool-b')).toBeOnTheScreen();
    expect(screen.getByTestId('standings-tab-overall')).toBeOnTheScreen();
  });

  it('shows the columns Pos, Team, P, W, L, NR, Pts, NRR with the domain values', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    const header = screen.getByTestId('standings-header', { includeHiddenElements: true });
    expect(header).toHaveTextContent('PosTeamPWLNRPtsNRR');
    const expected = [
      ['Lions', '3', '3', '0', '0', '6', '+6.000'],
      ['Tigers', '3', '2', '1', '0', '4', '+2.000'],
      ['Eagles', '3', '1', '2', '0', '2', '−2.000'],
      ['Hawks', '3', '0', '3', '0', '0', '−6.000'],
    ] as const;
    expected.forEach(([team, p, w, l, nr, pts, nrr], position) => {
      const id = `a-${position + 1}`;
      expect(screen.getByTestId(`standings-cell-${id}-pos`)).toHaveTextContent(String(position + 1));
      expect(screen.getByTestId(`standings-cell-${id}-team`)).toHaveTextContent(team);
      expect(screen.getByTestId(`standings-cell-${id}-p`)).toHaveTextContent(p);
      expect(screen.getByTestId(`standings-cell-${id}-w`)).toHaveTextContent(w);
      expect(screen.getByTestId(`standings-cell-${id}-l`)).toHaveTextContent(l);
      expect(screen.getByTestId(`standings-cell-${id}-nr`)).toHaveTextContent(nr);
      expect(screen.getByTestId(`standings-cell-${id}-pts`)).toHaveTextContent(pts);
      expect(screen.getByTestId(`standings-cell-${id}-nrr`)).toHaveTextContent(nrr);
    });
  });

  it('labels qualification with text and the §98 explanation, never colour alone', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-text-qual-a-1')).toHaveTextContent('As Pool A winners');
    expect(screen.getByTestId('standings-badge-qual-a-1')).toHaveTextContent('Qualified');
    expect(screen.getByTestId('standings-badge-qual-a-4')).toHaveTextContent('Eliminated');
    expect(screen.getByTestId('standings-row-a-1')).toHaveProp(
      'accessibilityLabel',
      'Position 1, Lions, played 3, won 3, lost 0, no result 0, 6 points, net run rate plus 6.000. Qualified, mathematical. Knockouts as Pool A winners.',
    );
    expect(screen.getByTestId('standings-row-a-4').props.accessibilityLabel).toContain('net run rate minus 6.000');
  });

  it('shows the rule, the tie-breaker chain and the tie-break explanation', async () => {
    loadTournament(playPair(playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO', 6), 'EAG', 'HAW', 'EAG', 12));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-text-rule')).toHaveTextContent('Top 2 from each pool qualify for the Knockouts.');
    expect(screen.getByTestId('standings-cell-a-1-team')).toHaveTextContent('Eagles');
    expect(screen.queryByTestId('standings-text-chain')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('standings-text-tiebreak-a-1')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('standings-btn-tiebreaks'));
    expect(screen.getByTestId('standings-text-chain')).toHaveTextContent('Ranking: Points → NRR → Head-to-Head → Most wins → Organizer decision');
    expect(screen.getByTestId('standings-text-tiebreak-a-1')).toHaveTextContent(/net run rate/i);
  });

  it('switches pools from the tabs', async () => {
    loadTournament(playGroups(cupSnapshot()));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('standings-tab-pool-b'));
    expect(screen.getByTestId('standings-cell-b-1-team')).toHaveTextContent('Bulls');
    expect(screen.getByTestId('standings-text-slots')).toHaveTextContent(/B1 Bulls/);
  });

  it('virtualises a 128-team table', async () => {
    loadTournament(leagueSnapshot(128));
    await renderWithTheme(<StandingsScreen tournamentId="t1" />);
    expect(screen.getByTestId('standings-row-a-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('standings-row-a-128')).not.toBeOnTheScreen();
  });
});

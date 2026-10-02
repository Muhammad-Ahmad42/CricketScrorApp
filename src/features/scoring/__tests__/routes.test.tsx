import './support/mocks';
import { screen } from '@testing-library/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import MatchLayout from '@/app/match/[matchId]/_layout';
import ScoreRoute from '@/app/match/[matchId]/score';
import EditBallRoute from '@/app/match/[matchId]/edit/[seq]';
import BallsRoute from '@/app/match/[matchId]/balls';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore } = mockStores();

describe('match routes', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('opens the match from the route param and closes it when the stack unmounts', async () => {
    const store = setLive(null);
    jest.mocked(useLocalSearchParams).mockReturnValue({ matchId: 'M9' });
    const view = await renderScreen(<MatchLayout />);
    expect(store.open).toHaveBeenCalledWith('M9');
    expect(Stack).toHaveBeenCalled();
    await view.unmount();
    expect(useLiveMatchStore.getState().close).toHaveBeenCalled();
  });

  it('renders the live scoring screen for score', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoreRoute />);
    expect(screen.getByTestId('screen-score')).toBeOnTheScreen();
  });

  it('passes the ball sequence number to the edit screen', async () => {
    const live = liveMatch([OPEN, '1']);
    setLive(live);
    jest.mocked(useLocalSearchParams).mockReturnValue({ matchId: 'M1', seq: `${live.events[1].seq}` });
    await renderScreen(<EditBallRoute />);
    expect(screen.getByText(`Edit ball ${live.state.innings[0].balls[0].label}`)).toBeOnTheScreen();
  });

  it('opens the ball log on the requested innings', async () => {
    setLive(liveMatch([OPEN, ...Array.from({ length: 18 }, () => '1'), 'start:T1:T2:L11', '4']));
    jest.mocked(useLocalSearchParams).mockReturnValue({ matchId: 'M1', innings: '0' });
    await renderScreen(<BallsRoute />);
    expect(screen.getByTestId('balls-tab-0')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });
});

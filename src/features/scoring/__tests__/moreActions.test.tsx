import './support/mocks';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { selectBowler } from '@/domain/scoring/commands';
import { ScoringScreen } from '../screens/ScoringScreen';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore } = mockStores();

async function openMore(action: string) {
  await fireEvent.press(screen.getByTestId('score-btn-more'));
  await fireEvent.press(screen.getByTestId(`more-row-${action}`));
}

describe('More sheet on the live screen', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('navigates to the scorecard, ball log, analytics and match settings', async () => {
    setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    for (const route of ['scorecard', 'balls', 'analytics', 'manage']) {
      await openMore(route);
      expect(router.push).toHaveBeenLastCalledWith({ pathname: `/match/[matchId]/${route}`, params: { matchId: 'M1' } });
    }
  });

  it('changes the bowler mid-over for an injury', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await openMore('change_bowler');
    await fireEvent.press(screen.getByTestId('change-bowler-T9'));
    expect(store.dispatch).toHaveBeenCalledWith(selectBowler('T9', 'injury'));
  });

  it('retires a batter hurt with the next batter', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await openMore('retire');
    await fireEvent.press(screen.getByTestId('retire-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'retire', playerId: 'L2', retirement: 'retired_hurt', nextBatterId: 'L3' });
  });

  it('records a timed-out batter as an off-ball dismissal', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openMore('retire');
    await fireEvent.press(screen.getByTestId('retire-kind-off_timed_out'));
    await fireEvent.press(screen.getByTestId('retire-next-later'));
    await fireEvent.press(screen.getByTestId('retire-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'off_ball_dismissal', playerId: 'L1', dismissal: 'timed_out', nextBatterId: null });
  });

  it('awards penalty runs only with a reason', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openMore('penalty');
    expect(screen.getByTestId('penalty-submit')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('penalty-team-TIG'));
    await fireEvent.changeText(screen.getByTestId('penalty-reason'), 'Ball tampering');
    await fireEvent.press(screen.getByTestId('penalty-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'penalty', teamId: 'TIG', runs: 5, reason: 'Ball tampering' });
  });

  it('suspends play for bad light', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openMore('suspend');
    await fireEvent.press(screen.getByTestId('suspend-reason-bad_light'));
    await fireEvent.press(screen.getByTestId('suspend-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'suspend_play', reason: 'bad_light', note: null });
  });

  it('revises the overs of the current innings with a reason', async () => {
    const store = setLive(liveMatch([OPEN]));
    await renderScreen(<ScoringScreen />);
    await openMore('revise');
    await fireEvent.press(screen.getByTestId('revise-overs-decrement'));
    await fireEvent.press(screen.getByTestId('revise-both'));
    await fireEvent.changeText(screen.getByTestId('revise-reason'), 'Rain delay');
    await fireEvent.press(screen.getByTestId('revise-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'revise_overs',
      inningsIndex: 0,
      reason: 'Rain delay',
      overs: 2,
      maxOversPerBowler: 2,
      scope: 'both_innings',
    });
  });

  it('ends a chase on par score with a terminal revision', async () => {
    const ones = Array.from({ length: 18 }, () => '1');
    const store = setLive(liveMatch([OPEN, ...ones, 'start:T1:T2:L11', '1', '4', 'susp']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-resume-revise'));
    await fireEvent.press(screen.getByTestId('revise-terminal'));
    await fireEvent.changeText(screen.getByTestId('revise-par'), '9');
    await fireEvent.changeText(screen.getByTestId('revise-reason'), 'No more play possible');
    await fireEvent.press(screen.getByTestId('revise-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'revise_overs',
      inningsIndex: 1,
      reason: 'No more play possible',
      balls: 2,
      target: 10,
      terminal: true,
    });
  });

  it('declares the innings after a confirmation', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await openMore('end_innings');
    await fireEvent.press(screen.getByTestId('end-innings-next'));
    await fireEvent.press(screen.getByTestId('end-innings-confirm'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'end_innings', reason: 'declared' });
  });

  it('adds a late batter from the next-batter panel', async () => {
    const addSquadPlayer = jest.fn(() => Promise.resolve(true));
    setLive(liveMatch([OPEN, 'W:b']), { addSquadPlayer });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-batter-add'));
    await fireEvent.changeText(screen.getByTestId('add-player-name'), 'Late Arrival');
    await fireEvent.press(screen.getByTestId('add-player-submit'));
    expect(addSquadPlayer).toHaveBeenCalledWith('LIO', { newPlayer: { name: 'Late Arrival', jerseyNumber: null } }, { isSubstitute: false });
  });

  it('asks for a reason when undoing a confirmed tournament result', async () => {
    const undo = jest.fn((reason?: string) => {
      if (reason === undefined) {
        useLiveMatchStore.setState({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Reason needed', domainCode: null, detail: null } });
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    });
    setLive(liveMatch([OPEN, '1']), { undo });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-undo'));
    await fireEvent.changeText(await screen.findByTestId('dialog-reason-field'), 'Wrong final ball');
    await fireEvent.press(screen.getByTestId('dialog-reason-confirm'));
    expect(undo).toHaveBeenLastCalledWith('Wrong final ball');
  });
});

import './support/mocks';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { batterIn, selectBowler } from '@/domain/scoring/commands';
import { ScoringScreen } from '../screens/ScoringScreen';
import { m3Setup } from '@/domain/scoring/testing';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive } from './support/render';

const ones = (count: number) => Array.from({ length: count }, () => '1');
const FIRST_INNINGS = [OPEN, ...ones(18)];
const SECOND = 'start:T1:T2:L11';

describe('pending actions on the live screen', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('start_next_innings: shows the innings break and starts the 2nd innings with the chosen openers', async () => {
    const live = liveMatch(FIRST_INNINGS);
    expect(live.state.pendingAction?.type).toBe('start_next_innings');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-start-innings')).toBeOnTheScreen();
    expect(screen.getByText('Lions 18/0 (3 ov) · overs completed')).toBeOnTheScreen();
    expect(screen.getByTestId('prompt-start-chase')).toHaveTextContent(/^Target 19/);
    expect(screen.getByTestId('prompt-start-chase')).toHaveTextContent('Target 19Need 19 off 18');
    expect(screen.getByTestId('prompt-start-chase')).not.toHaveTextContent(/Tigers need/);
    expect(screen.getByTestId('prompt-start-striker')).toHaveTextContent(/Choose striker…/);
    expect(screen.getByTestId('prompt-start-striker')).toHaveProp('accessibilityLabel', 'Striker, Choose striker…, required');
    expect(screen.queryByTestId('score-btn-1')).not.toBeOnTheScreen();
    expect(screen.getByTestId('prompt-start-submit')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('prompt-start-striker'));
    await fireEvent.press(screen.getByTestId('prompt-start-striker-T2'));
    await fireEvent.press(screen.getByTestId('prompt-start-nonStriker'));
    await fireEvent.press(screen.getByTestId('prompt-start-nonStriker-T3'));
    await fireEvent.press(screen.getByTestId('prompt-start-bowler'));
    await fireEvent.press(screen.getByTestId('prompt-start-bowler-L10'));
    expect(screen.getByTestId('prompt-start-striker')).toHaveProp('accessibilityLabel', expect.not.stringContaining('required'));
    await fireEvent.press(screen.getByTestId('prompt-start-submit'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'start_innings', strikerId: 'T2', nonStrikerId: 'T3', bowlerId: 'L10', battingTeamId: 'TIG' });
  });

  it('states the target before the second innings starts when the scorer confirms the innings end', async () => {
    resetCommonStores({ confirmInningsEnd: true });
    setLive(liveMatch(FIRST_INNINGS));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-innings-chase')).toHaveTextContent(/^Target 19/);
  });

  it('select_next_bowler: says "over" for a one-over limit and leaves out figures for bowlers who have not bowled', async () => {
    setLive(liveMatch([OPEN, ...ones(6)], m3Setup({ rules: { maxOversPerBowler: 1 } })));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-bowler-T10')).toHaveTextContent(/0 of 1 over$/);
    expect(screen.getByTestId('prompt-bowler-T10')).not.toHaveTextContent(/–/);
    expect(screen.queryByText(/of 1 overs/)).not.toBeOnTheScreen();
  });

  it('start_next_innings with "confirm before ending an innings" asks first', async () => {
    resetCommonStores({ confirmInningsEnd: true });
    const store = setLive(liveMatch(FIRST_INNINGS));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-innings-confirm')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-innings-confirm-undo'));
    expect(store.undo).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('prompt-innings-continue'));
    expect(screen.getByTestId('prompt-start-innings')).toBeOnTheScreen();
  });

  it('select_next_batter: lists the candidates and sends batter_in for the open end', async () => {
    const live = liveMatch([OPEN, '1', 'W:b']);
    expect(live.state.pendingAction?.type).toBe('select_next_batter');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-next-batter')).toBeOnTheScreen();
    expect(screen.getByText('Fakhar is out')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-batter-all'));
    await fireEvent.press(screen.getByTestId('prompt-batter-L7'));
    expect(store.dispatch).toHaveBeenCalledWith(batterIn('L7', 'striker'));
  });

  it('select_next_bowler: eligible bowlers first, the last-over bowler listed with the reason', async () => {
    const live = liveMatch([OPEN, ...ones(6)]);
    expect(live.state.pendingAction?.type).toBe('select_next_bowler');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByText('Over 2 · Choose bowler')).toBeOnTheScreen();
    expect(screen.getByTestId('prompt-bowler-ineligible')).toHaveTextContent(/Haris.*Bowled the last over/);
    expect(screen.queryByTestId('prompt-bowler-T11')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-bowler-T10'));
    expect(store.dispatch).toHaveBeenCalledWith(selectBowler('T10'));
  });

  it('select_next_bowler without the auto prompt shows a single choose button first', async () => {
    resetCommonStores({ autoPromptBowler: false });
    setLive(liveMatch([OPEN, ...ones(6)]));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-bowler-open'));
    expect(screen.getByTestId('prompt-next-bowler')).toBeOnTheScreen();
  });

  it('resume_play: shows the suspension and resumes', async () => {
    const live = liveMatch([OPEN, '1', 'susp']);
    expect(live.state.pendingAction?.type).toBe('resume_play');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByText('Play suspended · Rain')).toBeOnTheScreen();
    expect(screen.getByText('Since 0.1 overs')).toBeOnTheScreen();
    expect(screen.getByTestId('score-top-bar')).toHaveTextContent(/Paused/);
    await fireEvent.press(screen.getByTestId('prompt-resume-btn'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'resume_play' });
  });

  it('confirm_result: shows the result text, confirms with end_match and moves to the scorecard', async () => {
    const live = liveMatch([...FIRST_INNINGS, SECOND, '6', '6', '6', '1']);
    expect(live.state.pendingAction?.type).toBe('confirm_result');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-result-text')).toHaveTextContent('Tigers won by 10 wickets (14 balls left)');
    expect(screen.getByTestId('prompt-result-scores')).toHaveTextContent('LIO 18/0 (3 ov) · TIG 19/0 (0.4 ov)');
    expect(screen.getByTestId('score-innings-summary')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-confirm-btn'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'end_match', outcome: { type: 'natural' } });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/match/[matchId]/scorecard', params: { matchId: 'M1' } }), {
      timeout: 2000,
    });
  });

  it('resolve_tie: offers a super over, accepting the tie or deciding another way', async () => {
    const live = liveMatch([...FIRST_INNINGS, SECOND, ...ones(18)]);
    expect(live.state.pendingAction?.type).toBe('resolve_tie');
    const store = setLive(live);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByText('Match tied · 18 each')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-tie-super-over'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'start_super_over' });
    await fireEvent.press(screen.getByTestId('prompt-tie-other'));
    await fireEvent.press(screen.getByTestId('decide-tie-method-coin_toss'));
    await fireEvent.press(screen.getByTestId('decide-tie-winner-TIG'));
    await fireEvent.press(screen.getByTestId('decide-tie-submit'));
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'end_match', outcome: { type: 'tie_decided', method: 'coin_toss', winnerTeamId: 'TIG' } });
  });

  it('shows the result and scorecard links once the match is complete', async () => {
    setLive(liveMatch([...FIRST_INNINGS, SECOND, '6', '6', '6', '1', 'end']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-match-over')).toBeOnTheScreen();
    expect(screen.getByTestId('result-text')).toHaveTextContent('Tigers won by 10 wickets (14 balls left)');
  });

  it('replaces the pad with the repair panel when the log needs repair', async () => {
    const live = liveMatch([OPEN, '1', '4']);
    const delivery = live.events[live.events.length - 1];
    const repaired = {
      ...live,
      state: {
        ...live.state,
        needsRepair: true,
        issues: [{ seq: delivery.seq, eventId: delivery.id, severity: 'error' as const, code: 'CONTEXT_MISMATCH' as const, message: '0.2 · Haris to Babar' }],
      },
    };
    const store = setLive(repaired);
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('prompt-repair-text')).toHaveTextContent("Can't apply: 0.2 · Haris to Babar");
    expect(screen.getByTestId('prompt-repair-bar')).toBeTruthy();
    expect(screen.getByText('This match needs repair')).toBeOnTheScreen();
    expect(screen.queryByTestId('score-btn-1')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('prompt-repair-review'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/edit/[seq]', params: { matchId: 'M1', seq: `${delivery.seq}` } });
    await fireEvent.press(screen.getByTestId('prompt-repair-undo'));
    expect(store.undo).toHaveBeenCalled();
  });
});

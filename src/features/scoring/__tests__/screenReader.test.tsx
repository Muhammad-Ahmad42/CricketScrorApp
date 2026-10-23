import './support/mocks';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { noBall, scoreRuns } from '@/domain/scoring/commands';
import { m3Setup } from '@/domain/scoring/testing';
import { showsEconomy } from '../components/CreasePanel';
import { ScoringScreen } from '../screens/ScoringScreen';
import { liveMatch, OPEN } from './support/liveMatch';
import { renderScreen, resetCommonStores, setLive, setWindow } from './support/render';
import { mockStores } from './support/storeModule';

const { useLiveMatchStore, useToastStore } = mockStores();

const ones = (count: number) => Array.from({ length: count }, () => '1');

function dispatched(store: { readonly dispatch: (intent: ScoringIntent) => Promise<boolean> }): readonly ScoringIntent[] {
  return jest.mocked(store.dispatch).mock.calls.map(([intent]) => intent);
}

async function runAction(actionName: string) {
  await fireEvent(screen.getByTestId('score-btn-scorecard'), 'accessibilityAction', { nativeEvent: { actionName } });
}

describe('screen-reader scoring shortcuts on the score block (ACCESSIBILITY §4)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('exposes every pad shortcut and records runs through the same dispatch as the keys', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    const actions = screen.getByTestId('score-btn-scorecard').props.accessibilityActions as readonly { readonly name: string; readonly label: string }[];
    expect(actions.map((action) => action.label)).toEqual([
      'Score a dot ball',
      'Score one run',
      'Score two runs',
      'Score three runs',
      'Score four',
      'Score six',
      'Extras…',
      'Wicket…',
      'Undo',
    ]);
    await runAction('four');
    await runAction('dot');
    expect(dispatched(store)).toEqual([scoreRuns(4), scoreRuns(0)]);
  });

  it('opens the wicket and extras sheets and undoes from the shortcuts', async () => {
    const store = setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await runAction('wicket');
    expect(screen.getByTestId('wicket-btn-bowled')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-wicket-btn-close'));
    await runAction('extras');
    expect(screen.getByTestId('extras-chip-wd')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-extras-btn-close'));
    await runAction('undo');
    expect(store.undo).toHaveBeenCalledTimes(1);
  });

  it('offers only Undo while a pending panel replaces the pad and ignores unknown actions', async () => {
    const store = setLive(liveMatch([OPEN, '1', 'W:b']));
    await renderScreen(<ScoringScreen />);
    const actions = screen.getByTestId('score-btn-scorecard').props.accessibilityActions as readonly { readonly name: string }[];
    expect(actions.map((action) => action.name)).toEqual(['undo']);
    await runAction('four');
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe('announcing committed actions (ACCESSIBILITY §3)', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  });

  afterEach(() => {
    announce.mockRestore();
  });

  function spoken(): readonly string[] {
    return announce.mock.calls.map(([message]) => String(message));
  }

  it('says nothing when the match is opened', async () => {
    setLive(liveMatch([OPEN, '4']));
    await renderScreen(<ScoringScreen />);
    expect(spoken()).toEqual([]);
  });

  it('names the batter and dismissal after a wicket', async () => {
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '1', 'W:b']) });
    });
    expect(spoken()).toEqual(['Wicket, bowled, Fakhar b Haris. Lions 1 for 1, 0.2 overs.']);
  });

  it('adds the end-of-over line and the free-hit warning', async () => {
    setLive(liveMatch([OPEN, ...ones(5)]));
    await renderScreen(<ScoringScreen />);
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, ...ones(6)]) });
    });
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, ...ones(6), 'nb']) });
    });
    expect(spoken()).toEqual([
      'One run. Lions 6 for 0, 1.0 overs. End of over 1. 6 runs from the over.',
      'No ball. Lions 7 for 0, 1.0 overs. Next ball is a free hit.',
    ]);
  });

  it('leaves an undo to its toast instead of announcing twice', async () => {
    setLive(liveMatch([OPEN, '1', '4']));
    await renderScreen(<ScoringScreen />);
    await act(async () => {
      useLiveMatchStore.setState({ live: liveMatch([OPEN, '1']) });
    });
    expect(spoken()).toEqual([]);
  });
});

describe('undo toast names what was undone (USER_FLOWS 2.6)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('names the ball and the batter for a wicket', async () => {
    setLive(liveMatch([OPEN, '1', 'W:b']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('prompt-next-batter-undo'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    expect(jest.mocked(useToastStore.getState().show).mock.calls[0][0].message).toBe('Undone: 0.2 · Wicket, bowled, Fakhar b Haris');
  });

  it('names a non-delivery action', async () => {
    setLive(liveMatch([OPEN, '1', 'sw']));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-undo'));
    await waitFor(() => expect(useToastStore.getState().show).toHaveBeenCalled());
    expect(jest.mocked(useToastStore.getState().show).mock.calls[0][0].message).toBe('Undone: strike swap');
  });
});

describe('sheet state and Law 16.6 follow-ups', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('keeps the no-ball when a run out off a winning no-ball is recorded without the wicket', async () => {
    const dispatch = jest.fn((intent: ScoringIntent) => {
      if (intent.type === 'wicket') {
        useLiveMatchStore.setState({
          error: { code: 'VALIDATION', message: 'The match was already won before this wicket.', domainCode: 'WICKET_AFTER_RESULT', detail: null },
        });
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    });
    setLive(liveMatch([OPEN, '1']), { dispatch });
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-btn-wicket'));
    await fireEvent.press(screen.getByTestId('wicket-call-no-ball'));
    await fireEvent.press(screen.getByTestId('wicket-btn-run_out'));
    await fireEvent.press(screen.getByTestId('wicket-runs-1'));
    await fireEvent.press(screen.getByTestId('wicket-btn-record'));
    await waitFor(() => expect(screen.getByTestId('wicket-btn-without')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('wicket-btn-without'));
    expect(dispatch.mock.calls[1][0]).toEqual(noBall({ runsTo: 'bat', runsRun: 1 }));
  });

  it('opens Retire on the striker after the advisory banner targeted someone else', async () => {
    const setup = m3Setup({ rules: { mandatoryRetirement: { atRuns: 8, mayReturn: true, timing: 'immediately' } } });
    const store = setLive(liveMatch([OPEN, '4', '4'], setup));
    await renderScreen(<ScoringScreen />);
    await fireEvent.press(screen.getByTestId('score-banner-retire'));
    expect(screen.getByTestId('retire-kind-retired_not_out')).toBeSelected();
    await fireEvent.press(screen.getByTestId('sheet-retire-btn-close'));
    await fireEvent.press(screen.getByTestId('score-row-non-striker'));
    expect(screen.getByTestId('retire-kind-retired_hurt')).toBeSelected();
    await fireEvent.press(screen.getByTestId('retire-submit'));
    expect(dispatched(store)).toEqual([{ type: 'retire', playerId: 'L1', retirement: 'retired_hurt', nextBatterId: 'L3' }]);
  });

  it('keeps CRR, the THIS OVER label and the powerplay line on a 320 pt phone with room for them', async () => {
    const restore = setWindow(320, 760);
    setLive(liveMatch([OPEN, '1']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-crr')).toBeOnTheScreen();
    expect(screen.getByText('THIS OVER')).toBeOnTheScreen();
    expect(screen.getByText('ECON')).toBeOnTheScreen();
    expect(screen.getByTestId('score-text-powerplay')).toBeOnTheScreen();
    await restore();
  });

  it('gives the bowler name the room of the economy figure only on a narrow phone with large text', () => {
    expect(showsEconomy(false, 2)).toBe(true);
    expect(showsEconomy(true, 1)).toBe(true);
    expect(showsEconomy(true, 1.15)).toBe(true);
    expect(showsEconomy(true, 1.3)).toBe(false);
  });

  it('keeps the partnership line to one line on a 320 pt phone so this over clears the dock', async () => {
    const restore = setWindow(320, 760);
    setLive(liveMatch([OPEN, '1', '4']));
    await renderScreen(<ScoringScreen />);
    expect(screen.getByTestId('score-text-context')).toHaveProp('numberOfLines', 1);
    await restore();
  });
});

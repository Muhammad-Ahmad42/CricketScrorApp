import { nextInningsPreview } from '../nextInnings';
import { m3Setup, playScript } from '../testing';
import { step } from './helpers';

const FIRST_INNINGS = ['start:L1:L2:T7', '1 4 wd 0 2 6 1', '@T8 0 W>L3 1 nb1 0 lb1 2', '@T7 1 1 1 1 1 1'];

describe('nextInningsPreview (wave-3 QA: the innings break never stated the target)', () => {
  const setup = m3Setup();
  const breakState = playScript(setup, FIRST_INNINGS).state;

  it('states the chase target and the overs before the second innings starts', () => {
    expect(breakState.pendingAction?.type).toBe('start_next_innings');
    const preview = nextInningsPreview(setup, breakState);
    const first = breakState.innings[0];
    expect(preview).toEqual({
      inningsIndex: 1,
      kind: 'regular',
      battingTeamId: first.bowlingTeamId,
      target: first.runs + 1,
      targetRevised: false,
      maxBalls: 18,
      startingRuns: 0,
      runsRequired: first.runs + 1,
      text: `Tigers need ${first.runs + 1} runs to win from 3 overs (target ${first.runs + 1}).`,
      headline: `Target ${first.runs + 1}`,
      detail: `Tigers need ${first.runs + 1} runs from 3 overs.`,
    });
  });

  it('uses a revised target and overs planned during the break', () => {
    const revised = step(setup, breakState, { type: 'revise_overs', inningsIndex: 1, overs: 1, target: 12, reason: 'Rain' });
    expect(nextInningsPreview(setup, revised)).toMatchObject({ target: 12, targetRevised: true, maxBalls: 6, runsRequired: 12, text: 'Tigers need 12 runs to win from 1 over (target 12, revised).', headline: 'Target 12 (revised)', detail: 'Tigers need 12 runs from 1 over.' });
  });

  it('is null while an innings is in progress', () => {
    const live = playScript(setup, ['start:L1:L2:T7', '1 4']).state;
    expect(nextInningsPreview(setup, live)).toBeNull();
  });
});

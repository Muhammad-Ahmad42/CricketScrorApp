import { listChase } from '../listChase';

describe('listChase', () => {
  it('works out runs and balls still needed for a chase in progress', () => {
    expect(listChase({ status: 'in_progress', target: 40, runs: 31, legalBalls: 22, maxBalls: 30 })).toEqual({ runsRequired: 9, ballsRemaining: 8 });
  });

  it('has nothing to say for a first innings or a finished innings', () => {
    expect(listChase({ status: 'in_progress', target: null, runs: 31, legalBalls: 22, maxBalls: 30 })).toBeNull();
    expect(listChase({ status: 'complete', target: 40, runs: 41, legalBalls: 25, maxBalls: 30 })).toBeNull();
  });

  it('never goes below zero once the target is passed or the balls run out', () => {
    expect(listChase({ status: 'in_progress', target: 40, runs: 42, legalBalls: 31, maxBalls: 30 })).toEqual({ runsRequired: 0, ballsRemaining: 0 });
  });
});

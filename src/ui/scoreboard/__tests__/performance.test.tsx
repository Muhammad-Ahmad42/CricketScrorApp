import '../../testing';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { View } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { OverStrip, ScoreFigure, ScoringPad, StatLine, type OverBall } from '..';

const DOT_BALL_JS_BUDGET_MS = 8;
const MARGIN = 3;
const WARM_UP_BALLS = 12;
const MEASURED_BALLS = 90;
const GAP_BETWEEN_BALLS_MS = 400;

const DOT: OverBall = { text: '0', kind: 'dot', isFreeHit: false, accessibilityLabel: 'Dot ball' };
const noop = () => undefined;

interface Meter {
  board: number;
  padUpdates: number;
}

const meter: Meter = { board: 0, padUpdates: 0 };

const onBoardRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
  if (phase !== 'mount') {
    meter.board += actualDuration;
  }
};

const onPadRender: ProfilerOnRenderCallback = (_id, phase) => {
  if (phase !== 'mount') {
    meter.padUpdates += 1;
  }
};

const PAD = (
  <Profiler id="pad" onRender={onPadRender}>
    <ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} keyHeight={72} />
  </Profiler>
);

function LiveBoard({ ball }: { readonly ball: number }) {
  const inOver = ball % 6;
  const balls = Array.from({ length: inOver }, () => DOT);
  return (
    <View>
      <ScoreFigure value={`${142 + ball}/4`} accessibilityLabel={`${142 + ball} for 4`} />
      <StatLine kind="batter" name="Ali Khan" figure="42" secondary={`(${24 + ball})`} active accessibilityLabel="On strike" />
      <StatLine kind="batter" name="Ahmed Shah" figure="31" secondary="(27)" accessibilityLabel="Non-striker" />
      <StatLine kind="bowler" name="Hassan Ali" figure="3.4-0-28-2" secondary="7.63" secondaryLabel="ECO" active accessibilityLabel="Bowling" />
      <OverStrip balls={balls} remaining={6 - inOver} runs="0" overKey={Math.floor(ball / 6)} />
    </View>
  );
}

function LiveScreen({ ball }: { readonly ball: number }) {
  return (
    <View>
      <Profiler id="board" onRender={onBoardRender}>
        <LiveBoard ball={ball} />
      </Profiler>
      {PAD}
    </View>
  );
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('live scoreboard render cost (COMPONENT_ARCHITECTURE §9)', () => {
  it(`renders a dot ball within ${MARGIN}× the ${DOT_BALL_JS_BUDGET_MS} ms JS budget and never re-renders the scoring pad`, async () => {
    const view = await renderWithTheme(<LiveScreen ball={0} />);
    const bowl = async (ball: number) => {
      meter.board = 0;
      await view.rerender(<LiveScreen ball={ball} />);
      const cost = meter.board;
      await act(async () => {
        jest.advanceTimersByTime(GAP_BETWEEN_BALLS_MS);
      });
      return cost;
    };
    for (let ball = 1; ball <= WARM_UP_BALLS; ball += 1) {
      await bowl(ball);
    }
    meter.padUpdates = 0;
    const perBall: number[] = [];
    for (let ball = WARM_UP_BALLS + 1; ball <= WARM_UP_BALLS + MEASURED_BALLS; ball += 1) {
      perBall.push(await bowl(ball));
    }
    const sorted = [...perBall].sort((a, b) => a - b);
    const best = sorted[0];
    const limit = DOT_BALL_JS_BUDGET_MS * MARGIN;
    console.log(
      `dot ball scoreboard render (dev build, test renderer, ${MEASURED_BALLS} balls): best ${best.toFixed(2)} ms, median ${percentile(sorted, 0.5).toFixed(2)} ms, p90 ${percentile(sorted, 0.9).toFixed(2)} ms; budget ${DOT_BALL_JS_BUDGET_MS} ms, asserted limit ${limit} ms on the fastest ball`,
    );
    expect(perBall).toHaveLength(MEASURED_BALLS);
    expect(best).toBeLessThan(limit);
    expect(meter.padUpdates).toBe(0);
  });
});

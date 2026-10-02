/** @jest-environment node */
import { applyEvent, replayMatch } from '../replay';
import { matchSetup, playedMatch } from '../testing';

function median(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('replay performance (U-RPL-12)', () => {
  const setup = matchSetup({ rules: { oversPerInnings: 50, maxOversPerBowler: 10 } });
  const match = playedMatch({ setup, first: { runs: 287, wickets: 7 }, second: { runs: 250, wickets: 9 } });

  it('replays a 50-over match of about 700 events well inside the budget', () => {
    expect(match.events.length).toBeGreaterThan(600);
    replayMatch(setup, match.events);
    const times: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      replayMatch(setup, match.events);
      times.push(performance.now() - started);
    }
    const measured = median(times);
    console.log(`replayMatch of ${match.events.length} events: median ${measured.toFixed(2)} ms`);
    expect(measured).toBeLessThan(150);
  });

  it('applies 1000 events incrementally well inside the budget', () => {
    const events = match.events.slice(0, 1000);
    const started = performance.now();
    let state = replayMatch(setup, []);
    for (const event of events) {
      state = applyEvent(setup, state, event);
    }
    const measured = performance.now() - started;
    console.log(`applyEvent x ${events.length}: ${measured.toFixed(2)} ms`);
    expect(state.issues).toEqual([]);
    expect(measured).toBeLessThan(150);
  });
});

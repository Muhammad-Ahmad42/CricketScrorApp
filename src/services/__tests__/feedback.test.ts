import { legBye, noBall, scoreRuns, wicket, wide, type ScoringIntent } from '@/domain/scoring';
import { m3Setup, ScriptRunner } from '@/domain/scoring/testing';
import type { MatchEvent, MatchState } from '@/domain/types';
import { cueForCommit, type FeedbackCue } from '../feedback/cues';
import { createScoringFeedback, hapticSteps, soundFor, type FeedbackPreferences, type HapticsDriver, type SoundDriver } from '../feedback/feedback';

function commit(intents: readonly ScoringIntent[]): { readonly state: MatchState; readonly appended: readonly MatchEvent[] } {
  const setup = m3Setup();
  const runner = new ScriptRunner(setup, { autoBatters: true, autoBowlers: true });
  runner.apply({ type: 'start_innings', strikerId: 'L1', nonStrikerId: 'L2', bowlerId: 'T7', battingTeamId: 'LIO' }, 'start');
  intents.slice(0, -1).forEach((intent, index) => runner.apply(intent, `#${index}`));
  const before = runner.result.events.length;
  runner.apply(intents[intents.length - 1], 'last');
  return { state: runner.result.state, appended: runner.result.events.slice(before) };
}

describe('feedback cues from committed events (§76)', () => {
  it.each<[string, readonly ScoringIntent[], FeedbackCue | null]>([
    ['dot ball', [scoreRuns(0)], null],
    ['single', [scoreRuns(1)], 'run'],
    ['four', [scoreRuns(4)], 'four'],
    ['six', [scoreRuns(6)], 'six'],
    ['wide', [wide()], 'run'],
    ['no-ball four', [noBall({ boundary: 4 })], 'four'],
    ['leg bye', [legBye(1)], 'run'],
    ['wicket with incoming batter', [wicket({ dismissal: 'bowled', nextBatterId: 'L3' })], 'wicket'],
    ['dot ending the over', [scoreRuns(1), scoreRuns(1), scoreRuns(1), scoreRuns(1), scoreRuns(1), scoreRuns(0)], 'over_end'],
  ])('%s', (_label, intents, expected) => {
    const { state, appended } = commit(intents);
    expect(cueForCommit(state, appended)).toBe(expected);
  });

  it('a match result and an off-ball dismissal have their own cues', () => {
    const { state } = commit([scoreRuns(1)]);
    const ended = { kind: 'match_ended', outcome: { type: 'abandoned', reason: null }, id: 'x', matchId: 'M1', seq: 99, actionId: 'a', recordedAt: '' } as const;
    expect(cueForCommit(state, [ended])).toBe('result');
    const dismissed = { kind: 'batter_dismissed', playerId: 'L1', type: 'timed_out', fielderIds: [], id: 'y', matchId: 'M1', seq: 99, actionId: 'a', recordedAt: '' } as const;
    expect(cueForCommit(state, [dismissed])).toBe('wicket');
    expect(cueForCommit(state, [])).toBeNull();
  });
});

describe('haptics and sound honour the settings (§76, §77)', () => {
  function drivers() {
    const calls: string[] = [];
    const haptics: HapticsDriver = {
      impact: async (strength) => {
        calls.push(`impact:${strength}`);
      },
      notification: async (type) => {
        calls.push(`notification:${type}`);
      },
      selection: async () => {
        calls.push('selection');
      },
    };
    const sound: SoundDriver = {
      play: (name) => {
        calls.push(`sound:${name}`);
      },
    };
    return { calls, haptics, sound };
  }

  it('maps every cue to the design-system table', () => {
    expect(hapticSteps('run')).toEqual([{ kind: 'impact', strength: 'light', delayMs: 0 }]);
    expect(hapticSteps('six')).toEqual([
      { kind: 'impact', strength: 'medium', delayMs: 0 },
      { kind: 'impact', strength: 'light', delayMs: 80 },
    ]);
    expect(hapticSteps('wicket')).toEqual([{ kind: 'impact', strength: 'heavy', delayMs: 0 }]);
    expect(hapticSteps('result')).toEqual([{ kind: 'notification', type: 'success', delayMs: 0 }]);
    expect(hapticSteps('error')).toEqual([{ kind: 'notification', type: 'error', delayMs: 0 }]);
    expect(hapticSteps('undo')).toEqual([{ kind: 'selection', delayMs: 0 }]);
    expect(hapticSteps('tab')).toEqual([{ kind: 'impact', strength: 'light', delayMs: 0 }]);
    expect(soundFor('tab')).toBeNull();
    expect([soundFor('run'), soundFor('four'), soundFor('six'), soundFor('wicket'), soundFor('result'), soundFor('undo')]).toEqual([
      'run',
      'boundary',
      'boundary',
      'wicket',
      'result',
      null,
    ]);
  });

  it('plays haptics and sound only when they are switched on', () => {
    const { calls, haptics, sound } = drivers();
    let preferences: FeedbackPreferences = { hapticsEnabled: true, soundEnabled: false };
    const scheduled: (() => void)[] = [];
    const feedback = createScoringFeedback({ haptics, sound, preferences: () => preferences, schedule: (task) => scheduled.push(task) });
    feedback.cue('six');
    expect(calls).toEqual(['impact:medium']);
    scheduled.forEach((task) => task());
    expect(calls).toEqual(['impact:medium', 'impact:light']);
    preferences = { hapticsEnabled: false, soundEnabled: true };
    feedback.cue('wicket');
    expect(calls).toEqual(['impact:medium', 'impact:light', 'sound:wicket']);
    preferences = { hapticsEnabled: false, soundEnabled: false };
    feedback.cue('result');
    expect(calls).toHaveLength(3);
  });

  it('never lets a failing device API break scoring', async () => {
    const feedback = createScoringFeedback({
      haptics: { impact: () => Promise.reject(new Error('no motor')), notification: () => Promise.reject(new Error('x')), selection: () => Promise.reject(new Error('x')) },
      sound: {
        play: () => {
          throw new Error('no audio');
        },
      },
      preferences: () => ({ hapticsEnabled: true, soundEnabled: true }),
    });
    expect(() => feedback.cue('run')).not.toThrow();
    await Promise.resolve();
  });
});

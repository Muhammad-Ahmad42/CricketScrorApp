import type { MatchRules } from '../../types';
import {
  BASE_MATCH_RULES,
  BUILTIN_FORMAT_PRESETS,
  DEFAULT_FORMAT_ID,
  OVERS_QUICK_PICKS,
  defaultMaxOversPerBowler,
  getBuiltinPreset,
  rulesForOvers,
  validateRules,
  type RulesIssueCode,
} from '../presets';

function codes(rules: MatchRules): readonly RulesIssueCode[] {
  return validateRules(rules).map((issue) => issue.code);
}

describe('presets (U-PRE)', () => {
  it('U-PRE-01 built-in lookup', () => {
    expect(getBuiltinPreset('T20')?.rules.oversPerInnings).toBe(20);
    expect(getBuiltinPreset('X')).toBeNull();
    expect(getBuiltinPreset(DEFAULT_FORMAT_ID)?.id).toBe('T20');
  });

  it('U-PRE-02 uniform quota default', () => {
    expect([1, 2, 5, 6, 17, 20, 50].map(defaultMaxOversPerBowler)).toEqual([1, 1, 1, 2, 4, 4, 10]);
  });

  it('U-PRE-03 custom 17 overs', () => {
    const rules = rulesForOvers(17);
    expect(rules).toEqual({ ...BASE_MATCH_RULES, oversPerInnings: 17, maxOversPerBowler: 4, powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 5 }] });
    expect(validateRules(rules)).toEqual([]);
  });

  it('U-PRE-04 one over', () => {
    expect(rulesForOvers(1)).toMatchObject({ maxOversPerBowler: 1, powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 1 }] });
  });

  it('rulesForOvers keeps a non-default quota and scales multi-phase powerplays without overlap', () => {
    const custom = { ...BASE_MATCH_RULES, maxOversPerBowler: 3 };
    expect(rulesForOvers(10, custom).maxOversPerBowler).toBe(3);
    const t50 = getBuiltinPreset('T50')?.rules ?? BASE_MATCH_RULES;
    const scaled = rulesForOvers(5, t50);
    expect(validateRules(scaled)).toEqual([]);
    expect(scaled.powerplays.map((phase) => [phase.fromOver, phase.toOver])).toEqual([
      [1, 1],
      [2, 4],
      [5, 5],
    ]);
    expect(rulesForOvers(20)).toBe(BASE_MATCH_RULES);
  });

  it('U-PRE-05 errors', () => {
    expect(codes({ ...BASE_MATCH_RULES, oversPerInnings: 0 })).toContain('OVERS_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, ballsPerOver: 13 })).toContain('BALLS_PER_OVER_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, playersPerSide: 1 })).toContain('PLAYERS_PER_SIDE_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, playersPerSide: 16 })).toContain('PLAYERS_PER_SIDE_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, wide: { penaltyRuns: -1, countsAsBall: false } })).toContain('PENALTY_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, powerplays: [{ name: 'PP', fromOver: 7, toOver: 6 }] })).toContain('POWERPLAY_INVALID');
    expect(
      codes({
        ...BASE_MATCH_RULES,
        powerplays: [
          { name: 'A', fromOver: 1, toOver: 6 },
          { name: 'B', fromOver: 5, toOver: 8 },
        ],
      }),
    ).toContain('POWERPLAY_OVERLAP');
    expect(codes({ ...BASE_MATCH_RULES, superOver: { ...BASE_MATCH_RULES.superOver, overs: 0 } })).toContain('SUPER_OVER_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, mandatoryRetirement: { atRuns: 0, mayReturn: true, timing: 'immediately' } })).toContain('RETIREMENT_INVALID');
    expect(codes({ ...BASE_MATCH_RULES, maxOversPerBowler: 0 })).toContain('BOWLER_QUOTA_INVALID');
    expect(validateRules({ ...BASE_MATCH_RULES, oversPerInnings: 0 }).every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('U-PRE-06 quota too low is a warning', () => {
    expect(validateRules({ ...BASE_MATCH_RULES, maxOversPerBowler: 1 })).toEqual([
      expect.objectContaining({ code: 'BOWLER_QUOTA_TOO_LOW', severity: 'warning' }),
    ]);
  });

  it('U-PRE-07 every built-in validates cleanly', () => {
    for (const preset of BUILTIN_FORMAT_PRESETS) {
      expect(validateRules(preset.rules)).toEqual([]);
    }
  });

  it('U-PRE-08 quick picks', () => {
    expect(OVERS_QUICK_PICKS).toEqual([1, 2, 5, 6, 10, 20, 25, 30, 40, 50]);
  });
});

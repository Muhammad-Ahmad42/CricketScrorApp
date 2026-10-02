/** @jest-environment node */
import { BASE_MATCH_RULES, BUILTIN_FORMAT_PRESETS } from '@/domain/scoring';
import type { FormatPreset, MatchRules } from '@/domain/types';
import { presetDetail, presetRows, presetSlug, presetSummary, ruleLines } from '../selectors/presets';

function rules(overrides: Partial<MatchRules>): MatchRules {
  return { ...BASE_MATCH_RULES, ...overrides };
}

describe('format preset view models (§8, W-X2)', () => {
  it('summarises every built-in in one line', () => {
    expect(presetRows(BUILTIN_FORMAT_PRESETS, 'T20').map((row) => [row.title, row.summary, row.isDefault, row.slug])).toEqual([
      ['T5', '5 overs · 11 a side · powerplay 1–2', false, 't5'],
      ['T10', '10 overs · 11 a side · powerplay 1–3', false, 't10'],
      ['T20', '20 overs · 11 a side · powerplay 1–6', true, 't20'],
      ['T30', '30 overs · 11 a side · powerplay 1–8', false, 't30'],
      ['T40', '40 overs · 11 a side · powerplay 1–8', false, 't40'],
      ['T50', '50 overs · 11 a side · 3 powerplays', false, 't50'],
    ]);
  });

  it('mentions non-standard overs, last man stands and single-over powerplays', () => {
    expect(presetSummary(rules({ oversPerInnings: 1, playersPerSide: 8, ballsPerOver: 8, lastManStands: true, powerplays: [{ name: 'PP', fromOver: 1, toOver: 1 }] }))).toBe(
      '1 over · 8 a side · 8-ball overs · powerplay 1 · last man stands',
    );
    expect(presetSummary(rules({ powerplays: [] }))).toBe('20 overs · 11 a side');
  });

  it('turns ids into E2E-safe slugs', () => {
    expect(presetSlug('T20')).toBe('t20');
    expect(presetSlug('Gully 8 (club)')).toBe('gully-8-club');
    expect(presetSlug('!!!')).toBe('preset');
  });

  it('lists every rule of a preset in plain words', () => {
    expect(ruleLines(BASE_MATCH_RULES).map((line) => `${line.label}: ${line.value}`)).toEqual([
      'Overs per innings: 20',
      'Balls per over: 6',
      'Players per side: 11',
      'Bowler limit: 4 overs each',
      'Same bowler twice in a row: Not allowed',
      'Wides: 1 run penalty, bowled again',
      'No-balls: 1 run penalty, bowled again, free hit',
      'Powerplays: Powerplay: overs 1–6',
      'Super over: 1 over, 2 wickets; if tied again, another super over',
      'Last man stands: Off',
      'Retirement: None',
    ]);
  });

  it('covers the alternative rule settings', () => {
    const custom = rules({
      maxOversPerBowler: null,
      allowBowlerConsecutiveOvers: true,
      wide: { penaltyRuns: 0, countsAsBall: true },
      noBall: { penaltyRuns: 2, freeHit: false, countsAsBall: true },
      powerplays: [],
      superOver: { ...BASE_MATCH_RULES.superOver, enabled: false },
      lastManStands: true,
      mandatoryRetirement: { atRuns: 30, mayReturn: true, timing: 'end_of_over' },
    });
    const byKey = Object.fromEntries(ruleLines(custom).map((line) => [line.key, line.value]));
    expect(byKey).toMatchObject({
      bowler: 'No limit',
      consecutive: 'Allowed',
      wide: 'No penalty run, counts as a ball',
      noBall: '2 runs penalty, counts as a ball, no free hit',
      powerplays: 'None',
      superOver: 'Off',
      lastManStands: 'On',
      retirement: 'At 30 runs, at the end of the over, may bat again',
    });
    const icc = Object.fromEntries(
      ruleLines(
        rules({
          bowlerQuotaMode: 'icc_one_fifth',
          mandatoryRetirement: { atRuns: 1, mayReturn: false, timing: 'immediately' },
          superOver: { ...BASE_MATCH_RULES.superOver, overs: 2, maxWickets: 1, ifTiedAgain: 'boundary_count' },
        }),
      ).map((line) => [line.key, line.value]),
    );
    expect(icc.bowler).toBe('One fifth of the overs each');
    expect(icc.retirement).toBe('At 1 run, at once');
    expect(icc.superOver).toBe('2 overs, 1 wicket; if tied again, most boundaries wins');
    const stands = ruleLines(rules({ superOver: { ...BASE_MATCH_RULES.superOver, ifTiedAgain: 'tie_stands' } })).find((line) => line.key === 'superOver');
    expect(stands?.value).toBe('1 over, 2 wickets; if tied again, the tie stands');
  });

  it('builds the read-only detail of a built-in', () => {
    const t10 = BUILTIN_FORMAT_PRESETS.find((preset) => preset.id === 'T10') as FormatPreset;
    const detail = presetDetail(t10, 'T20');
    expect(detail).toMatchObject({ id: 'T10', title: 'T10', description: '10 overs a side', isDefault: false, builtin: true });
    expect(detail.rules[0]).toEqual({ key: 'overs', label: 'Overs per innings', value: '10' });
    expect(presetDetail(t10, 'T10').isDefault).toBe(true);
  });
});

import type { BuiltinFormatId, FormatId, FormatPreset, MatchRules, PowerplayRule } from '../types';
import { isInt } from './internal/guards';

export const BASE_MATCH_RULES: MatchRules = {
  oversPerInnings: 20,
  ballsPerOver: 6,
  playersPerSide: 11,
  lastManStands: false,
  maxOversPerBowler: 4,
  bowlerQuotaMode: 'uniform',
  allowBowlerConsecutiveOvers: false,
  wide: { penaltyRuns: 1, countsAsBall: false },
  noBall: { penaltyRuns: 1, freeHit: true, countsAsBall: false },
  powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 6 }],
  superOver: { enabled: true, overs: 1, maxWickets: 2, ifTiedAgain: 'repeat', maxRounds: null, restrictRepeatPlayers: true },
  mandatoryRetirement: null,
};

function presetRules(oversPerInnings: number, maxOversPerBowler: number, powerplays: readonly PowerplayRule[]): MatchRules {
  return { ...BASE_MATCH_RULES, oversPerInnings, maxOversPerBowler, powerplays };
}

export const BUILTIN_FORMAT_PRESETS: readonly FormatPreset[] = [
  {
    id: 'T5',
    label: 'T5',
    description: '5 overs a side',
    builtin: true,
    rules: presetRules(5, 1, [{ name: 'Powerplay', fromOver: 1, toOver: 2 }]),
  },
  {
    id: 'T10',
    label: 'T10',
    description: '10 overs a side',
    builtin: true,
    rules: presetRules(10, 2, [{ name: 'Powerplay', fromOver: 1, toOver: 3 }]),
  },
  {
    id: 'T20',
    label: 'T20',
    description: '20 overs a side',
    builtin: true,
    rules: presetRules(20, 4, [{ name: 'Powerplay', fromOver: 1, toOver: 6 }]),
  },
  {
    id: 'T30',
    label: 'T30',
    description: '30 overs a side',
    builtin: true,
    rules: presetRules(30, 6, [{ name: 'Powerplay', fromOver: 1, toOver: 8 }]),
  },
  {
    id: 'T40',
    label: 'T40',
    description: '40 overs a side',
    builtin: true,
    rules: presetRules(40, 8, [{ name: 'Powerplay', fromOver: 1, toOver: 8 }]),
  },
  {
    id: 'T50',
    label: 'T50',
    description: '50 overs a side',
    builtin: true,
    rules: presetRules(50, 10, [
      { name: 'Powerplay 1', fromOver: 1, toOver: 10 },
      { name: 'Powerplay 2', fromOver: 11, toOver: 40 },
      { name: 'Powerplay 3', fromOver: 41, toOver: 50 },
    ]),
  },
];

export const DEFAULT_FORMAT_ID: BuiltinFormatId = 'T20';

export const OVERS_QUICK_PICKS: readonly number[] = [1, 2, 5, 6, 10, 20, 25, 30, 40, 50];

export function getBuiltinPreset(id: FormatId): FormatPreset | null {
  return BUILTIN_FORMAT_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function defaultMaxOversPerBowler(oversPerInnings: number): number {
  return Math.max(1, Math.ceil(oversPerInnings / 5));
}

function scalePowerplays(phases: readonly PowerplayRule[], from: number, to: number): readonly PowerplayRule[] {
  const scaled: PowerplayRule[] = [];
  let previousEnd = 0;
  for (const phase of phases) {
    const start = Math.max(1, previousEnd + 1, Math.round((phase.fromOver * to) / from));
    const end = Math.min(to, Math.max(1, Math.round((phase.toOver * to) / from)));
    if (start <= end) {
      scaled.push({ ...phase, fromOver: start, toOver: end });
      previousEnd = end;
    }
  }
  return scaled;
}

export function rulesForOvers(oversPerInnings: number, base?: MatchRules): MatchRules {
  const source = base ?? BASE_MATCH_RULES;
  if (source.oversPerInnings === oversPerInnings) {
    return source;
  }
  const usesOneFifth = source.maxOversPerBowler === defaultMaxOversPerBowler(source.oversPerInnings);
  return {
    ...source,
    oversPerInnings,
    maxOversPerBowler: usesOneFifth ? defaultMaxOversPerBowler(oversPerInnings) : source.maxOversPerBowler,
    powerplays: scalePowerplays(source.powerplays, source.oversPerInnings, oversPerInnings),
  };
}

export type RulesIssueCode =
  | 'OVERS_INVALID'
  | 'BALLS_PER_OVER_INVALID'
  | 'PLAYERS_PER_SIDE_INVALID'
  | 'BOWLER_QUOTA_INVALID'
  | 'BOWLER_QUOTA_TOO_LOW'
  | 'PENALTY_INVALID'
  | 'POWERPLAY_INVALID'
  | 'POWERPLAY_OVERLAP'
  | 'SUPER_OVER_INVALID'
  | 'RETIREMENT_INVALID';

export interface RulesIssue {
  readonly code: RulesIssueCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

function error(code: RulesIssueCode, message: string): RulesIssue {
  return { code, severity: 'error', message };
}

function powerplayIssues(rules: MatchRules): readonly RulesIssue[] {
  const issues: RulesIssue[] = [];
  const valid = rules.powerplays.every(
    (phase) =>
      phase.name.trim().length > 0 &&
      isInt(phase.fromOver) &&
      isInt(phase.toOver) &&
      phase.fromOver >= 1 &&
      phase.toOver >= phase.fromOver &&
      phase.toOver <= rules.oversPerInnings,
  );
  if (!valid) {
    issues.push(error('POWERPLAY_INVALID', 'Each powerplay needs a name and a first and last over within the innings.'));
    return issues;
  }
  const sorted = rules.powerplays.slice().sort((a, b) => a.fromOver - b.fromOver);
  if (sorted.some((phase, index) => index > 0 && phase.fromOver <= sorted[index - 1].toOver)) {
    issues.push(error('POWERPLAY_OVERLAP', 'Powerplays must not overlap.'));
  }
  return issues;
}

function quotaIssues(rules: MatchRules): readonly RulesIssue[] {
  if (rules.maxOversPerBowler !== null && (!isInt(rules.maxOversPerBowler) || rules.maxOversPerBowler < 1)) {
    return [error('BOWLER_QUOTA_INVALID', 'Overs per bowler must be at least 1, or unlimited.')];
  }
  if (rules.bowlerQuotaMode !== 'uniform' && rules.bowlerQuotaMode !== 'icc_one_fifth') {
    return [error('BOWLER_QUOTA_INVALID', 'Choose how the bowler limit is applied.')];
  }
  const perBowler =
    rules.bowlerQuotaMode === 'icc_one_fifth' ? Math.max(1, Math.floor(rules.oversPerInnings / 5)) + 1 : rules.maxOversPerBowler;
  if (perBowler !== null && perBowler * rules.playersPerSide < rules.oversPerInnings) {
    return [
      {
        code: 'BOWLER_QUOTA_TOO_LOW',
        severity: 'warning',
        message: 'With this limit per bowler the fielding side cannot bowl all the overs.',
      },
    ];
  }
  return [];
}

export function validateRules(rules: MatchRules): readonly RulesIssue[] {
  const issues: RulesIssue[] = [];
  if (!isInt(rules.oversPerInnings) || rules.oversPerInnings < 1) {
    issues.push(error('OVERS_INVALID', 'Overs per innings must be a whole number of at least 1.'));
  }
  if (!isInt(rules.ballsPerOver) || rules.ballsPerOver < 1 || rules.ballsPerOver > 12) {
    issues.push(error('BALLS_PER_OVER_INVALID', 'Balls per over must be from 1 to 12.'));
  }
  if (!isInt(rules.playersPerSide) || rules.playersPerSide < 2 || rules.playersPerSide > 15) {
    issues.push(error('PLAYERS_PER_SIDE_INVALID', 'Players per side must be from 2 to 15.'));
  }
  for (const penalty of [rules.wide.penaltyRuns, rules.noBall.penaltyRuns]) {
    if (!isInt(penalty) || penalty < 0 || penalty > 10) {
      issues.push(error('PENALTY_INVALID', 'Wide and no-ball runs must be from 0 to 10.'));
      break;
    }
  }
  const superOver = rules.superOver;
  if (
    !isInt(superOver.overs) ||
    superOver.overs < 1 ||
    !isInt(superOver.maxWickets) ||
    superOver.maxWickets < 1 ||
    (superOver.maxRounds !== null && (!isInt(superOver.maxRounds) || superOver.maxRounds < 1))
  ) {
    issues.push(error('SUPER_OVER_INVALID', 'Super over overs, wickets and rounds must be at least 1.'));
  }
  const retirement = rules.mandatoryRetirement;
  if (retirement !== null && (!isInt(retirement.atRuns) || retirement.atRuns < 1)) {
    issues.push(error('RETIREMENT_INVALID', 'Retirement runs must be a whole number of at least 1.'));
  }
  issues.push(...powerplayIssues(rules));
  if (issues.every((issue) => issue.code !== 'OVERS_INVALID' && issue.code !== 'PLAYERS_PER_SIDE_INVALID')) {
    issues.push(...quotaIssues(rules));
  } else if (rules.maxOversPerBowler !== null && (!isInt(rules.maxOversPerBowler) || rules.maxOversPerBowler < 1)) {
    issues.push(error('BOWLER_QUOTA_INVALID', 'Overs per bowler must be at least 1, or unlimited.'));
  }
  return issues;
}

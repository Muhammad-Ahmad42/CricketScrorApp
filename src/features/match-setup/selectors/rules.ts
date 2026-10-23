import type { MatchRules } from '@/domain/types';
import { validateRules, type RulesIssue } from '@/domain/scoring/presets';

export type RuleKey =
  | 'players'
  | 'ballsPerOver'
  | 'bowlerMax'
  | 'bowlerQuota'
  | 'consecutive'
  | 'wide'
  | 'noBall'
  | 'powerplay'
  | 'superOver'
  | 'lastManStands'
  | 'retirement';

export const RULE_KEYS: readonly RuleKey[] = [
  'players',
  'ballsPerOver',
  'bowlerMax',
  'bowlerQuota',
  'consecutive',
  'wide',
  'noBall',
  'powerplay',
  'superOver',
  'lastManStands',
  'retirement',
];

export const RULE_TITLE: { readonly [K in RuleKey]: string } = {
  players: 'Players per side',
  ballsPerOver: 'Balls per over',
  bowlerMax: 'Max overs per bowler',
  bowlerQuota: 'Bowler quota',
  consecutive: 'Consecutive overs',
  wide: 'Wides',
  noBall: 'No-balls',
  powerplay: 'Powerplay',
  superOver: 'Super over',
  lastManStands: 'Last man stands',
  retirement: 'Mandatory retirement',
};

function runs(value: number): string {
  return `${value} ${value === 1 ? 'run' : 'runs'}`;
}

export const QUOTA_LABEL: { readonly [K in MatchRules['bowlerQuotaMode']]: string } = {
  uniform: 'Same for all',
  icc_one_fifth: 'ICC one-fifth',
};

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

export function ruleValue(key: RuleKey, rules: MatchRules): string {
  switch (key) {
    case 'players':
      return `${rules.playersPerSide}`;
    case 'ballsPerOver':
      return `${rules.ballsPerOver}`;
    case 'bowlerMax':
      return rules.maxOversPerBowler === null ? 'No limit' : `${rules.maxOversPerBowler}`;
    case 'bowlerQuota':
      return QUOTA_LABEL[rules.bowlerQuotaMode];
    case 'consecutive':
      return rules.allowBowlerConsecutiveOvers ? 'Allowed' : 'Not allowed';
    case 'wide':
      return `${runs(rules.wide.penaltyRuns)}${rules.wide.countsAsBall ? ', counts' : ''}`;
    case 'noBall':
      return `${runs(rules.noBall.penaltyRuns)}${rules.noBall.freeHit ? ', free hit' : ''}${rules.noBall.countsAsBall ? ', counts' : ''}`;
    case 'powerplay': {
      const phases = rules.powerplays;
      if (phases.length === 0) {
        return 'None';
      }
      if (phases.length > 1) {
        return plural(phases.length, 'phase', 'phases');
      }
      const [phase] = phases;
      return phase.fromOver === phase.toOver ? `Over ${phase.fromOver}` : `Overs ${phase.fromOver}–${phase.toOver}`;
    }
    case 'superOver':
      return rules.superOver.enabled ? plural(rules.superOver.overs, 'over', 'overs') : 'Off';
    case 'lastManStands':
      return rules.lastManStands ? 'On' : 'Off';
    case 'retirement':
      return rules.mandatoryRetirement === null ? 'Off' : `At ${rules.mandatoryRetirement.atRuns}`;
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

export function rulesIssues(rules: MatchRules): readonly RulesIssue[] {
  return validateRules(rules);
}

export function hasBlockingIssue(issues: readonly RulesIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

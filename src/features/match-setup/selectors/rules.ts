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

export function ruleValue(key: RuleKey, rules: MatchRules): string {
  switch (key) {
    case 'players':
      return `${rules.playersPerSide}`;
    case 'ballsPerOver':
      return `${rules.ballsPerOver}`;
    case 'bowlerMax':
      return rules.maxOversPerBowler === null ? 'No limit' : `${rules.maxOversPerBowler}`;
    case 'bowlerQuota':
      return rules.bowlerQuotaMode === 'uniform' ? 'Same for everyone' : 'ICC one-fifth';
    case 'consecutive':
      return rules.allowBowlerConsecutiveOvers ? 'Allowed' : 'Not allowed';
    case 'wide':
      return `${runs(rules.wide.penaltyRuns)}, ${rules.wide.countsAsBall ? 'counts as a ball' : 'bowled again'}`;
    case 'noBall':
      return `${runs(rules.noBall.penaltyRuns)}, ${rules.noBall.freeHit ? 'free hit' : 'no free hit'}${rules.noBall.countsAsBall ? ', counts as a ball' : ''}`;
    case 'powerplay':
      return rules.powerplays.length === 0 ? 'None' : rules.powerplays.map((phase) => `Overs ${phase.fromOver}–${phase.toOver}`).join(', ');
    case 'superOver':
      return rules.superOver.enabled ? `${rules.superOver.overs} over, ${rules.superOver.maxWickets} wickets` : 'Off';
    case 'lastManStands':
      return rules.lastManStands ? 'On' : 'Off';
    case 'retirement':
      return rules.mandatoryRetirement === null
        ? 'Off'
        : `At ${rules.mandatoryRetirement.atRuns}${rules.mandatoryRetirement.mayReturn ? ', may return' : ''}`;
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

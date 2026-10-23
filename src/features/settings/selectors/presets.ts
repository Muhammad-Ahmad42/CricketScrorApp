import type { FormatId, FormatPreset, MatchRules, NoBallRule, PowerplayRule, SuperOverRule, WideRule } from '@/domain/types';
import { countOf } from './text';

export interface PresetRowVM {
  readonly id: FormatId;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly isDefault: boolean;
}

export interface RuleLineVM {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface PresetDetailVM {
  readonly id: FormatId;
  readonly title: string;
  readonly description: string;
  readonly isDefault: boolean;
  readonly builtin: boolean;
  readonly rules: readonly RuleLineVM[];
}

const OVERS = { one: 'over', many: 'overs' } as const;
const RUNS = { one: 'run', many: 'runs' } as const;
const WICKETS = { one: 'wicket', many: 'wickets' } as const;

export function presetSlug(id: FormatId): string {
  const slug = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'preset';
}

function overRange(rule: PowerplayRule): string {
  return rule.fromOver === rule.toOver ? `${rule.fromOver}` : `${rule.fromOver}–${rule.toOver}`;
}

export function presetSummary(rules: MatchRules): string {
  const parts = [countOf(rules.oversPerInnings, OVERS), `${rules.playersPerSide} a side`];
  if (rules.ballsPerOver !== 6) {
    parts.push(`${rules.ballsPerOver}-ball overs`);
  }
  if (rules.powerplays.length === 1) {
    parts.push(`powerplay ${overRange(rules.powerplays[0])}`);
  } else if (rules.powerplays.length > 1) {
    parts.push(`${rules.powerplays.length} powerplays`);
  }
  if (rules.lastManStands) {
    parts.push('last man stands');
  }
  return parts.join(' · ');
}

function extraText(rule: WideRule | NoBallRule): string {
  const penalty = rule.penaltyRuns > 0 ? `${countOf(rule.penaltyRuns, RUNS)} penalty` : 'No penalty run';
  const ball = rule.countsAsBall ? 'counts as a ball' : 'bowled again';
  return `${penalty}, ${ball}`;
}

function noBallText(rule: NoBallRule): string {
  return `${extraText(rule)}, ${rule.freeHit ? 'free hit' : 'no free hit'}`;
}

function bowlerLimitText(rules: MatchRules): string {
  if (rules.bowlerQuotaMode === 'icc_one_fifth') {
    return 'One fifth of the overs each';
  }
  return rules.maxOversPerBowler === null ? 'No limit' : `${countOf(rules.maxOversPerBowler, OVERS)} each`;
}

function overSpan(rule: PowerplayRule): string {
  return rule.fromOver === rule.toOver ? `over ${rule.fromOver}` : `overs ${overRange(rule)}`;
}

function powerplayText(rules: MatchRules): string {
  const [only] = rules.powerplays;
  if (!only) {
    return 'None';
  }
  if (rules.powerplays.length === 1 && only.name.trim().toLowerCase() === 'powerplay') {
    const span = overSpan(only);
    return span.charAt(0).toUpperCase() + span.slice(1);
  }
  return rules.powerplays.map((rule) => `${rule.name}: ${overSpan(rule)}`).join('; ');
}

function tieAgainText(rule: SuperOverRule): string {
  switch (rule.ifTiedAgain) {
    case 'repeat':
      return 'another super over';
    case 'boundary_count':
      return 'most boundaries wins';
    case 'tie_stands':
      return 'the tie stands';
    default: {
      const unreachable: never = rule.ifTiedAgain;
      return unreachable;
    }
  }
}

function superOverText(rule: SuperOverRule): string {
  if (!rule.enabled) {
    return 'Off';
  }
  return `${countOf(rule.overs, OVERS)}, ${countOf(rule.maxWickets, WICKETS)}; if tied again, ${tieAgainText(rule)}`;
}

function retirementText(rules: MatchRules): string {
  const rule = rules.mandatoryRetirement;
  if (!rule) {
    return 'None';
  }
  const timing = rule.timing === 'end_of_over' ? 'at the end of the over' : 'at once';
  return `At ${countOf(rule.atRuns, RUNS)}, ${timing}${rule.mayReturn ? ', may bat again' : ''}`;
}

export function ruleLines(rules: MatchRules): readonly RuleLineVM[] {
  return [
    { key: 'overs', label: 'Overs per innings', value: String(rules.oversPerInnings) },
    { key: 'balls', label: 'Balls per over', value: String(rules.ballsPerOver) },
    { key: 'players', label: 'Players per side', value: String(rules.playersPerSide) },
    { key: 'bowler', label: 'Bowler limit', value: bowlerLimitText(rules) },
    { key: 'consecutive', label: 'Consecutive overs', value: rules.allowBowlerConsecutiveOvers ? 'Allowed' : 'Not allowed' },
    { key: 'wide', label: 'Wides', value: extraText(rules.wide) },
    { key: 'noBall', label: 'No-balls', value: noBallText(rules.noBall) },
    { key: 'powerplays', label: 'Powerplays', value: powerplayText(rules) },
    { key: 'superOver', label: 'Super over', value: superOverText(rules.superOver) },
    { key: 'lastManStands', label: 'Last man stands', value: rules.lastManStands ? 'On' : 'Off' },
    { key: 'retirement', label: 'Retirement', value: retirementText(rules) },
  ];
}

export function presetRows(presets: readonly FormatPreset[], defaultFormatId: FormatId): readonly PresetRowVM[] {
  return presets.map((preset) => ({
    id: preset.id,
    slug: presetSlug(preset.id),
    title: preset.label,
    summary: presetSummary(preset.rules),
    isDefault: preset.id === defaultFormatId,
  }));
}

export function presetDetail(preset: FormatPreset, defaultFormatId: FormatId): PresetDetailVM {
  return {
    id: preset.id,
    title: preset.label,
    description: preset.description,
    isDefault: preset.id === defaultFormatId,
    builtin: preset.builtin,
    rules: ruleLines(preset.rules),
  };
}

export interface WideRule {
  readonly penaltyRuns: number;
  readonly countsAsBall: boolean;
}

export interface NoBallRule {
  readonly penaltyRuns: number;
  readonly freeHit: boolean;
  readonly countsAsBall: boolean;
}

export interface PowerplayRule {
  readonly name: string;
  readonly fromOver: number;
  readonly toOver: number;
}

export type SuperOverTieBreak =
  | 'repeat'
  | 'boundary_count'
  | 'tie_stands';

export interface SuperOverRule {
  readonly enabled: boolean;
  readonly overs: number;
  readonly maxWickets: number;
  readonly ifTiedAgain: SuperOverTieBreak;
  readonly maxRounds: number | null;
  readonly restrictRepeatPlayers: boolean;
}

export interface MandatoryRetirementRule {
  readonly atRuns: number;
  readonly mayReturn: boolean;
  readonly timing: 'immediately' | 'end_of_over';
}

export type BowlerQuotaMode = 'uniform' | 'icc_one_fifth';

export interface MatchRules {
  readonly oversPerInnings: number;
  readonly ballsPerOver: number;
  readonly playersPerSide: number;
  readonly lastManStands: boolean;
  readonly maxOversPerBowler: number | null;
  readonly bowlerQuotaMode: BowlerQuotaMode;
  readonly allowBowlerConsecutiveOvers: boolean;
  readonly wide: WideRule;
  readonly noBall: NoBallRule;
  readonly powerplays: readonly PowerplayRule[];
  readonly superOver: SuperOverRule;
  readonly mandatoryRetirement: MandatoryRetirementRule | null;
}

export const BUILTIN_FORMAT_IDS = ['T5', 'T10', 'T20', 'T30', 'T40', 'T50'] as const;
export type BuiltinFormatId = (typeof BUILTIN_FORMAT_IDS)[number];
export type FormatId = BuiltinFormatId | 'custom' | (string & {});

export interface FormatPreset {
  readonly id: FormatId;
  readonly label: string;
  readonly description: string;
  readonly builtin: boolean;
  readonly rules: MatchRules;
}

export function isReBowled(rule: WideRule | NoBallRule): boolean {
  return !rule.countsAsBall;
}

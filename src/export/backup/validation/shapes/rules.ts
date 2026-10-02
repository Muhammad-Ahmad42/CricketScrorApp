import { TIE_BREAKER_KINDS } from '@/domain/types';
import type {
  BonusPointRule,
  KnockoutConfig,
  MandatoryRetirementRule,
  MatchRules,
  NoBallRule,
  NrrConfig,
  PointsSystem,
  PowerplayRule,
  SuperOverRule,
  TieBreakerKind,
  UnevenPoolNormalization,
  WalkoverNrrPolicy,
  WideRule,
} from '@/domain/types';
import { arrayOf, bool, discriminated, finiteNumber, integer, literal, nonEmptyText, nullable, object, refine, type Guard } from '../guards';

const wideRule = object<WideRule>({ penaltyRuns: integer(0, 9), countsAsBall: bool });

const noBallRule = object<NoBallRule>({ penaltyRuns: integer(0, 9), freeHit: bool, countsAsBall: bool });

export const powerplayRule: Guard<PowerplayRule> = refine(
  object<PowerplayRule>({ name: nonEmptyText, fromOver: integer(1), toOver: integer(1) }),
  (rule) => (rule.toOver >= rule.fromOver ? null : 'A powerplay must end in the same over or after the over it starts in.'),
);

const superOverRule = object<SuperOverRule>({
  enabled: bool,
  overs: integer(1),
  maxWickets: integer(1),
  ifTiedAgain: literal('repeat', 'boundary_count', 'tie_stands'),
  maxRounds: nullable(integer(1)),
  restrictRepeatPlayers: bool,
});

const mandatoryRetirement = object<MandatoryRetirementRule>({
  atRuns: integer(1),
  mayReturn: bool,
  timing: literal('immediately', 'end_of_over'),
});

export const bowlerQuotaMode = literal('uniform', 'icc_one_fifth');

export const matchRules = object<MatchRules>({
  oversPerInnings: integer(1),
  ballsPerOver: integer(1, 12),
  playersPerSide: integer(2, 15),
  lastManStands: bool,
  maxOversPerBowler: nullable(integer(1)),
  bowlerQuotaMode,
  allowBowlerConsecutiveOvers: bool,
  wide: wideRule,
  noBall: noBallRule,
  powerplays: arrayOf(powerplayRule),
  superOver: superOverRule,
  mandatoryRetirement: nullable(mandatoryRetirement),
});

const bonusPointRule = object<BonusPointRule>({
  kind: literal('run_rate_ratio'),
  ratio: finiteNumber(0),
  points: integer(),
});

export const pointsSystem = object<PointsSystem>({
  win: integer(),
  tie: integer(),
  noResult: integer(),
  loss: integer(),
  abandoned: nullable(integer()),
  walkoverWin: nullable(integer()),
  walkoverLoss: nullable(integer()),
  superOverDecidedTie: literal('win_loss', 'tie'),
  bonus: nullable(bonusPointRule),
});

const walkoverNrrPolicy = discriminated<WalkoverNrrPolicy, 'kind'>('kind', {
  exclude: object<Extract<WalkoverNrrPolicy, { readonly kind: 'exclude' }>>({ kind: literal('exclude') }),
  notional: object<Extract<WalkoverNrrPolicy, { readonly kind: 'notional' }>>({
    kind: literal('notional'),
    winnerRuns: integer(0),
    winnerBalls: integer(0),
    loserRuns: integer(0),
    loserBalls: integer(0),
  }),
});

export const nrrConfig = object<NrrConfig>({
  mode: literal('icc', 'actual_overs'),
  includeNoResult: bool,
  includeAbandoned: bool,
  walkover: walkoverNrrPolicy,
  awarded: literal('exclude', 'use_played_innings'),
  revisedTarget: literal('icc_par', 'actual'),
});

export const tieBreakerKind: Guard<TieBreakerKind> = literal(...TIE_BREAKER_KINDS);

export const tieBreakers = arrayOf(tieBreakerKind);

export const normalization: Guard<UnevenPoolNormalization> = literal('raw', 'per_match_average', 'drop_extra_results');

export const knockoutConfig = object<KnockoutConfig>({
  thirdPlacePlayoff: bool,
  rounds: nullable(integer(1)),
  tiedMatch: literal('super_over', 'boundary_count', 'higher_seed', 'organizer'),
  noResult: literal('higher_seed', 'replay', 'organizer', 'shared'),
});

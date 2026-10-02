import { PLAYER_ROLES, STAGE_TYPES } from '@/domain/types';
import type {
  AppSettings,
  FixtureGenerationConfig,
  FormatPreset,
  Player,
  ScoringPreferences,
  Team,
  TemplateEntryRule,
  TemplateStage,
  TournamentStructureKind,
  TournamentTemplate,
  Venue,
} from '@/domain/types';
import {
  arrayOf,
  bool,
  discriminated,
  idText,
  integer,
  isoDateTime,
  literal,
  nonEmptyText,
  nullable,
  object,
  optional,
  text,
  textOfLength,
  type Guard,
} from '../guards';
import { knockoutConfig, matchRules, normalization, nrrConfig, pointsSystem, tieBreakers } from './rules';

export const venueShape = object<Venue>({
  id: idText,
  name: nonEmptyText,
  location: nullable(text),
  notes: nullable(text),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  archivedAt: nullable(isoDateTime),
});

export const teamShape = object<Team>({
  id: idText,
  name: nonEmptyText,
  shortName: textOfLength(1, 5),
  logoUri: nullable(text),
  captainId: nullable(idText),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  archivedAt: nullable(isoDateTime),
});

export const playerShape = object<Player>({
  id: idText,
  teamId: idText,
  name: nonEmptyText,
  jerseyNumber: nullable(integer(0, 999)),
  role: literal(...PLAYER_ROLES),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  archivedAt: nullable(isoDateTime),
});

export const formatPresetShape = object<FormatPreset>({
  id: idText,
  label: nonEmptyText,
  description: text,
  builtin: bool,
  rules: matchRules,
});

export const structureKind: Guard<TournamentStructureKind> = literal('league', 'groups', 'knockout', 'groups_knockout', 'custom');

export const fixtureGeneration = object<FixtureGenerationConfig>({
  method: literal('round_robin', 'manual', 'knockout'),
  legs: integer(1),
});

export const seedingMethod = literal('fixed', 'random', 'ranking');

type TemplateRuleOf<K extends TemplateEntryRule['kind']> = Extract<TemplateEntryRule, { readonly kind: K }>;

const templateEntryRule = discriminated<TemplateEntryRule, 'kind'>('kind', {
  top_per_pool: object<TemplateRuleOf<'top_per_pool'>>({
    kind: literal('top_per_pool'),
    sourceStageKey: nonEmptyText,
    count: integer(1),
    fromPosition: integer(1),
  }),
  pool_position: object<TemplateRuleOf<'pool_position'>>({
    kind: literal('pool_position'),
    sourceStageKey: nonEmptyText,
    poolIndex: integer(0),
    position: integer(1),
  }),
  best_of_position: object<TemplateRuleOf<'best_of_position'>>({
    kind: literal('best_of_position'),
    sourceStageKey: nonEmptyText,
    position: integer(1),
    count: integer(1),
    normalization,
  }),
  top_overall: object<TemplateRuleOf<'top_overall'>>({
    kind: literal('top_overall'),
    sourceStageKey: nonEmptyText,
    count: integer(1),
    normalization,
  }),
  knockout_winners: object<TemplateRuleOf<'knockout_winners'>>({ kind: literal('knockout_winners'), sourceStageKey: nonEmptyText }),
  manual: object<TemplateRuleOf<'manual'>>({ kind: literal('manual'), count: integer(1), label: nonEmptyText }),
  direct_entry: object<TemplateRuleOf<'direct_entry'>>({ kind: literal('direct_entry'), count: integer(1) }),
});

const templateStage = object<TemplateStage>({
  key: nonEmptyText,
  name: nonEmptyText,
  type: literal(...STAGE_TYPES),
  poolCount: integer(0),
  poolSizes: nullable(arrayOf(integer(0))),
  poolSlotIndexes: nullable(arrayOf(arrayOf(integer(0)))),
  fixtureGeneration,
  seeding: seedingMethod,
  seedingNormalization: normalization,
  entry: arrayOf(templateEntryRule),
  knockout: nullable(knockoutConfig),
  abandonedMatches: literal('no_result', 'replay'),
  decidesChampion: bool,
  headToHeadRequiresCompleteMiniLeague: bool,
  formatId: nullable(nonEmptyText),
  matchRules: nullable(matchRules),
  pointsSystem: nullable(pointsSystem),
  tieBreakers: nullable(tieBreakers),
  nrr: nullable(nrrConfig),
});

export const templateShape = object<TournamentTemplate>({
  id: idText,
  name: nonEmptyText,
  description: text,
  builtin: bool,
  teamCount: nullable(integer(2)),
  structureKind,
  pointsSystem,
  nrr: nrrConfig,
  tieBreakers,
  defaultFormatId: nonEmptyText,
  defaultMatchRules: matchRules,
  stages: arrayOf(templateStage),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const scoringPreferences = object<ScoringPreferences>({
  confirmInningsEnd: bool,
  autoPromptBowler: bool,
  dotStyle: literal('zero', 'dot'),
  keepAwake: bool,
  padHand: optional(literal('right', 'left')),
});

export const settingsShape = object<AppSettings>({
  theme: literal('light', 'dark', 'system'),
  hapticsEnabled: bool,
  soundEnabled: bool,
  reducedMotion: literal('system', 'on', 'off'),
  reduceTransparency: optional(bool),
  defaultFormatId: nonEmptyText,
  scoring: scoringPreferences,
});

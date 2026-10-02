import { FIXTURE_STATUSES, STAGE_TYPES, TOURNAMENT_STATUSES } from '@/domain/types';
import type {
  BracketPosition,
  Fixture,
  FixtureSide,
  Pool,
  PoolEntry,
  QualificationRule,
  SlotSource,
  Stage,
  StageConfig,
  StageSlot,
  Tournament,
  TournamentRules,
  TournamentTeam,
} from '@/domain/types';
import {
  arrayOf,
  bool,
  discriminated,
  idText,
  integer,
  isoDate,
  isoDateTime,
  literal,
  localTime,
  nonEmptyText,
  nullable,
  object,
  text,
  type Guard,
} from '../guards';
import { fixtureGeneration, seedingMethod, structureKind } from './library';
import { knockoutConfig, matchRules, normalization, nrrConfig, pointsSystem, tieBreakers } from './rules';

export const tournamentShape = object<Tournament>({
  id: idText,
  name: nonEmptyText,
  season: nullable(text),
  description: nullable(text),
  logoUri: nullable(text),
  organizer: nullable(text),
  contact: nullable(text),
  location: nullable(text),
  notes: nullable(text),
  startDate: nullable(isoDate),
  endDate: nullable(isoDate),
  venueIds: arrayOf(idText),
  structureKind,
  status: literal(...TOURNAMENT_STATUSES),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const tournamentRulesShape = object<TournamentRules>({
  tournamentId: idText,
  pointsSystem,
  nrr: nrrConfig,
  tieBreakers,
  defaultFormatId: nonEmptyText,
  defaultMatchRules: matchRules,
  updatedAt: isoDateTime,
});

export const tournamentTeamShape = object<TournamentTeam>({
  id: idText,
  tournamentId: idText,
  teamId: idText,
  seed: nullable(integer(1)),
  status: literal('active', 'withdrawn', 'replaced'),
  replacedByTeamId: nullable(idText),
  inheritsFromTeamId: nullable(idText),
  joinedAt: isoDateTime,
});

type EntryRuleOf<K extends QualificationRule['kind']> = Extract<QualificationRule, { readonly kind: K }>;

const qualificationRule = discriminated<QualificationRule, 'kind'>('kind', {
  top_per_pool: object<EntryRuleOf<'top_per_pool'>>({
    kind: literal('top_per_pool'),
    sourceStageId: idText,
    count: integer(1),
    fromPosition: integer(1),
  }),
  pool_position: object<EntryRuleOf<'pool_position'>>({
    kind: literal('pool_position'),
    sourceStageId: idText,
    poolId: idText,
    position: integer(1),
  }),
  best_of_position: object<EntryRuleOf<'best_of_position'>>({
    kind: literal('best_of_position'),
    sourceStageId: idText,
    position: integer(1),
    count: integer(1),
    normalization,
  }),
  top_overall: object<EntryRuleOf<'top_overall'>>({
    kind: literal('top_overall'),
    sourceStageId: idText,
    count: integer(1),
    normalization,
  }),
  knockout_winners: object<EntryRuleOf<'knockout_winners'>>({ kind: literal('knockout_winners'), sourceStageId: idText }),
  manual: object<EntryRuleOf<'manual'>>({ kind: literal('manual'), count: integer(1), label: nonEmptyText }),
  direct_entry: object<EntryRuleOf<'direct_entry'>>({ kind: literal('direct_entry'), teamIds: arrayOf(idText) }),
});

const stageConfig = object<StageConfig>({
  fixtureGeneration,
  seeding: seedingMethod,
  seedingSeed: nullable(integer(0)),
  seedingNormalization: normalization,
  pointsSystem: nullable(pointsSystem),
  tieBreakers: nullable(tieBreakers),
  headToHeadRequiresCompleteMiniLeague: bool,
  nrr: nullable(nrrConfig),
  entryRules: arrayOf(qualificationRule),
  knockout: nullable(knockoutConfig),
  abandonedMatches: literal('no_result', 'replay'),
  decidesChampion: bool,
  formatId: nullable(nonEmptyText),
  matchRules: nullable(matchRules),
});

export const stageShape = object<Stage>({
  id: idText,
  tournamentId: idText,
  name: nonEmptyText,
  type: literal(...STAGE_TYPES),
  orderIndex: integer(0),
  status: literal('pending', 'active', 'completed'),
  config: stageConfig,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const poolShape = object<Pool>({
  id: idText,
  stageId: idText,
  name: nonEmptyText,
  orderIndex: integer(0),
  legs: nullable(integer(1)),
});

type SourceOf<K extends SlotSource['kind']> = Extract<SlotSource, { readonly kind: K }>;

export const slotSource = discriminated<SlotSource, 'kind'>('kind', {
  pool_position: object<SourceOf<'pool_position'>>({ kind: literal('pool_position'), stageId: idText, poolId: idText, position: integer(1) }),
  best_of_position: object<SourceOf<'best_of_position'>>({
    kind: literal('best_of_position'),
    stageId: idText,
    position: integer(1),
    rank: integer(1),
    normalization,
  }),
  overall_position: object<SourceOf<'overall_position'>>({ kind: literal('overall_position'), stageId: idText, rank: integer(1), normalization }),
  bracket_winner: object<SourceOf<'bracket_winner'>>({ kind: literal('bracket_winner'), stageId: idText, round: integer(1), position: integer(0) }),
  bracket_loser: object<SourceOf<'bracket_loser'>>({ kind: literal('bracket_loser'), stageId: idText, round: integer(1), position: integer(0) }),
  fixture_winner: object<SourceOf<'fixture_winner'>>({ kind: literal('fixture_winner'), fixtureId: idText }),
  fixture_loser: object<SourceOf<'fixture_loser'>>({ kind: literal('fixture_loser'), fixtureId: idText }),
  manual: object<SourceOf<'manual'>>({ kind: literal('manual'), teamId: nullable(idText) }),
});

export const slotShape = object<StageSlot>({
  id: idText,
  stageId: idText,
  index: integer(0),
  role: literal('entry', 'progression'),
  label: nonEmptyText,
  source: slotSource,
  seed: nullable(integer(1)),
});

export const fixtureSide: Guard<FixtureSide> = discriminated<FixtureSide, 'kind'>('kind', {
  team: object<Extract<FixtureSide, { readonly kind: 'team' }>>({ kind: literal('team'), teamId: idText }),
  slot: object<Extract<FixtureSide, { readonly kind: 'slot' }>>({ kind: literal('slot'), slotId: idText }),
});

export const poolEntryShape = object<PoolEntry>({
  id: idText,
  poolId: idText,
  stageId: idText,
  side: fixtureSide,
  seed: nullable(integer(1)),
});

const bracketPosition = object<BracketPosition>({
  kind: literal('main', 'third_place', 'placement'),
  round: integer(1),
  position: integer(0),
  roundName: text,
});

const matchSides = object<NonNullable<Fixture['matchSides']>>({ teamAId: idText, teamBId: idText });

export const fixtureShape = object<Fixture>({
  id: idText,
  tournamentId: idText,
  stageId: idText,
  poolId: nullable(idText),
  matchNumber: integer(1),
  label: nullable(text),
  round: nullable(integer(1)),
  leg: nullable(integer(1)),
  bracket: nullable(bracketPosition),
  isFinal: bool,
  sideA: fixtureSide,
  sideB: fixtureSide,
  scheduledDate: nullable(isoDate),
  scheduledTime: nullable(localTime),
  venueId: nullable(idText),
  status: literal(...FIXTURE_STATUSES),
  matchId: nullable(idText),
  matchSides: nullable(matchSides),
  formatId: nullable(nonEmptyText),
  matchRules: nullable(matchRules),
  notes: nullable(text),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

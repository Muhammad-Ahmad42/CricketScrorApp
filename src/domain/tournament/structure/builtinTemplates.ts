import { BASE_MATCH_RULES, BUILTIN_FORMAT_PRESETS } from '../../scoring/presets';
import type { MatchRules, StageType, TemplateStage, TournamentTemplate } from '../../types';
import { DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_STAGE_CONFIGS, DEFAULT_TIE_BREAKERS } from '../defaults';
import { frozenCopy } from './freeze';

const BUILTIN_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function t20Rules(): MatchRules {
  return BUILTIN_FORMAT_PRESETS.find((preset) => preset.id === 'T20')?.rules ?? BASE_MATCH_RULES;
}

function templateStage(
  base: { readonly key: string; readonly name: string; readonly type: StageType },
  overrides: Partial<Omit<TemplateStage, 'key' | 'name' | 'type'>>,
): TemplateStage {
  const config = DEFAULT_STAGE_CONFIGS[base.type];
  return {
    ...base,
    poolCount: 0,
    poolSizes: null,
    poolSlotIndexes: null,
    fixtureGeneration: config.fixtureGeneration,
    seeding: config.seeding,
    seedingNormalization: config.seedingNormalization,
    entry: [],
    knockout: config.knockout,
    abandonedMatches: config.abandonedMatches,
    decidesChampion: false,
    headToHeadRequiresCompleteMiniLeague: config.headToHeadRequiresCompleteMiniLeague,
    formatId: null,
    matchRules: null,
    pointsSystem: null,
    tieBreakers: null,
    nrr: null,
    ...overrides,
  };
}

function builtin(
  meta: Pick<TournamentTemplate, 'id' | 'name' | 'description' | 'teamCount' | 'structureKind'>,
  stages: readonly TemplateStage[],
): TournamentTemplate {
  return {
    ...meta,
    builtin: true,
    pointsSystem: DEFAULT_POINTS_SYSTEM,
    nrr: DEFAULT_NRR_CONFIG,
    tieBreakers: DEFAULT_TIE_BREAKERS,
    defaultFormatId: 'T20',
    defaultMatchRules: t20Rules(),
    stages,
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  };
}

function groupsThenKnockout(poolCount: number, qualifiersPerPool: number): readonly TemplateStage[] {
  return [
    templateStage({ key: 'groups', name: 'Group Stage', type: 'group' }, { poolCount }),
    templateStage(
      { key: 'knockouts', name: 'Knockouts', type: 'knockout' },
      {
        seeding: 'fixed',
        entry: [{ kind: 'top_per_pool', sourceStageKey: 'groups', count: qualifiersPerPool, fromPosition: 1 }],
        decidesChampion: true,
      },
    ),
  ];
}

function buildBuiltins(): readonly TournamentTemplate[] {
  return [
    builtin(
      {
        id: 'builtin:8-team-t20',
        name: '8-Team T20',
        description: '2 pools of 4, top 2 to the semifinals',
        teamCount: 8,
        structureKind: 'groups_knockout',
      },
      groupsThenKnockout(2, 2),
    ),
    builtin(
      {
        id: 'builtin:4-team-league',
        name: '4-Team League',
        description: 'Double round robin, top team wins',
        teamCount: 4,
        structureKind: 'league',
      },
      [
        templateStage(
          { key: 'league', name: 'League', type: 'league' },
          { poolCount: 1, fixtureGeneration: { method: 'round_robin', legs: 2 }, decidesChampion: true },
        ),
      ],
    ),
    builtin(
      {
        id: 'builtin:8-team-knockout',
        name: '8-Team Knockout',
        description: 'Seeded knockout from the quarterfinals',
        teamCount: 8,
        structureKind: 'knockout',
      },
      [templateStage({ key: 'knockout', name: 'Knockout', type: 'knockout' }, { seeding: 'ranking', decidesChampion: true })],
    ),
    builtin(
      {
        id: 'builtin:16-team-groups',
        name: '16-Team Groups',
        description: '4 pools of 4, top 2 to the quarterfinals',
        teamCount: 16,
        structureKind: 'groups_knockout',
      },
      groupsThenKnockout(4, 2),
    ),
    builtin(
      {
        id: 'builtin:20-team-pools',
        name: '20-Team Pools',
        description: '4 pools of 5, winners to the semifinals',
        teamCount: 20,
        structureKind: 'groups_knockout',
      },
      groupsThenKnockout(4, 1),
    ),
  ];
}

export const BUILTIN_TEMPLATES: readonly TournamentTemplate[] = frozenCopy(buildBuiltins());

import type { ChampionResult, Fixture, StageEvaluation } from '@/domain/types';
import { joinList, plural } from '@/features/shared';
import { STRUCTURE_KIND_LABEL, TOURNAMENT_STATUS_LABEL, isSetupStatus } from '../labels';
import { fixtureResultText, fixtureRow, liveFixtures, nextFixture, recentResults, type FixtureRowVM, type VenueLookup } from './fixtures';
import type { TournamentIndex } from './names';
import { cachedStageStandings, type StandingsTableVM } from './standings';

export interface DashboardStandingsVM {
  readonly table: StandingsTableVM;
  readonly explanation: string | null;
}

export interface DashboardChampionVM {
  readonly names: string;
  readonly basis: string;
}

export interface DashboardVM {
  readonly name: string;
  readonly season: string | null;
  readonly metaLine: string;
  readonly statusLabel: string;
  readonly setup: boolean;
  readonly archived: boolean;
  readonly stageName: string | null;
  readonly progressText: string;
  readonly progressLabel: string;
  readonly progressRatio: number;
  readonly live: readonly FixtureRowVM[];
  readonly next: FixtureRowVM | null;
  readonly standings: DashboardStandingsVM | null;
  readonly recent: readonly { readonly key: string; readonly fixtureId: string; readonly text: string }[];
  readonly champion: DashboardChampionVM | null;
  readonly unresolvedTies: readonly string[];
  readonly stale: boolean;
  readonly hasBracket: boolean;
  readonly hasPools: boolean;
  readonly allPlayed: boolean;
}

function poolCount(index: TournamentIndex): number {
  return index.stages.reduce((max, stage) => Math.max(max, index.poolsOf(stage.id).length), 0);
}

function metaLine(index: TournamentIndex): string {
  const { snapshot } = index;
  const teams = snapshot.teams.filter((view) => view.membership.status === 'active').length;
  const parts = [plural(teams, 'team')];
  const pools = poolCount(index);
  if (pools > 1) {
    parts.push(plural(pools, 'pool'));
  }
  parts.push(STRUCTURE_KIND_LABEL[snapshot.tournament.structureKind]);
  parts.push(snapshot.rules.defaultFormatId);
  return parts.join(' · ');
}

function championBasis(index: TournamentIndex, champion: ChampionResult): string {
  switch (champion.basis) {
    case 'final': {
      const final = champion.fixtureId ? index.snapshot.fixtures.find((fixture) => fixture.id === champion.fixtureId) : undefined;
      const result = final ? fixtureResultText(index, final) : null;
      return result ? `Won the final: ${result}` : 'Won the final';
    }
    case 'league_table':
      return 'Top of the table';
    case 'manual':
      return 'Manual Override';
    case 'shared':
      return 'Shared title';
    default: {
      const unreachable: never = champion.basis;
      return unreachable;
    }
  }
}

function excerptStage(index: TournamentIndex): StageEvaluation | null {
  const evaluation = index.evaluation;
  if (evaluation === null) {
    return null;
  }
  const withTables = evaluation.stages.filter((stage) => stage.tables.length > 0);
  const current = withTables.find((stage) => stage.stageId === evaluation.currentStageId);
  return current ?? withTables[withTables.length - 1] ?? null;
}

function excerpt(index: TournamentIndex, focus: Fixture | null): DashboardStandingsVM | null {
  const stage = excerptStage(index);
  if (stage === null) {
    return null;
  }
  const vm = cachedStageStandings(index, stage);
  const poolTables = vm.tables.filter((table) => table.key !== 'overall' && !table.key.startsWith('compare-'));
  const preferred = focus?.poolId ? poolTables.find((table) => table.poolId === focus.poolId) : undefined;
  const table = preferred ?? poolTables[0];
  if (!table) {
    return null;
  }
  const explained = table.rows.find((row) => row.qualification?.state === 'qualified') ?? table.rows.find((row) => row.qualification !== null);
  return { table, explanation: explained?.qualification?.explanation ?? null };
}

export function dashboardVM(index: TournamentIndex, venueName: VenueLookup = () => null): DashboardVM {
  const { snapshot, evaluation } = index;
  const tournament = snapshot.tournament;
  const progress = evaluation?.progress ?? { done: 0, total: snapshot.fixtures.length };
  const live = liveFixtures(index).map((fixture) => fixtureRow(index, fixture, venueName));
  const nextRaw = nextFixture(index);
  const focus = liveFixtures(index)[0] ?? nextRaw;
  const champion = evaluation?.champion ?? null;
  const currentStage = evaluation?.currentStageId ? index.stage(evaluation.currentStageId) : undefined;
  const ties = (evaluation?.stages ?? []).flatMap((stage) => cachedStageStandings(index, stage).tables.flatMap((table) => table.unresolvedTies));
  return {
    name: tournament.name,
    season: tournament.season,
    metaLine: metaLine(index),
    statusLabel: TOURNAMENT_STATUS_LABEL[tournament.status],
    setup: isSetupStatus(tournament.status),
    archived: tournament.status === 'archived',
    stageName: currentStage?.name ?? null,
    progressText: `${progress.done}/${progress.total}`,
    progressLabel: `${progress.done} of ${plural(progress.total, 'match', 'matches')} played`,
    progressRatio: progress.total === 0 ? 0 : progress.done / progress.total,
    live,
    next: nextRaw ? fixtureRow(index, nextRaw, venueName) : null,
    standings: excerpt(index, focus),
    recent: recentResults(index, 3).map((fixture) => ({
      key: fixture.id,
      fixtureId: fixture.id,
      text: `${index.fixtureLabel(fixture)} · ${fixtureResultText(index, fixture) ?? 'Completed'}`,
    })),
    champion:
      champion && champion.teamIds.length > 0
        ? { names: joinList(champion.teamIds.map((teamId) => index.teamName(teamId))), basis: championBasis(index, champion) }
        : null,
    unresolvedTies: ties,
    stale: snapshot.staleSummaryMatchIds.length > 0,
    hasBracket: index.stages.some((stage) => stage.type === 'knockout'),
    hasPools: index.stages.some((stage) => index.poolsOf(stage.id).length > 1),
    allPlayed: progress.total > 0 && progress.done === progress.total,
  };
}

import type { ChampionResult, SlotResolution, StageEvaluation, TournamentOverride } from '../../types';
import { advance, isDecided, seedLookup } from './advance';
import type { SnapshotIndex } from './snapshotIndex';
import { fixtureTeamsVia } from './stageTables';

type ChampionOverride = Extract<TournamentOverride, { readonly kind: 'champion' }>;

function latestChampionOverride(index: SnapshotIndex): ChampionOverride | null {
  const overrides = index.activeOverrides.filter((override): override is ChampionOverride => override.kind === 'champion');
  if (overrides.length === 0) return null;
  return overrides.reduce((latest, candidate) => (candidate.createdAt >= latest.createdAt ? candidate : latest));
}

export function championOf(index: SnapshotIndex, stages: readonly StageEvaluation[]): ChampionResult | null {
  const override = latestChampionOverride(index);
  if (override && override.teamIds.length > 0) return { teamIds: [...override.teamIds], basis: 'manual', fixtureId: null };
  const stage = index.stagesOrdered.find((candidate) => candidate.config.decidesChampion);
  if (!stage) return null;
  const resolutions = new Map<string, SlotResolution>();
  stages.forEach((evaluation) => evaluation.slots.forEach((resolution) => resolutions.set(resolution.slotId, resolution)));
  const lookup = (slotId: string) => resolutions.get(slotId);
  const final = (index.fixturesByStage.get(stage.id) ?? []).find((fixture) => fixture.isFinal);
  if (final) {
    const teams = fixtureTeamsVia(final, lookup);
    const advancement = advance(index, final, teams, seedLookup(index, stage.id, lookup));
    if (isDecided(advancement) && advancement.winnerTeamId !== null) {
      return { teamIds: [advancement.winnerTeamId], basis: 'final', fixtureId: final.id };
    }
    if (advancement.basis === 'shared' && teams.a !== null && teams.b !== null) {
      return { teamIds: [teams.a, teams.b], basis: 'shared', fixtureId: final.id };
    }
    return null;
  }
  const evaluation = stages.find((candidate) => candidate.stageId === stage.id);
  if (!evaluation || evaluation.tables.length !== 1) return null;
  const table = evaluation.tables[0];
  const top = table.rows[0];
  if (!table.complete || !top || top.teamId === null || top.membership !== 'active' || top.sharedPosition) return null;
  return { teamIds: [top.teamId], basis: 'league_table', fixtureId: null };
}

import { formatResult } from '@/domain/scoring';
import type { Fixture, FixtureSide, MatchSummary, MatchTeam, SlotResolution, TeamId } from '@/domain/types';
import type { NameLookup } from '../text';
import type { TournamentPdfSource } from './model';

export interface TournamentNames {
  readonly team: NameLookup;
  readonly side: (fixture: Fixture, which: 'A' | 'B') => string;
  readonly teamIdOf: (fixture: Fixture, which: 'A' | 'B') => TeamId | null;
  readonly summaryOf: (fixture: Fixture) => MatchSummary | null;
  readonly resultText: (summary: MatchSummary) => string;
  readonly stageLabel: (fixture: Fixture) => string;
}

export function tournamentNames(source: TournamentPdfSource): TournamentNames {
  const { snapshot, evaluation } = source;
  const teams = new Map(snapshot.teams.map((view) => [view.team.id, view.team]));
  const slots = new Map(snapshot.slots.map((slot) => [slot.id, slot]));
  const resolutions = new Map<string, SlotResolution>(evaluation.stages.flatMap((stage) => stage.slots.map((slot) => [slot.slotId, slot] as const)));
  const stages = new Map(snapshot.stages.map((stage) => [stage.id, stage]));
  const pools = new Map(snapshot.pools.map((pool) => [pool.id, pool]));
  const team: NameLookup = (id) => (id === null ? 'To be decided' : teams.get(id)?.name ?? 'Unknown team');

  const sideTeamId = (side: FixtureSide): TeamId | null =>
    side.kind === 'team' ? side.teamId : resolutions.get(side.slotId)?.teamId ?? null;

  const teamIdOf = (fixture: Fixture, which: 'A' | 'B'): TeamId | null => {
    if (fixture.matchSides !== null) {
      return which === 'A' ? fixture.matchSides.teamAId : fixture.matchSides.teamBId;
    }
    return sideTeamId(which === 'A' ? fixture.sideA : fixture.sideB);
  };

  const side = (fixture: Fixture, which: 'A' | 'B'): string => {
    const teamId = teamIdOf(fixture, which);
    const raw = which === 'A' ? fixture.sideA : fixture.sideB;
    if (teamId !== null) {
      const provisional = raw.kind === 'slot' && fixture.matchSides === null && resolutions.get(raw.slotId)?.status === 'provisional';
      return provisional ? `${team(teamId)} (provisional)` : team(teamId);
    }
    return raw.kind === 'slot' ? slots.get(raw.slotId)?.label ?? 'To be decided' : 'To be decided';
  };

  const summaryOf = (fixture: Fixture): MatchSummary | null =>
    fixture.matchId === null ? null : snapshot.summaries[fixture.matchId] ?? null;

  const matchTeam = (id: TeamId): MatchTeam => ({
    id,
    name: team(id),
    shortName: teams.get(id)?.shortName ?? team(id).slice(0, 3).toUpperCase(),
    playersInSide: 0,
  });

  const resultText = (summary: MatchSummary): string => formatResult(summary.result, [matchTeam(summary.teamAId), matchTeam(summary.teamBId)]);

  const stageLabel = (fixture: Fixture): string => {
    const stage = stages.get(fixture.stageId)?.name ?? '';
    const pool = fixture.poolId === null ? null : pools.get(fixture.poolId)?.name ?? null;
    return pool === null ? stage : `${stage} · ${pool}`;
  };

  return { team, side, teamIdOf, summaryOf, resultText, stageLabel };
}

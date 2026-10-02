import type { Fixture, MatchSummary, Pool, PoolEntry, Stage, StageSlot, TeamId, TournamentSnapshot } from '@/domain/types';
import { played } from './summaries';
import { entry, fixture, makeSnapshot, pool, stage, team, withResult } from './tournament';

export interface GeneratedSpec {
  readonly poolSizes: readonly number[];
  readonly legs?: number;
  readonly playedRounds?: number;
  readonly targets?: readonly Stage[];
  readonly slots?: readonly StageSlot[];
  readonly extraFixtures?: readonly Fixture[];
  readonly extraSummaries?: readonly MatchSummary[];
  readonly groupConfig?: Partial<Stage['config']>;
}

export function poolLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '');
}

export function generatedTeam(poolIndex: number, position: number): TeamId {
  return `${poolLetter(poolIndex)}-${position + 1}`;
}

function result(matchId: string, winner: TeamId, loser: TeamId, margin: number): MatchSummary {
  return played(matchId, { team: winner, runs: 140 + margin, balls: 120, wickets: 5 }, { team: loser, runs: 130, balls: 120, wickets: 8 });
}

export function generatedTournament(spec: GeneratedSpec): TournamentSnapshot {
  const pools: Pool[] = [];
  const entries: PoolEntry[] = [];
  const fixtures: Fixture[] = [];
  const summaries: MatchSummary[] = [];
  const teams: TeamId[] = [];
  let number = 1;
  spec.poolSizes.forEach((size, poolIndex) => {
    const poolId = `p${poolLetter(poolIndex)}`;
    pools.push(pool(poolId, 'groups', `Pool ${poolLetter(poolIndex)}`, poolIndex, spec.legs ?? null));
    const members = Array.from({ length: size }, (_, position) => generatedTeam(poolIndex, position));
    members.forEach((teamId) => {
      teams.push(teamId);
      entries.push(entry('groups', poolId, team(teamId)));
    });
    let round = 0;
    for (let leg = 1; leg <= (spec.legs ?? 1); leg += 1) {
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          round += 1;
          const id = `${poolId}-${members[i]}-${members[j]}-${leg}`;
          const base = fixture(id, 'groups', poolId, number, team(members[i]), team(members[j]), { leg });
          number += 1;
          const isPlayed = spec.playedRounds === undefined || round <= spec.playedRounds;
          if (!isPlayed) {
            fixtures.push(base);
            continue;
          }
          const summary = result(`m-${id}`, members[i], members[j], (size - i) * 3 + poolIndex + j);
          summaries.push(summary);
          fixtures.push(withResult(base, summary));
        }
      }
    }
  });
  return makeSnapshot({
    teams,
    stages: [stage('groups', 'Group stage', 'group', 0, spec.groupConfig), ...(spec.targets ?? [])],
    pools,
    poolEntries: entries,
    slots: spec.slots ?? [],
    fixtures: [...fixtures, ...(spec.extraFixtures ?? [])],
    summaries: [...summaries, ...(spec.extraSummaries ?? [])],
  });
}

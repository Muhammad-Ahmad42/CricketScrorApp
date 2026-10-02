import type { BackupData, FixtureSide, Id, MatchEvent, Pool, Stage, StageSlot } from '@/domain/types';
import { visitMatchEvent } from '../ids';
import { checkRowConsistency } from './consistency';
import { errorIssue, type IssueSink } from './issues';

interface Lookups {
  readonly stages: ReadonlyMap<Id, Stage>;
  readonly pools: ReadonlyMap<Id, Pool>;
  readonly slots: ReadonlyMap<Id, StageSlot>;
  readonly members: ReadonlySet<string>;
}

function byId<T extends { readonly id: Id }>(rows: readonly T[]): ReadonlyMap<Id, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function memberKey(tournamentId: Id, teamId: Id): string {
  return `${tournamentId}\u0000${teamId}`;
}

function lookups(data: BackupData): Lookups {
  return {
    stages: byId(data.stages),
    pools: byId(data.pools),
    slots: byId(data.slots),
    members: new Set(data.tournamentTeams.map((row) => memberKey(row.tournamentId, row.teamId))),
  };
}

function checkSide(side: FixtureSide, tournamentId: Id | null, stageId: Id, path: string, look: Lookups, sink: IssueSink): void {
  if (side.kind === 'team') {
    if (tournamentId !== null && !look.members.has(memberKey(tournamentId, side.teamId))) {
      sink.add(errorIssue('INVALID_VALUE', 'This team is not entered in the tournament.', `${path}.teamId`));
    }
    return;
  }
  const slot = look.slots.get(side.slotId);
  if (slot !== undefined && slot.stageId !== stageId) {
    sink.add(errorIssue('INVALID_VALUE', 'This qualification slot belongs to a different stage.', `${path}.slotId`));
  }
}

function checkTournamentTeams(data: BackupData, look: Lookups, sink: IssueSink): void {
  const seen = new Set<string>();
  data.tournamentTeams.forEach((row, index) => {
    const path = `data.tournamentTeams[${index}]`;
    const key = memberKey(row.tournamentId, row.teamId);
    if (seen.has(key)) {
      sink.add(errorIssue('INVALID_VALUE', 'This team is entered in the same tournament twice.', `${path}.teamId`));
    }
    seen.add(key);
    (['replacedByTeamId', 'inheritsFromTeamId'] as const).forEach((field) => {
      const teamId = row[field];
      if (teamId !== null && !look.members.has(memberKey(row.tournamentId, teamId))) {
        sink.add(errorIssue('INVALID_VALUE', 'The replacement team is not entered in the tournament.', `${path}.${field}`));
      }
    });
  });
}

function checkStagesAndPools(data: BackupData, look: Lookups, sink: IssueSink): void {
  const stageOrder = new Set<string>();
  data.stages.forEach((row, index) => {
    const key = `${row.tournamentId}\u0000${row.orderIndex}`;
    if (stageOrder.has(key)) {
      sink.add(errorIssue('INVALID_VALUE', 'Two stages of the tournament have the same position.', `data.stages[${index}].orderIndex`));
    }
    stageOrder.add(key);
  });
  const poolOrder = new Set<string>();
  const poolNames = new Set<string>();
  data.pools.forEach((row, index) => {
    const orderKey = `${row.stageId}\u0000${row.orderIndex}`;
    const nameKey = `${row.stageId}\u0000${row.name}`;
    if (poolOrder.has(orderKey)) {
      sink.add(errorIssue('INVALID_VALUE', 'Two pools of the stage have the same position.', `data.pools[${index}].orderIndex`));
    }
    if (poolNames.has(nameKey)) {
      sink.add(errorIssue('INVALID_VALUE', 'Two pools of the stage have the same name.', `data.pools[${index}].name`));
    }
    poolOrder.add(orderKey);
    poolNames.add(nameKey);
  });
  const entries = new Set<string>();
  data.poolEntries.forEach((row, index) => {
    const path = `data.poolEntries[${index}]`;
    const pool = look.pools.get(row.poolId);
    if (pool !== undefined && pool.stageId !== row.stageId) {
      sink.add(errorIssue('INVALID_VALUE', 'This pool belongs to a different stage.', `${path}.poolId`));
    }
    const tournamentId = look.stages.get(row.stageId)?.tournamentId ?? null;
    checkSide(row.side, tournamentId, row.stageId, `${path}.side`, look, sink);
    const key = `${row.stageId}\u0000${row.side.kind === 'team' ? row.side.teamId : row.side.slotId}`;
    if (entries.has(key)) {
      sink.add(errorIssue('INVALID_VALUE', 'This team or slot is in more than one pool of the same stage.', `${path}.side`));
    }
    entries.add(key);
  });
}

function checkSlots(data: BackupData, sink: IssueSink): void {
  const indexes = new Set<string>();
  data.slots.forEach((row, index) => {
    const path = `data.slots[${index}]`;
    const key = `${row.stageId}\u0000${row.index}`;
    if (indexes.has(key)) {
      sink.add(errorIssue('INVALID_VALUE', 'Two qualification slots of the stage have the same number.', `${path}.index`));
    }
    indexes.add(key);
    if (row.role !== 'progression') {
      return;
    }
    const kind = row.source.kind;
    if (kind !== 'bracket_winner' && kind !== 'bracket_loser' && kind !== 'fixture_winner' && kind !== 'fixture_loser') {
      sink.add(errorIssue('INVALID_VALUE', 'A progression slot must be filled by the winner or loser of a match.', `${path}.source`));
    } else if ((kind === 'bracket_winner' || kind === 'bracket_loser') && row.source.stageId !== row.stageId) {
      sink.add(errorIssue('INVALID_VALUE', 'A progression slot must come from its own bracket.', `${path}.source.stageId`));
    }
    if (row.seed !== null) {
      sink.add(errorIssue('INVALID_VALUE', 'Only entry slots can carry a seed.', `${path}.seed`));
    }
  });
}

function checkFixtures(data: BackupData, look: Lookups, sink: IssueSink): void {
  const matches = byId(data.matches);
  const finals = new Set<Id>();
  const brackets = new Set<string>();
  data.fixtures.forEach((row, index) => {
    const path = `data.fixtures[${index}]`;
    const stage = look.stages.get(row.stageId);
    if (stage !== undefined && stage.tournamentId !== row.tournamentId) {
      sink.add(errorIssue('INVALID_VALUE', 'This stage belongs to a different tournament.', `${path}.stageId`));
    }
    const pool = row.poolId === null ? undefined : look.pools.get(row.poolId);
    if (pool !== undefined && pool.stageId !== row.stageId) {
      sink.add(errorIssue('INVALID_VALUE', 'This pool belongs to a different stage.', `${path}.poolId`));
    }
    checkSide(row.sideA, row.tournamentId, row.stageId, `${path}.sideA`, look, sink);
    checkSide(row.sideB, row.tournamentId, row.stageId, `${path}.sideB`, look, sink);
    if (row.isFinal) {
      if (finals.has(row.stageId)) {
        sink.add(errorIssue('INVALID_VALUE', 'A stage can only have one final.', `${path}.isFinal`));
      }
      finals.add(row.stageId);
    }
    if (row.bracket !== null) {
      const key = `${row.stageId}\u0000${row.bracket.kind}\u0000${row.bracket.round}\u0000${row.bracket.position}`;
      if (brackets.has(key)) {
        sink.add(errorIssue('INVALID_VALUE', 'Two fixtures share the same place in the bracket.', `${path}.bracket`));
      }
      brackets.add(key);
    }
    const match = row.matchId === null ? undefined : matches.get(row.matchId);
    if (match !== undefined && match.fixtureId !== row.id) {
      sink.add(errorIssue('INVALID_VALUE', 'This fixture points to a match that was played for a different fixture.', `${path}.matchId`));
    }
  });
}

function checkMatches(data: BackupData, look: Lookups, sink: IssueSink, tainted: Set<Id>): void {
  const fixtures = byId(data.fixtures);
  data.matches.forEach((row, index) => {
    const path = `data.matches[${index}]`;
    if (row.tournamentId !== null) {
      const tournamentId = row.tournamentId;
      (['teamAId', 'teamBId'] as const).forEach((field) => {
        if (!look.members.has(memberKey(tournamentId, row[field]))) {
          tainted.add(row.id);
          sink.add(errorIssue('INVALID_VALUE', 'This team is not entered in the tournament.', `${path}.${field}`));
        }
      });
    }
    const fixture = row.fixtureId === null ? undefined : fixtures.get(row.fixtureId);
    if (fixture !== undefined && fixture.tournamentId !== row.tournamentId) {
      sink.add(errorIssue('INVALID_VALUE', 'This fixture belongs to a different tournament.', `${path}.fixtureId`));
    }
  });
}

function eventPlayerSites(event: MatchEvent, path: string): readonly { readonly path: string; readonly id: Id }[] {
  const sites: { readonly path: string; readonly id: Id }[] = [];
  visitMatchEvent(event, {
    path,
    visit: (site) => {
      if (site.entity === 'players') {
        sites.push({ path: site.path, id: site.id });
      }
      return site.id;
    },
  });
  return sites;
}

function checkSquads(data: BackupData, sink: IssueSink, tainted: Set<Id>): void {
  const matches = byId(data.matches);
  const squads = new Set<string>();
  data.matchPlayers.forEach((row, index) => {
    squads.add(`${row.matchId}\u0000${row.playerId}`);
    const match = matches.get(row.matchId);
    if (match !== undefined && row.teamId !== match.teamAId && row.teamId !== match.teamBId) {
      tainted.add(row.matchId);
      sink.add(errorIssue('INVALID_VALUE', 'This squad player is listed for a team that is not playing the match.', `data.matchPlayers[${index}].teamId`));
    }
  });
  data.matchEvents.forEach((event, index) => {
    eventPlayerSites(event, `data.matchEvents[${index}]`).forEach((site) => {
      if (!squads.has(`${event.matchId}\u0000${site.id}`)) {
        tainted.add(event.matchId);
        sink.add(errorIssue('INVALID_VALUE', 'This player is not in the squad for the match.', site.path));
      }
    });
  });
}

export function checkSemantics(data: BackupData, sink: IssueSink): ReadonlySet<Id> {
  const tainted = new Set<Id>(checkRowConsistency(data, sink));
  const look = lookups(data);
  checkTournamentTeams(data, look, sink);
  checkStagesAndPools(data, look, sink);
  checkSlots(data, sink);
  checkFixtures(data, look, sink);
  checkMatches(data, look, sink, tainted);
  checkSquads(data, sink, tainted);
  return tainted;
}

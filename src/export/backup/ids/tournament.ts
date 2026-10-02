import type {
  Fixture,
  FixtureSide,
  Pool,
  PoolEntry,
  QualificationRule,
  SlotSource,
  Stage,
  StageSlot,
  Tournament,
  TournamentRules,
  TournamentTeam,
} from '@/domain/types';
import { at, item, key, optionalRef, ref, refList, type Cursor } from './cursor';

export function visitTournament(row: Tournament, c: Cursor): Tournament {
  const id = key(c, 'id', 'tournaments', row.id);
  const venueIds = refList(c, 'venueIds', 'venues', row.venueIds);
  return { ...row, id, venueIds };
}

export function visitTournamentRules(row: TournamentRules, c: Cursor): TournamentRules {
  return { ...row, tournamentId: ref(c, 'tournamentId', 'tournaments', row.tournamentId) };
}

export function visitTournamentTeam(row: TournamentTeam, c: Cursor): TournamentTeam {
  const id = key(c, 'id', 'tournamentTeams', row.id);
  const tournamentId = ref(c, 'tournamentId', 'tournaments', row.tournamentId);
  const teamId = ref(c, 'teamId', 'teams', row.teamId);
  const replacedByTeamId = optionalRef(c, 'replacedByTeamId', 'teams', row.replacedByTeamId);
  const inheritsFromTeamId = optionalRef(c, 'inheritsFromTeamId', 'teams', row.inheritsFromTeamId);
  return { ...row, id, tournamentId, teamId, replacedByTeamId, inheritsFromTeamId };
}

function visitEntryRule(rule: QualificationRule, c: Cursor): QualificationRule {
  switch (rule.kind) {
    case 'top_per_pool':
    case 'best_of_position':
    case 'top_overall':
    case 'knockout_winners':
      return { ...rule, sourceStageId: ref(c, 'sourceStageId', 'stages', rule.sourceStageId) };
    case 'pool_position': {
      const sourceStageId = ref(c, 'sourceStageId', 'stages', rule.sourceStageId);
      const poolId = ref(c, 'poolId', 'pools', rule.poolId);
      return { ...rule, sourceStageId, poolId };
    }
    case 'manual':
      return rule;
    case 'direct_entry':
      return { ...rule, teamIds: refList(c, 'teamIds', 'teams', rule.teamIds) };
    default: {
      const unreachable: never = rule;
      return unreachable;
    }
  }
}

export function visitStage(row: Stage, c: Cursor): Stage {
  const id = key(c, 'id', 'stages', row.id);
  const tournamentId = ref(c, 'tournamentId', 'tournaments', row.tournamentId);
  const rulesCursor = at(at(c, 'config'), 'entryRules');
  const entryRules = row.config.entryRules.map((rule, index) => visitEntryRule(rule, item(rulesCursor, index)));
  return { ...row, id, tournamentId, config: { ...row.config, entryRules } };
}

export function visitPool(row: Pool, c: Cursor): Pool {
  const id = key(c, 'id', 'pools', row.id);
  const stageId = ref(c, 'stageId', 'stages', row.stageId);
  return { ...row, id, stageId };
}

function visitSlotSource(source: SlotSource, c: Cursor): SlotSource {
  switch (source.kind) {
    case 'pool_position': {
      const stageId = ref(c, 'stageId', 'stages', source.stageId);
      const poolId = ref(c, 'poolId', 'pools', source.poolId);
      return { ...source, stageId, poolId };
    }
    case 'best_of_position':
    case 'overall_position':
    case 'bracket_winner':
    case 'bracket_loser':
      return { ...source, stageId: ref(c, 'stageId', 'stages', source.stageId) };
    case 'fixture_winner':
    case 'fixture_loser':
      return { ...source, fixtureId: ref(c, 'fixtureId', 'fixtures', source.fixtureId) };
    case 'manual':
      return { ...source, teamId: optionalRef(c, 'teamId', 'teams', source.teamId) };
    default: {
      const unreachable: never = source;
      return unreachable;
    }
  }
}

export function visitSlot(row: StageSlot, c: Cursor): StageSlot {
  const id = key(c, 'id', 'slots', row.id);
  const stageId = ref(c, 'stageId', 'stages', row.stageId);
  const source = visitSlotSource(row.source, at(c, 'source'));
  return { ...row, id, stageId, source };
}

export function visitSide(side: FixtureSide, c: Cursor): FixtureSide {
  switch (side.kind) {
    case 'team':
      return { ...side, teamId: ref(c, 'teamId', 'teams', side.teamId) };
    case 'slot':
      return { ...side, slotId: ref(c, 'slotId', 'slots', side.slotId) };
    default: {
      const unreachable: never = side;
      return unreachable;
    }
  }
}

export function visitPoolEntry(row: PoolEntry, c: Cursor): PoolEntry {
  const id = key(c, 'id', 'poolEntries', row.id);
  const poolId = ref(c, 'poolId', 'pools', row.poolId);
  const stageId = ref(c, 'stageId', 'stages', row.stageId);
  const side = visitSide(row.side, at(c, 'side'));
  return { ...row, id, poolId, stageId, side };
}

function visitMatchSides(sides: Fixture['matchSides'], c: Cursor): Fixture['matchSides'] {
  if (sides === null) {
    return null;
  }
  const teamAId = ref(c, 'teamAId', 'teams', sides.teamAId);
  const teamBId = ref(c, 'teamBId', 'teams', sides.teamBId);
  return { teamAId, teamBId };
}

export function visitFixture(row: Fixture, c: Cursor): Fixture {
  const id = key(c, 'id', 'fixtures', row.id);
  const tournamentId = ref(c, 'tournamentId', 'tournaments', row.tournamentId);
  const stageId = ref(c, 'stageId', 'stages', row.stageId);
  const poolId = optionalRef(c, 'poolId', 'pools', row.poolId);
  const sideA = visitSide(row.sideA, at(c, 'sideA'));
  const sideB = visitSide(row.sideB, at(c, 'sideB'));
  const venueId = optionalRef(c, 'venueId', 'venues', row.venueId);
  const matchId = optionalRef(c, 'matchId', 'matches', row.matchId);
  const matchSides = visitMatchSides(row.matchSides, at(c, 'matchSides'));
  return { ...row, id, tournamentId, stageId, poolId, sideA, sideB, venueId, matchId, matchSides };
}

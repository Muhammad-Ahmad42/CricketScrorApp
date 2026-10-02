import type { DeliveryWicket, Match, MatchEndOutcome, MatchEvent, MatchPlayer, MatchResult, Toss } from '@/domain/types';
import { at, item, key, link, optionalRef, ref, refList, type Cursor } from './cursor';

export type BackupMatchPlayer = Omit<MatchPlayer, 'name' | 'jerseyNumber' | 'role'>;

function visitToss(toss: Toss | null, c: Cursor): Toss | null {
  return toss === null ? null : { ...toss, winnerTeamId: ref(c, 'winnerTeamId', 'teams', toss.winnerTeamId) };
}

function visitResult(result: MatchResult | null, c: Cursor): MatchResult | null {
  if (result === null) {
    return null;
  }
  switch (result.type) {
    case 'win':
    case 'walkover': {
      const winnerTeamId = ref(c, 'winnerTeamId', 'teams', result.winnerTeamId);
      const loserTeamId = ref(c, 'loserTeamId', 'teams', result.loserTeamId);
      return { ...result, winnerTeamId, loserTeamId };
    }
    case 'awarded': {
      const winnerTeamId = optionalRef(c, 'winnerTeamId', 'teams', result.winnerTeamId);
      const loserTeamId = optionalRef(c, 'loserTeamId', 'teams', result.loserTeamId);
      return { ...result, winnerTeamId, loserTeamId };
    }
    case 'tie': {
      if (result.decider === null) {
        return result;
      }
      const decider = at(c, 'decider');
      return { ...result, decider: { ...result.decider, winnerTeamId: ref(decider, 'winnerTeamId', 'teams', result.decider.winnerTeamId) } };
    }
    case 'no_result':
    case 'abandoned':
      return result;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export function visitMatch(row: Match, c: Cursor): Match {
  const id = key(c, 'id', 'matches', row.id);
  const teamAId = ref(c, 'teamAId', 'teams', row.teamAId);
  const teamBId = ref(c, 'teamBId', 'teams', row.teamBId);
  const venueId = optionalRef(c, 'venueId', 'venues', row.venueId);
  const toss = visitToss(row.toss, at(c, 'toss'));
  const result = visitResult(row.result, at(c, 'result'));
  const winnerTeamId = optionalRef(c, 'winnerTeamId', 'teams', row.winnerTeamId);
  const tournamentId = optionalRef(c, 'tournamentId', 'tournaments', row.tournamentId);
  const fixtureId = optionalRef(c, 'fixtureId', 'fixtures', row.fixtureId);
  return { ...row, id, teamAId, teamBId, venueId, toss, result, winnerTeamId, tournamentId, fixtureId };
}

export function visitMatchPlayer(row: BackupMatchPlayer, c: Cursor): BackupMatchPlayer {
  const matchId = ref(c, 'matchId', 'matches', row.matchId);
  const playerId = ref(c, 'playerId', 'players', row.playerId);
  const teamId = ref(c, 'teamId', 'teams', row.teamId);
  return { ...row, matchId, playerId, teamId };
}

function visitWicket(wicket: DeliveryWicket | null, c: Cursor): DeliveryWicket | null {
  if (wicket === null) {
    return null;
  }
  const playerOutId = ref(c, 'playerOutId', 'players', wicket.playerOutId);
  const fielderIds = refList(c, 'fielderIds', 'players', wicket.fielderIds);
  return { ...wicket, playerOutId, fielderIds };
}

function visitOutcome(outcome: MatchEndOutcome, c: Cursor): MatchEndOutcome {
  switch (outcome.type) {
    case 'tie_decided':
    case 'walkover':
      return { ...outcome, winnerTeamId: ref(c, 'winnerTeamId', 'teams', outcome.winnerTeamId) };
    case 'awarded':
      return { ...outcome, winnerTeamId: optionalRef(c, 'winnerTeamId', 'teams', outcome.winnerTeamId) };
    case 'natural':
    case 'no_result':
    case 'abandoned':
      return outcome;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

function visitPayload(event: MatchEvent, c: Cursor): MatchEvent {
  switch (event.kind) {
    case 'innings_started': {
      const battingTeamId = ref(c, 'battingTeamId', 'teams', event.battingTeamId);
      const strikerId = ref(c, 'strikerId', 'players', event.strikerId);
      const nonStrikerId = ref(c, 'nonStrikerId', 'players', event.nonStrikerId);
      const bowlerId = ref(c, 'bowlerId', 'players', event.bowlerId);
      return { ...event, battingTeamId, strikerId, nonStrikerId, bowlerId };
    }
    case 'delivery': {
      const strikerId = ref(c, 'strikerId', 'players', event.strikerId);
      const nonStrikerId = optionalRef(c, 'nonStrikerId', 'players', event.nonStrikerId);
      const bowlerId = ref(c, 'bowlerId', 'players', event.bowlerId);
      const wicket = visitWicket(event.wicket, at(c, 'wicket'));
      return { ...event, strikerId, nonStrikerId, bowlerId, wicket };
    }
    case 'batter_in':
    case 'batter_retired':
      return { ...event, playerId: ref(c, 'playerId', 'players', event.playerId) };
    case 'bowler_selected':
      return { ...event, bowlerId: ref(c, 'bowlerId', 'players', event.bowlerId) };
    case 'batter_dismissed': {
      const playerId = ref(c, 'playerId', 'players', event.playerId);
      const fielderIds = refList(c, 'fielderIds', 'players', event.fielderIds);
      return { ...event, playerId, fielderIds };
    }
    case 'penalty_awarded':
      return { ...event, teamId: ref(c, 'teamId', 'teams', event.teamId) };
    case 'innings_ended': {
      const list = at(c, 'absentees');
      const absentees = event.absentees.map((absentee, index) => ({
        ...absentee,
        playerId: ref(item(list, index), 'playerId', 'players', absentee.playerId),
      }));
      return { ...event, absentees };
    }
    case 'match_ended':
      return { ...event, outcome: visitOutcome(event.outcome, at(c, 'outcome')) };
    case 'strike_swapped':
    case 'overs_revised':
    case 'play_suspended':
    case 'play_resumed':
    case 'super_over_started':
      return event;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

export function visitMatchEvent(row: MatchEvent, c: Cursor): MatchEvent {
  const id = key(c, 'id', 'matchEvents', row.id);
  const matchId = ref(c, 'matchId', 'matches', row.matchId);
  const actionId = link(c, 'actionId', 'matchEvents', row.actionId);
  const payload = visitPayload(row, c);
  return { ...payload, id, matchId, actionId };
}

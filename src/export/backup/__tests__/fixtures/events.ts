import type { ActionId, MatchEvent, MatchEventPayload, MatchId } from '@/domain/types';
import { at } from './rules';

export function eventLog(matchId: MatchId, payloads: readonly (MatchEventPayload | readonly [MatchEventPayload, ActionId])[]): MatchEvent[] {
  let action = 0;
  return payloads.map((entry, index) => {
    const seq = index + 1;
    const [payload, actionId] = Array.isArray(entry) ? (entry as readonly [MatchEventPayload, ActionId]) : [entry as MatchEventPayload, null];
    if (actionId === null) {
      action += 1;
    }
    return {
      ...payload,
      id: `${matchId}-e${seq}`,
      matchId,
      seq,
      actionId: actionId ?? `${matchId}-a${action}`,
      recordedAt: at(seq),
    } as MatchEvent;
  });
}

export interface ChaseSides {
  readonly battingFirst: { readonly teamId: string; readonly players: readonly [string, string, string] };
  readonly chasing: { readonly teamId: string; readonly players: readonly [string, string, string] };
}

function fair(strikerId: string, nonStrikerId: string, bowlerId: string, runsRun: number, boundary: 0 | 4 | 6 = 0): MatchEventPayload {
  return { kind: 'delivery', call: 'fair', runsTo: 'bat', strikerId, nonStrikerId, bowlerId, runsRun, shortRuns: 0, boundary, wicket: null };
}

export function validOneOverLog(matchId: MatchId, sides: ChaseSides): MatchEvent[] {
  const [a1, a2, a3] = sides.battingFirst.players;
  const [b1, b2, b3] = sides.chasing.players;
  const caught: MatchEventPayload = {
    kind: 'delivery',
    call: 'fair',
    runsTo: 'bat',
    strikerId: a2,
    nonStrikerId: a1,
    bowlerId: b3,
    runsRun: 0,
    shortRuns: 0,
    boundary: 0,
    wicket: { type: 'caught', playerOutId: a2, fielderIds: [b1], dismissalEnd: null },
  };
  const wicketAction = `${matchId}-wicket`;
  return eventLog(matchId, [
    { kind: 'innings_started', inningsIndex: 0, battingTeamId: sides.battingFirst.teamId, strikerId: a1, nonStrikerId: a2, bowlerId: b3 },
    fair(a1, a2, b3, 1),
    fair(a2, a1, b3, 0, 4),
    fair(a2, a1, b3, 0),
    [caught, wicketAction],
    [{ kind: 'batter_in', playerId: a3, position: 'striker' }, wicketAction],
    fair(a3, a1, b3, 2),
    fair(a3, a1, b3, 1),
    { kind: 'innings_started', inningsIndex: 1, battingTeamId: sides.chasing.teamId, strikerId: b1, nonStrikerId: b2, bowlerId: a3 },
    fair(b1, b2, a3, 0, 6),
    fair(b1, b2, a3, 0, 4),
    { kind: 'match_ended', outcome: { type: 'natural' } },
  ]);
}

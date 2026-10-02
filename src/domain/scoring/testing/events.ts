import type { IsoDateTime, MatchEvent, MatchEventInput, MatchSetup, Seq } from '../../types';

export const SCRIPT_START: IsoDateTime = '2026-05-01T10:00:00.000Z';

export function isoAt(secondsAfterStart: number, start: IsoDateTime = SCRIPT_START): IsoDateTime {
  return new Date(Date.parse(start) + secondsAfterStart * 1000).toISOString();
}

export function envelope(setup: MatchSetup, payload: MatchEventInput, seq: Seq, actionId: string): MatchEvent {
  return { ...payload, id: `e${seq}`, matchId: setup.matchId, seq, actionId, recordedAt: isoAt(seq - 1) };
}

export function rawEvents(setup: MatchSetup, payloads: readonly MatchEventInput[], opts?: { readonly firstSeq?: Seq }): MatchEvent[] {
  const first = opts?.firstSeq ?? 1;
  return payloads.map((payload, index) => envelope(setup, payload, first + index, `a${first + index}`));
}

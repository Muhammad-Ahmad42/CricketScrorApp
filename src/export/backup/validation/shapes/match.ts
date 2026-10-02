import { MATCH_STATUSES } from '@/domain/types';
import type { Match, MatchResult, TieDecider, Toss, WinMargin } from '@/domain/types';
import type { BackupMatchPlayer } from '../../ids';
import {
  bool,
  discriminated,
  idText,
  integer,
  isoDate,
  isoDateTime,
  literal,
  localTime,
  nonEmptyText,
  nullable,
  object,
  text,
  type Guard,
} from '../guards';
import { matchRules } from './rules';

export const winMargin: Guard<WinMargin> = discriminated<WinMargin, 'kind'>('kind', {
  runs: object<Extract<WinMargin, { readonly kind: 'runs' }>>({ kind: literal('runs'), runs: integer(0) }),
  wickets: object<Extract<WinMargin, { readonly kind: 'wickets' }>>({
    kind: literal('wickets'),
    wickets: integer(0),
    ballsRemaining: integer(0),
  }),
});

export const tieDecisionMethod = literal('super_over', 'boundary_count', 'bowl_out', 'coin_toss', 'organizer');

const tieDecider = object<TieDecider>({ method: tieDecisionMethod, winnerTeamId: idText, superOverRounds: integer(0) });

type ResultOf<K extends MatchResult['type']> = Extract<MatchResult, { readonly type: K }>;

export const matchResult = discriminated<MatchResult, 'type'>('type', {
  win: object<ResultOf<'win'>>({
    type: literal('win'),
    winnerTeamId: idText,
    loserTeamId: idText,
    margin: winMargin,
    method: literal('normal', 'revised_target', 'par_score', 'penalty_runs'),
  }),
  tie: object<ResultOf<'tie'>>({ type: literal('tie'), decider: nullable(tieDecider) }),
  no_result: object<ResultOf<'no_result'>>({ type: literal('no_result'), reason: nullable(text) }),
  abandoned: object<ResultOf<'abandoned'>>({ type: literal('abandoned'), reason: nullable(text) }),
  walkover: object<ResultOf<'walkover'>>({
    type: literal('walkover'),
    winnerTeamId: idText,
    loserTeamId: idText,
    reason: nullable(text),
  }),
  awarded: object<ResultOf<'awarded'>>({
    type: literal('awarded'),
    winnerTeamId: nullable(idText),
    loserTeamId: nullable(idText),
    reason: nonEmptyText,
    margin: nullable(winMargin),
  }),
});

const toss = object<Toss>({ winnerTeamId: idText, decision: literal('bat', 'bowl') });

export const matchShape = object<Match>({
  id: idText,
  title: text,
  teamAId: idText,
  teamBId: idText,
  venueId: nullable(idText),
  scheduledDate: nullable(isoDate),
  scheduledTime: nullable(localTime),
  formatId: nonEmptyText,
  rules: matchRules,
  toss: nullable(toss),
  status: literal(...MATCH_STATUSES),
  result: nullable(matchResult),
  winnerTeamId: nullable(idText),
  tournamentId: nullable(idText),
  fixtureId: nullable(idText),
  teamAPlayers: nullable(integer(2, 15)),
  teamBPlayers: nullable(integer(2, 15)),
  resumeDismissedAt: nullable(isoDateTime),
  startedAt: nullable(isoDateTime),
  completedAt: nullable(isoDateTime),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const matchPlayerShape = object<BackupMatchPlayer>({
  matchId: idText,
  playerId: idText,
  teamId: idText,
  battingOrder: nullable(integer(1)),
  isCaptain: bool,
  isWicketKeeper: bool,
  isSubstitute: bool,
});

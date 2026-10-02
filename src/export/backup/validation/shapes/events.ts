import { DELIVERY_DISMISSAL_TYPES, OFF_BALL_DISMISSAL_TYPES, RETIREMENT_KINDS, RUNS_TO } from '@/domain/types';
import type { DeliveryWicket, EventEnvelope, MatchEndOutcome, MatchEvent, MatchEventOf } from '@/domain/types';
import { errorIssue } from '../issues';
import {
  arrayOf,
  bool,
  discriminated,
  idText,
  integer,
  isoDateTime,
  isRecord,
  literal,
  nonEmptyText,
  nullable,
  object,
  optional,
  reject,
  text,
  type FieldGuards,
  type Guard,
} from '../guards';
import { winMargin } from './match';
import { bowlerQuotaMode, powerplayRule } from './rules';

const envelope: FieldGuards<EventEnvelope> = {
  id: idText,
  matchId: idText,
  seq: integer(1),
  actionId: idText,
  recordedAt: isoDateTime,
};

type DeliveryEvent = MatchEventOf<'delivery'>;

const wicket = object<DeliveryWicket>({
  type: literal(...DELIVERY_DISMISSAL_TYPES),
  playerOutId: idText,
  fielderIds: arrayOf(idText),
  dismissalEnd: nullable(literal('striker_end', 'non_striker_end')),
});

const deliveryFields = object<Omit<DeliveryEvent, 'call' | 'runsTo'>>({
  ...envelope,
  kind: literal('delivery'),
  strikerId: idText,
  nonStrikerId: nullable(idText),
  bowlerId: idText,
  runsRun: integer(0, 9),
  shortRuns: integer(0, 9),
  boundary: literal(0, 4, 6),
  wicket: nullable(wicket),
});

const call = literal('fair', 'wide', 'no_ball');
const runsTo = literal(...RUNS_TO);

const delivery: Guard<DeliveryEvent> = (value, path, sink): value is DeliveryEvent => {
  if (!isRecord(value)) {
    return reject(sink, path, 'a group of values', value);
  }
  let ok = deliveryFields(value, path, sink);
  if (!call(value.call, `${path}.call`, sink)) {
    return false;
  }
  if (value.call === 'wide') {
    if (value.runsTo !== undefined) {
      sink.add(errorIssue('INVALID_VALUE', 'Every run off a wide is a wide, so a wide cannot say who the runs went to.', `${path}.runsTo`));
      ok = false;
    }
  } else if (!runsTo(value.runsTo, `${path}.runsTo`, sink)) {
    ok = false;
  }
  if (ok && typeof value.runsRun === 'number' && typeof value.shortRuns === 'number' && value.shortRuns > value.runsRun) {
    sink.add(errorIssue('INVALID_VALUE', 'There cannot be more short runs than runs completed.', `${path}.shortRuns`));
    ok = false;
  }
  if (ok && value.boundary === 6 && value.runsTo !== 'bat') {
    sink.add(errorIssue('INVALID_VALUE', 'A six can only come off the bat.', `${path}.boundary`));
    ok = false;
  }
  return ok;
};

type OutcomeOf<K extends MatchEndOutcome['type']> = Extract<MatchEndOutcome, { readonly type: K }>;

const outcome = discriminated<MatchEndOutcome, 'type'>('type', {
  natural: object<OutcomeOf<'natural'>>({ type: literal('natural') }),
  tie_decided: object<OutcomeOf<'tie_decided'>>({
    type: literal('tie_decided'),
    method: literal('boundary_count', 'bowl_out', 'coin_toss', 'organizer'),
    winnerTeamId: idText,
  }),
  no_result: object<OutcomeOf<'no_result'>>({ type: literal('no_result'), reason: nullable(text) }),
  abandoned: object<OutcomeOf<'abandoned'>>({ type: literal('abandoned'), reason: nullable(text) }),
  walkover: object<OutcomeOf<'walkover'>>({ type: literal('walkover'), winnerTeamId: idText, reason: nullable(text) }),
  awarded: object<OutcomeOf<'awarded'>>({
    type: literal('awarded'),
    winnerTeamId: nullable(idText),
    reason: nonEmptyText,
    margin: nullable(winMargin),
  }),
});


const absentee = object<MatchEventOf<'innings_ended'>['absentees'][number]>({ playerId: idText, hurt: bool });

export const matchEventShape = discriminated<MatchEvent, 'kind'>('kind', {
  innings_started: object<MatchEventOf<'innings_started'>>({
    ...envelope,
    kind: literal('innings_started'),
    inningsIndex: integer(0),
    battingTeamId: idText,
    strikerId: idText,
    nonStrikerId: idText,
    bowlerId: idText,
  }),
  delivery,
  batter_in: object<MatchEventOf<'batter_in'>>({
    ...envelope,
    kind: literal('batter_in'),
    playerId: idText,
    position: literal('striker', 'non_striker'),
  }),
  bowler_selected: object<MatchEventOf<'bowler_selected'>>({
    ...envelope,
    kind: literal('bowler_selected'),
    bowlerId: idText,
    reason: literal('over_start', 'injury', 'suspended'),
  }),
  strike_swapped: object<MatchEventOf<'strike_swapped'>>({ ...envelope, kind: literal('strike_swapped') }),
  batter_retired: object<MatchEventOf<'batter_retired'>>({
    ...envelope,
    kind: literal('batter_retired'),
    playerId: idText,
    retirement: literal(...RETIREMENT_KINDS),
  }),
  batter_dismissed: object<MatchEventOf<'batter_dismissed'>>({
    ...envelope,
    kind: literal('batter_dismissed'),
    playerId: idText,
    type: literal(...OFF_BALL_DISMISSAL_TYPES),
    fielderIds: arrayOf(idText),
  }),
  penalty_awarded: object<MatchEventOf<'penalty_awarded'>>({
    ...envelope,
    kind: literal('penalty_awarded'),
    teamId: idText,
    inningsIndex: integer(0),
    runs: integer(1),
    reason: text,
  }),
  overs_revised: object<MatchEventOf<'overs_revised'>>({
    ...envelope,
    kind: literal('overs_revised'),
    inningsIndex: integer(0),
    maxBalls: integer(1),
    target: nullable(integer(1)),
    maxOversPerBowler: optional(nullable(integer(1))),
    bowlerQuotaMode: optional(bowlerQuotaMode),
    powerplays: optional(arrayOf(powerplayRule)),
    terminal: bool,
    reason: text,
  }),
  play_suspended: object<MatchEventOf<'play_suspended'>>({
    ...envelope,
    kind: literal('play_suspended'),
    reason: literal('rain', 'bad_light', 'wet_outfield', 'interval', 'injury', 'other'),
    note: nullable(text),
  }),
  play_resumed: object<MatchEventOf<'play_resumed'>>({ ...envelope, kind: literal('play_resumed') }),
  innings_ended: object<MatchEventOf<'innings_ended'>>({
    ...envelope,
    kind: literal('innings_ended'),
    reason: literal('declared', 'batters_unavailable'),
    absentees: arrayOf(absentee),
  }),
  super_over_started: object<MatchEventOf<'super_over_started'>>({
    ...envelope,
    kind: literal('super_over_started'),
    round: integer(1),
  }),
  match_ended: object<MatchEventOf<'match_ended'>>({ ...envelope, kind: literal('match_ended'), outcome }),
});


import {
  BOWLER_CREDITED_DISMISSALS,
  type BallRecord,
  type BallToken,
  type DismissalRecord,
  type InningsState,
  type MatchEventOf,
  type MatchSetup,
  type OverSummary,
  type PlayerId,
} from '../../../types';
import { ballToken } from '../../format';
import { deliveryFigures, type DeliveryFigures } from '../delivery';
import { appended, extrasOf, replacedAt, thawInnings, thawOver, thawPhase, type InningsDraft, type StateDraft } from '../draft';
import { inProgressInnings, isLoneMode } from '../eligibility';
import {
  enterLoneModeIfDue,
  putInnings,
  recordWicket,
  setBowler,
  setPositions,
  updateBattingRow,
  updateBowlingRow,
} from '../innings';
import { addToPartnership } from '../partnerships';
import { isStrikerOnly } from '../validation/delivery';

type DeliveryEvent = MatchEventOf<'delivery'>;

interface Context {
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId | null;
  readonly bowlerId: PlayerId;
  readonly overIndex: number;
  readonly ballInOver: number;
  readonly deliveryInOver: number;
  readonly previousOver: OverSummary | null;
  readonly endsOver: boolean;
  readonly isFreeHit: boolean;
  readonly figures: DeliveryFigures;
}

function contextOf(setup: MatchSetup, innings: InningsState, event: DeliveryEvent): Context {
  const bpo = setup.rules.ballsPerOver;
  const figures = deliveryFigures(setup.rules, event);
  const overIndex = Math.floor(innings.legalBalls / bpo);
  const last = innings.overs[innings.overs.length - 1];
  const previousOver = last !== undefined && !last.isComplete && last.overIndex === overIndex ? last : null;
  return {
    strikerId: innings.strikerId ?? event.strikerId,
    nonStrikerId: innings.nonStrikerId,
    bowlerId: innings.bowlerId ?? event.bowlerId,
    overIndex,
    ballInOver: (innings.legalBalls % bpo) + 1,
    deliveryInOver: previousOver === null ? 1 : previousOver.tokens.length + 1,
    previousOver,
    endsOver: figures.isLegal && (innings.legalBalls + 1) % bpo === 0,
    isFreeHit: innings.isFreeHitNext,
    figures,
  };
}

function addRuns(setup: MatchSetup, innings: InningsDraft, ctx: Context, call: DeliveryEvent['call']): void {
  const { figures } = ctx;
  const extras = innings.extras;
  innings.runs += figures.totalRuns;
  innings.legalBalls += figures.isLegal ? 1 : 0;
  innings.extras = extrasOf(
    extras.wides + figures.extras.wides,
    extras.noBalls + figures.extras.noBalls,
    extras.byes + figures.extras.byes,
    extras.legByes + figures.extras.legByes,
    extras.penalty,
  );
  updateBattingRow(innings, ctx.strikerId, (row) => {
    row.runs += figures.batterRuns;
    row.balls += figures.isBallFaced ? 1 : 0;
    row.fours += figures.isFour ? 1 : 0;
    row.sixes += figures.isSix ? 1 : 0;
    row.dots += figures.isBallFaced && figures.batterRuns === 0 ? 1 : 0;
  });
  const alreadyInOver = ctx.previousOver !== null && ctx.previousOver.bowlerIds.includes(ctx.bowlerId);
  updateBowlingRow(setup, innings, ctx.bowlerId, (row) => {
    row.legalBalls += figures.isLegal ? 1 : 0;
    row.oversUsed += alreadyInOver ? 0 : 1;
    row.runsConceded += figures.bowlerRuns;
    row.dots += figures.isLegal && figures.bowlerRuns === 0 ? 1 : 0;
    row.wideDeliveries += call === 'wide' ? 1 : 0;
    row.wideRuns += figures.extras.wides;
    row.noBallDeliveries += call === 'no_ball' ? 1 : 0;
    row.foursConceded += figures.isFour ? 1 : 0;
    row.sixesConceded += figures.isSix ? 1 : 0;
    row.isCurrent = true;
  });
  addToPartnership(innings, ctx.strikerId, {
    totalRuns: figures.totalRuns,
    batterRuns: figures.batterRuns,
    extraRuns: figures.extraRuns,
    legal: figures.isLegal,
    faced: figures.isBallFaced,
  });
}

function applyWicket(setup: MatchSetup, innings: InningsDraft, event: DeliveryEvent, ctx: Context, striker: PlayerId | null, nonStriker: PlayerId | null): DismissalRecord | null {
  const wicket = event.wicket;
  if (wicket === null) {
    setPositions(innings, striker, nonStriker);
    return null;
  }
  const credited = (BOWLER_CREDITED_DISMISSALS as readonly string[]).includes(wicket.type) ? ctx.bowlerId : null;
  const dismissal = recordWicket(setup, innings, {
    type: wicket.type,
    playerOutId: wicket.playerOutId,
    bowlerId: ctx.bowlerId,
    creditedBowlerId: credited,
    fielderIds: wicket.fielderIds,
    seq: event.seq,
    onDelivery: true,
    overLabel: `${ctx.overIndex}.${ctx.ballInOver}`,
  });
  if (isStrikerOnly(wicket.type)) {
    setPositions(innings, striker === wicket.playerOutId ? null : striker, nonStriker === wicket.playerOutId ? null : nonStriker);
  } else {
    const notOut = [striker, nonStriker].find((id) => id !== null && id !== wicket.playerOutId) ?? null;
    const outAtStrikerEnd = wicket.dismissalEnd === 'striker_end';
    setPositions(innings, outAtStrikerEnd ? null : notOut, outAtStrikerEnd ? notOut : null);
  }
  enterLoneModeIfDue(setup, innings);
  return dismissal;
}

function updateOver(innings: InningsDraft, ctx: Context, token: BallToken, wicket: boolean): OverSummary {
  const previous = ctx.previousOver;
  const over = previous === null ? null : thawOver(previous);
  const bowlerIds = previous === null ? [ctx.bowlerId] : previous.bowlerIds.includes(ctx.bowlerId) ? previous.bowlerIds : appended(previous.bowlerIds, ctx.bowlerId);
  const bowlerRuns = (previous?.bowlerRuns ?? 0) + ctx.figures.bowlerRuns;
  const next: OverSummary = {
    overIndex: ctx.overIndex,
    bowlerIds,
    runs: (over?.runs ?? 0) + ctx.figures.totalRuns,
    bowlerRuns,
    wickets: (over?.wickets ?? 0) + (wicket ? 1 : 0),
    legalBalls: (over?.legalBalls ?? 0) + (ctx.figures.isLegal ? 1 : 0),
    extras: (over?.extras ?? 0) + ctx.figures.extraRuns,
    tokens: appended(over?.tokens ?? [], token),
    isComplete: ctx.endsOver,
    isMaiden: ctx.endsOver && bowlerIds.length === 1 && bowlerRuns === 0,
    scoreAtEnd: { runs: innings.runs, wickets: innings.wickets },
  };
  innings.overs = previous === null ? appended(innings.overs, next) : replacedAt(innings.overs, innings.overs.length - 1, next);
  return next;
}

function updatePowerplay(innings: InningsDraft, ctx: Context, wicket: boolean): string | null {
  const overNumber = ctx.overIndex + 1;
  const index = innings.powerplay.phases.findIndex((phase) => phase.rule.fromOver <= overNumber && overNumber <= phase.rule.toOver);
  if (index < 0) {
    return null;
  }
  const phase = thawPhase(innings.powerplay.phases[index]);
  phase.runs += ctx.figures.totalRuns;
  phase.wickets += wicket ? 1 : 0;
  phase.legalBalls += ctx.figures.isLegal ? 1 : 0;
  innings.powerplay = { active: innings.powerplay.active, phases: replacedAt(innings.powerplay.phases, index, phase) };
  return phase.rule.name;
}

export function applyDelivery(setup: MatchSetup, state: StateDraft, event: DeliveryEvent): void {
  const start = inProgressInnings(state);
  if (start === null) {
    return;
  }
  const ctx = contextOf(setup, start, event);
  const lone = isLoneMode(setup, start);
  const innings = thawInnings(start);
  addRuns(setup, innings, ctx, event.call);
  const rotate = !lone && event.runsRun % 2 === 1;
  const striker = rotate ? ctx.nonStrikerId : ctx.strikerId;
  const nonStriker = rotate ? ctx.strikerId : ctx.nonStrikerId;
  const dismissal = applyWicket(setup, innings, event, ctx, striker, nonStriker);
  innings.isFreeHitNext = event.call === 'no_ball' ? setup.rules.noBall.freeHit : ctx.isFreeHit && event.call === 'wide';
  const powerplayName = updatePowerplay(innings, ctx, event.wicket !== null);
  const record: Omit<BallRecord, 'token'> = {
    seq: event.seq,
    eventId: event.id,
    inningsIndex: innings.index,
    overIndex: ctx.overIndex,
    ballInOver: ctx.ballInOver,
    deliveryInOver: ctx.deliveryInOver,
    label: `${ctx.overIndex}.${ctx.ballInOver}`,
    isLegal: ctx.figures.isLegal,
    isBallFaced: ctx.figures.isBallFaced,
    isFreeHit: ctx.isFreeHit,
    strikerId: ctx.strikerId,
    nonStrikerId: ctx.nonStrikerId,
    bowlerId: ctx.bowlerId,
    call: event.call,
    runsTo: ctx.figures.runsTo,
    runsRun: event.runsRun,
    shortRuns: event.shortRuns,
    boundary: event.boundary,
    batterRuns: ctx.figures.batterRuns,
    extras: ctx.figures.extras,
    extraRuns: ctx.figures.extraRuns,
    totalRuns: ctx.figures.totalRuns,
    bowlerRuns: ctx.figures.bowlerRuns,
    isFour: ctx.figures.isFour,
    isSix: ctx.figures.isSix,
    wicket: dismissal,
    endsOver: ctx.endsOver,
    scoreAfter: { runs: innings.runs, wickets: innings.wickets, legalBalls: innings.legalBalls },
    powerplayName,
    recordedAt: event.recordedAt,
  };
  const token = ballToken(record);
  const over = updateOver(innings, ctx, token, event.wicket !== null);
  innings.balls = appended(innings.balls, Object.assign(record, { token }));
  if (over.isMaiden) {
    updateBowlingRow(setup, innings, ctx.bowlerId, (row) => {
      row.maidens += 1;
    });
  }
  if (ctx.endsOver) {
    if (!isLoneMode(setup, innings)) {
      setPositions(innings, innings.nonStrikerId, innings.strikerId);
    }
    innings.previousOverBowlerIds = over.bowlerIds;
    setBowler(innings, null);
  }
  putInnings(state, innings);
}

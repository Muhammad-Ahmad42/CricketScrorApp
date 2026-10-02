import type { BracketPosition, FixtureDraft, FixtureSide, IdGenerator, SlotId, StageSlot } from '../../types';
import type { DraftDefaults, KnockoutBracketPlan } from '../fixtures';
import { bracketShape, standardBracketOrder } from '../knockout';
import { bracketFixtureLabel, roundNameFor, THIRD_PLACE_NAME } from './labels';

type SideRef =
  | { readonly kind: 'side'; readonly side: FixtureSide }
  | { readonly kind: 'winner' | 'loser'; readonly round: number; readonly position: number };

type Advance = { readonly kind: 'side'; readonly side: FixtureSide } | { readonly kind: 'fixture'; readonly round: number; readonly position: number };

interface PlannedFixture {
  readonly kind: 'main' | 'third_place';
  readonly round: number;
  readonly position: number;
  readonly sideA: SideRef;
  readonly sideB: SideRef;
}

interface PlannedSlot {
  readonly kind: 'winner' | 'loser';
  readonly round: number;
  readonly position: number;
}

export interface BracketOptions {
  readonly thirdPlacePlayoff: boolean;
  readonly rounds: number | null;
  readonly firstSlotIndex: number;
  readonly defaults: DraftDefaults;
}

function refFor(advance: Advance): SideRef {
  return advance.kind === 'side' ? advance : { kind: 'winner', round: advance.round, position: advance.position };
}

function planMainRounds(entrants: readonly FixtureSide[], size: number, roundsPlayed: number): readonly PlannedFixture[] {
  const order = standardBracketOrder(size);
  const fixtures: PlannedFixture[] = [];
  let advances: Advance[] = [];
  for (let position = 0; position < size / 2; position += 1) {
    const high = order[2 * position];
    const low = order[2 * position + 1];
    if (low > entrants.length) {
      advances.push({ kind: 'side', side: entrants[high - 1] });
    } else {
      fixtures.push({
        kind: 'main',
        round: 1,
        position,
        sideA: { kind: 'side', side: entrants[high - 1] },
        sideB: { kind: 'side', side: entrants[low - 1] },
      });
      advances.push({ kind: 'fixture', round: 1, position });
    }
  }
  for (let round = 2; round <= roundsPlayed; round += 1) {
    const next: Advance[] = [];
    for (let position = 0; position < advances.length / 2; position += 1) {
      fixtures.push({
        kind: 'main',
        round,
        position,
        sideA: refFor(advances[2 * position]),
        sideB: refFor(advances[2 * position + 1]),
      });
      next.push({ kind: 'fixture', round, position });
    }
    advances = next;
  }
  return fixtures;
}

function planThirdPlace(main: readonly PlannedFixture[], totalRounds: number): PlannedFixture | null {
  const semifinalRound = totalRounds - 1;
  const semis = main.filter((fixture) => fixture.round === semifinalRound);
  if (semifinalRound < 1 || semis.length !== 2) {
    return null;
  }
  return {
    kind: 'third_place',
    round: totalRounds,
    position: 0,
    sideA: { kind: 'loser', round: semifinalRound, position: 0 },
    sideB: { kind: 'loser', round: semifinalRound, position: 1 },
  };
}

function fixtureLabels(main: readonly PlannedFixture[], size: number): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const byRound = new Map<number, PlannedFixture[]>();
  for (const fixture of main) {
    byRound.set(fixture.round, [...(byRound.get(fixture.round) ?? []), fixture]);
  }
  for (const [round, fixtures] of byRound) {
    const teamsInRound = size / 2 ** (round - 1);
    [...fixtures]
      .sort((a, b) => a.position - b.position)
      .forEach((fixture, index) => labels.set(`${round}:${fixture.position}`, bracketFixtureLabel(teamsInRound, round, index + 1)));
  }
  return labels;
}

type ProgressionRef = Exclude<SideRef, { readonly kind: 'side' }>;

function plannedSlots(fixtures: readonly PlannedFixture[]): readonly PlannedSlot[] {
  const refs = fixtures.flatMap((fixture) => [fixture.sideA, fixture.sideB]);
  const progression = refs.filter((ref): ref is ProgressionRef => ref.kind !== 'side');
  const ofKind = (kind: 'winner' | 'loser'): readonly PlannedSlot[] =>
    progression
      .filter((ref) => ref.kind === kind)
      .map((ref) => ({ kind, round: ref.round, position: ref.position }))
      .sort((a, b) => a.round - b.round || a.position - b.position);
  return [...ofKind('winner'), ...ofKind('loser')];
}

export function planKnockoutBracket(entrants: readonly FixtureSide[], opts: BracketOptions, ids: IdGenerator): KnockoutBracketPlan {
  if (entrants.length < 2) {
    throw new RangeError(`A knockout needs at least 2 entrants, got ${entrants.length}.`);
  }
  const { size, totalRounds, roundsPlayed } = bracketShape(entrants.length, opts.rounds);
  const main = planMainRounds(entrants, size, roundsPlayed);
  const reachesFinal = roundsPlayed === totalRounds;
  const third = opts.thirdPlacePlayoff && reachesFinal ? planThirdPlace(main, totalRounds) : null;
  const planned = third ? [...main, third] : main;
  const labels = fixtureLabels(main, size);
  const slotPlan = plannedSlots(planned);
  const fixtureIds = planned.map(() => ids());
  const slotIds: readonly SlotId[] = slotPlan.map(() => ids());
  const slotKey = (kind: 'winner' | 'loser', round: number, position: number): string => `${kind}:${round}:${position}`;
  const slotIdByKey = new Map(slotPlan.map((slot, index) => [slotKey(slot.kind, slot.round, slot.position), slotIds[index]]));
  const { defaults } = opts;
  const slots: readonly StageSlot[] = slotPlan.map((slot, index) => {
    const fixtureLabel = labels.get(`${slot.round}:${slot.position}`) ?? '';
    return {
      id: slotIds[index],
      stageId: defaults.stageId,
      index: opts.firstSlotIndex + index,
      role: 'progression',
      label: `${slot.kind === 'winner' ? 'Winner' : 'Loser'} ${fixtureLabel}`,
      source: {
        kind: slot.kind === 'winner' ? 'bracket_winner' : 'bracket_loser',
        stageId: defaults.stageId,
        round: slot.round,
        position: slot.position,
      },
      seed: null,
    };
  });
  const resolve = (ref: SideRef): FixtureSide => {
    if (ref.kind === 'side') {
      return ref.side;
    }
    const slotId = slotIdByKey.get(slotKey(ref.kind, ref.round, ref.position));
    if (slotId === undefined) {
      throw new Error(`Missing progression slot for ${ref.kind} of round ${ref.round}, position ${ref.position}.`);
    }
    return { kind: 'slot', slotId };
  };
  const fixtures: readonly FixtureDraft[] = planned.map((fixture, index) => {
    const isThird = fixture.kind === 'third_place';
    const bracket: BracketPosition = {
      kind: fixture.kind,
      round: fixture.round,
      position: fixture.position,
      roundName: isThird ? THIRD_PLACE_NAME : roundNameFor(size / 2 ** (fixture.round - 1), fixture.round),
    };
    return {
      id: fixtureIds[index],
      tournamentId: defaults.tournamentId,
      stageId: defaults.stageId,
      poolId: defaults.poolId,
      matchNumber: defaults.startMatchNumber + index,
      label: isThird ? THIRD_PLACE_NAME : (labels.get(`${fixture.round}:${fixture.position}`) ?? null),
      round: fixture.round,
      leg: null,
      bracket,
      isFinal: !isThird && reachesFinal && fixture.round === totalRounds,
      sideA: resolve(fixture.sideA),
      sideB: resolve(fixture.sideB),
      scheduledDate: null,
      scheduledTime: null,
      venueId: defaults.venueId,
      status: 'scheduled',
      formatId: defaults.formatId,
      matchRules: defaults.matchRules,
      notes: null,
    };
  });
  return {
    fixtures,
    slots,
    entrySlotSeeds: entrants.flatMap((side, index) => (side.kind === 'slot' ? [{ slotId: side.slotId, seed: index + 1 }] : [])),
    byes: entrants.slice(0, size - entrants.length),
  };
}

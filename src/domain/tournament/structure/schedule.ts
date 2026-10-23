import type { FixtureDraft, IsoDate, LocalTime, VenueId } from '../../types';
import { nextIsoDate } from './dates';
import { sideKey } from './sides';

export interface SequentialScheduleOptions {
  readonly startDate: IsoDate;
  readonly matchesPerDay: number;
  readonly times: readonly LocalTime[];
  readonly restDates?: readonly IsoDate[];
  readonly venueIds?: readonly VenueId[];
}

interface DayState {
  count: number;
  readonly sides: Set<string>;
}

function roundOrder(drafts: readonly FixtureDraft[]): readonly number[] {
  return drafts
    .map((draft, index) => ({ index, round: draft.round ?? Number.MAX_SAFE_INTEGER, number: draft.matchNumber }))
    .sort((a, b) => a.round - b.round || a.number - b.number || a.index - b.index)
    .map((entry) => entry.index);
}

export function scheduleDrafts(drafts: readonly FixtureDraft[], opts: SequentialScheduleOptions): readonly FixtureDraft[] {
  if (!Number.isInteger(opts.matchesPerDay) || opts.matchesPerDay < 1) {
    throw new RangeError(`At least one match per day is needed, got ${opts.matchesPerDay}.`);
  }
  const rest = new Set(opts.restDates ?? []);
  const days = new Map<IsoDate, DayState>();
  const dayState = (date: IsoDate): DayState => {
    const existing = days.get(date);
    if (existing) {
      return existing;
    }
    const created: DayState = { count: 0, sides: new Set() };
    days.set(date, created);
    return created;
  };
  const isOpen = (date: IsoDate): boolean => !rest.has(date) && dayState(date).count < opts.matchesPerDay;
  let firstOpen = opts.startDate;
  while (!isOpen(firstOpen)) {
    firstOpen = nextIsoDate(firstOpen);
  }
  const venues = opts.venueIds ?? [];
  const placed = new Map<number, { readonly date: IsoDate; readonly time: LocalTime | null; readonly venueId: VenueId | null }>();
  for (const index of roundOrder(drafts)) {
    const draft = drafts[index];
    const keys = [sideKey(draft.sideA), sideKey(draft.sideB)];
    let date = firstOpen;
    while (!isOpen(date) || keys.some((key) => dayState(date).sides.has(key))) {
      date = nextIsoDate(date);
    }
    const state = dayState(date);
    const time = opts.times.length > 0 ? opts.times[state.count % opts.times.length] : null;
    const venueId = draft.venueId ?? (venues.length > 0 ? venues[Math.floor(state.count / Math.max(1, opts.times.length)) % venues.length] : null);
    state.count += 1;
    keys.forEach((key) => state.sides.add(key));
    placed.set(index, { date, time, venueId });
    while (!isOpen(firstOpen)) {
      firstOpen = nextIsoDate(firstOpen);
    }
  }
  return drafts.map((draft, index) => {
    const slot = placed.get(index);
    return slot ? { ...draft, scheduledDate: slot.date, scheduledTime: slot.time, venueId: slot.venueId } : draft;
  });
}

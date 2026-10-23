import { matchDisplayDate } from '../matchDates';

describe('matchDisplayDate (wave-3 bug #5)', () => {
  const base = { scheduledDate: '2026-10-04', updatedAt: '2026-10-01T12:55:00.000Z', startedAt: null, completedAt: null };

  it('a played tournament match shows the day play started, not the fixture date', () => {
    expect(matchDisplayDate({ ...base, startedAt: '2026-10-01T12:54:00.000Z', completedAt: '2026-10-01T12:55:00.000Z' })).toEqual({
      value: '2026-10-01T12:54:00.000Z',
      basis: 'played',
    });
  });

  it('falls back to the completion time when no start was recorded', () => {
    expect(matchDisplayDate({ ...base, completedAt: '2026-10-02T09:00:00.000Z' })).toEqual({ value: '2026-10-02T09:00:00.000Z', basis: 'played' });
  });

  it('an unplayed match shows its scheduled date, then its last update', () => {
    expect(matchDisplayDate(base)).toEqual({ value: '2026-10-04', basis: 'scheduled' });
    expect(matchDisplayDate({ ...base, scheduledDate: null })).toEqual({ value: '2026-10-01T12:55:00.000Z', basis: 'updated' });
  });

  it('accepts list items from before the played dates were read', () => {
    const legacy = { scheduledDate: null, updatedAt: '2026-10-01T00:00:00.000Z' };
    expect(matchDisplayDate(legacy)).toEqual({ value: '2026-10-01T00:00:00.000Z', basis: 'updated' });
  });
});

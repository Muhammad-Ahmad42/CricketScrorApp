/** @jest-environment node */
import type { TournamentSnapshot } from '@/domain/types';
import { fixturesReplaceSummary } from '../tournament/changeAudit';

function snapshot(fixtureIds: readonly string[]): TournamentSnapshot {
  return {
    stages: [{ id: 'ko', name: 'Knockouts' }],
    fixtures: fixtureIds.map((id) => ({ id, stageId: 'ko' })),
  } as unknown as TournamentSnapshot;
}

describe('fixture regeneration audit wording', () => {
  it('says how many fixtures were generated the first time', () => {
    expect(fixturesReplaceSummary(snapshot([]), 'ko', ['a', 'b', 'c'])).toBe('3 fixtures were generated for Knockouts.');
    expect(fixturesReplaceSummary(snapshot([]), 'ko', ['a'])).toBe('1 fixture was generated for Knockouts.');
  });

  it('says how many were removed and created when fixtures are regenerated', () => {
    expect(fixturesReplaceSummary(snapshot(['a', 'b', 'c', 'd']), 'ko', ['a', 'x', 'y', 'z', 'w'])).toBe('Knockouts fixtures regenerated: 3 removed, 4 created.');
  });
});

import { HEADLINE_LIMIT } from '@/domain/text';
import { evaluateTournament } from '../evaluate';
import { computeImpact, type ImpactContext } from '../impact';
import { builtinTemplates } from '../templates';
import { cupSnapshot } from './standingsKit/cup';
import { deepFreeze, played } from './standingsKit/summaries';

function ctx(): ImpactContext {
  let next = 0;
  return {
    ids: () => {
      next += 1;
      return `copy-${next}`;
    },
    now: '2026-10-05T12:00:00.000Z',
  };
}

describe('tournament copy is scannable (CLAUDE.md Microcopy, CLEANUP_BRIEF)', () => {
  it('built-in template descriptions are one short line', () => {
    for (const template of builtinTemplates()) {
      expect(template.description.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
      expect(template.description.endsWith('.')).toBe(false);
    }
  });

  it('qualification rows carry a headline, a chip-free note and a reason that does not repeat them', () => {
    const evaluation = evaluateTournament(cupSnapshot({ playedA: 4 }));
    const entries = evaluation.stages.flatMap((stage) => stage.qualification);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.headline?.length ?? 0).toBeGreaterThan(0);
      expect(entry.headline!.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
      expect(entry.detail?.length ?? 0).toBeGreaterThan(0);
      expect(entry.detail).not.toContain(entry.headline!);
      expect(entry.detail).not.toMatch(/in contention|have qualified|no longer qualify/i);
      expect(entry.note ?? '').not.toMatch(/in contention|eliminated|qualified/i);
    }
  });

  it('slot resolutions lead with "slot: team" and keep the reason as a detail', () => {
    for (const playedA of [undefined, 2, 4]) {
      const evaluation = evaluateTournament(cupSnapshot(playedA === undefined ? undefined : { playedA }));
      const slots = evaluation.stages.flatMap((stage) => stage.slots);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.headline?.length ?? 0).toBeGreaterThan(0);
        expect(slot.headline!.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
        expect(slot.headline!.endsWith('.')).toBe(false);
        expect(slot.explanation.startsWith(slot.headline!) || slot.explanation.includes(slot.headline!.split(': ')[1] ?? '')).toBe(true);
        if (slot.detail !== undefined) expect(slot.detail).toMatch(/[.!?]$/);
      }
    }
  });

  it('tie-break notes have short headlines next to the full explanation', () => {
    const evaluation = evaluateTournament(cupSnapshot());
    const notes = evaluation.stages.flatMap((stage) => stage.tables.flatMap((table) => table.rows.map((row) => row.tieBreak)));
    const filled = notes.filter((note) => note !== null && note.detail.length > 0);
    expect(filled.length).toBeGreaterThan(0);
    for (const note of filled) {
      expect(note?.headline?.length ?? 0).toBeGreaterThan(0);
      expect(note!.headline!.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
    }
  });

  it('impact previews lead with a short headline and give every key line a headline', () => {
    const snapshot = deepFreeze(cupSnapshot());
    const corrected = played('m6', { team: 'TIG', runs: 19, balls: 12, wickets: 4 }, { team: 'EAG', runs: 20, balls: 11, wickets: 2 }, { allotted: 12 });
    for (const summary of [corrected, null]) {
      const impact = computeImpact({ kind: 'match_result_change', matchId: 'm6', summary }, snapshot, ctx());
      expect(impact.headline.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
      expect(impact.headline.endsWith('.')).toBe(false);
      expect(impact.keyItems).toHaveLength(impact.keyLines?.length ?? 0);
      for (const item of impact.keyItems ?? []) {
        expect(item.headline.length).toBeLessThanOrEqual(HEADLINE_LIMIT);
      }
    }
  });
});

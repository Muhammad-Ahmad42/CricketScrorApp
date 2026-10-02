import type { Fixture, MatchSummary, SlotResolution, TeamId } from '../../types';
import { DEFAULT_KNOCKOUT_CONFIG } from '../defaults';
import { knockoutAdvancer } from '../knockout';
import type { AdvancementBasis } from '../knockout';
import { countedSummaryOf } from './sides';
import type { SnapshotIndex } from './snapshotIndex';
import { teamName } from './snapshotIndex';

export interface Advancement {
  readonly winnerTeamId: TeamId | null;
  readonly loserTeamId: TeamId | null;
  readonly basis: AdvancementBasis;
}

export type SeedOf = (teamId: TeamId) => number | null;

export function seedLookup(index: SnapshotIndex, stageId: string, lookup: (slotId: string) => SlotResolution | undefined): SeedOf {
  return (teamId) => {
    for (const slot of index.slotsByStage.get(stageId) ?? []) {
      if (slot.role !== 'entry' || slot.seed === null) continue;
      if (lookup(slot.id)?.teamId === teamId) return slot.seed;
    }
    return index.seeds.get(teamId) ?? null;
  };
}

export function fixtureSummary(index: SnapshotIndex, fixture: Fixture): MatchSummary | null {
  return countedSummaryOf(index.snapshot.summaries, fixture);
}

export function advance(
  index: SnapshotIndex,
  fixture: Fixture,
  teams: { readonly a: TeamId | null; readonly b: TeamId | null },
  seedOf: SeedOf,
): Advancement {
  const config = index.stageById.get(fixture.stageId)?.config.knockout ?? DEFAULT_KNOCKOUT_CONFIG;
  return knockoutAdvancer(fixture, teams, fixtureSummary(index, fixture), config, seedOf);
}

const DECIDED: readonly AdvancementBasis[] = ['result', 'walkover', 'awarded', 'tie_decider', 'higher_seed'];

export function isDecided(advancement: Advancement): boolean {
  return DECIDED.includes(advancement.basis) && advancement.winnerTeamId !== null;
}

function roundWord(fixture: Fixture): string {
  return (fixture.bracket?.roundName ?? fixture.label ?? 'match').toLowerCase();
}

function marginText(summary: MatchSummary | null, advancement: Advancement): string {
  if (!summary || summary.hypothetical) return '';
  const result = summary.result;
  switch (advancement.basis) {
    case 'result':
      if (result.type !== 'win') return '';
      return result.margin.kind === 'runs'
        ? ` (won by ${result.margin.runs} ${result.margin.runs === 1 ? 'run' : 'runs'})`
        : ` (won by ${result.margin.wickets} ${result.margin.wickets === 1 ? 'wicket' : 'wickets'})`;
    case 'tie_decider':
      if (result.type !== 'tie' || !result.decider) return ' (won the tie-break)';
      if (result.decider.method === 'super_over') return ' (won the super over)';
      if (result.decider.method === 'boundary_count') return ' (won on boundary count)';
      return ' (won the tie-break)';
    case 'walkover':
      return ' (walkover)';
    case 'awarded':
      return ' (awarded)';
    default:
      return '';
  }
}

function undecidedReason(summary: MatchSummary | null, fixture: Fixture): string {
  if (!summary) return `${roundWord(fixture)} not played yet`;
  switch (summary.result.type) {
    case 'tie':
      return `${roundWord(fixture)} tied`;
    case 'abandoned':
      return `${roundWord(fixture)} abandoned`;
    default:
      return `${roundWord(fixture)} had no result`;
  }
}

export function resolutionFromAdvancement(
  index: SnapshotIndex,
  slotId: string,
  label: string,
  fixture: Fixture,
  advancement: Advancement,
  take: 'winner' | 'loser',
): SlotResolution {
  const summary = fixtureSummary(index, fixture);
  const teamId = take === 'winner' ? advancement.winnerTeamId : advancement.loserTeamId;
  if (isDecided(advancement) && teamId !== null) {
    const name = teamName(index, teamId);
    const explanation =
      advancement.basis === 'higher_seed'
        ? `${label}: ${name}${take === 'winner' ? ' advance as the higher seed' : ''} (${undecidedReason(summary, fixture)})`
        : `${label}: ${name}${take === 'winner' ? marginText(summary, advancement) : ''}`;
    return { slotId, teamId, status: 'final', viaOverride: false, explanation };
  }
  if (advancement.basis === 'organizer_required' || advancement.basis === 'shared') {
    return {
      slotId,
      teamId: null,
      status: 'pending',
      viaOverride: false,
      explanation: `${label}: to be decided by the organizer (${undecidedReason(summary, fixture)})`,
    };
  }
  return { slotId, teamId: null, status: 'pending', viaOverride: false, explanation: `${label}: to be decided` };
}

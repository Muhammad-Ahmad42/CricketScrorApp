import type {
  Fixture,
  SlotId,
  SlotResolution,
  StageEvaluation,
  StageId,
  StageSlot,
  StandingRow,
  StandingsTable,
  TeamId,
  TournamentOverride,
  UnevenPoolNormalization,
} from '../../types';
import { advance, resolutionFromAdvancement, seedLookup } from './advance';
import type { SeedOf } from './advance';
import { byeSeedAt } from './bracket';
import { comparisonKey } from './downstream';
import { formatSignedNrr, ordinal, pointsText } from './format';
import { slotPhrase } from './qualificationText';
import { analysePool, DEFAULT_ENUMERATION_LIMIT, positionLocked } from './scenarios';
import type { SnapshotIndex } from './snapshotIndex';
import { teamName } from './snapshotIndex';
import { sourceStageInputs } from './sourceInputs';
import { fixtureTeamsVia } from './stageTables';
import { asSentence, explain } from '../../text';

type Pin = { readonly slot: StageSlot; readonly teamId: TeamId; readonly reason: string; readonly rank: number; readonly createdAt: string };

function pending(slotId: SlotId, explanation: string, headline?: string, detail?: string): SlotResolution {
  return { slotId, teamId: null, status: 'pending', viaOverride: false, explanation, ...explain(headline ?? explanation, detail) };
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

interface SlotText {
  readonly explanation: string;
  readonly headline: string;
  readonly detail: string | null;
}

const DROPPED_RESULTS = "Results against the lowest-placed teams of larger pools don't count.";

export function slotDescriptor(index: SnapshotIndex, slot: StageSlot): string {
  if (slot.source.kind !== 'pool_position') return slot.label;
  const pool = index.poolById.get(slot.source.poolId);
  const position = slot.source.position;
  const word = position === 1 ? 'winner' : position === 2 ? 'runner-up' : ordinal(position);
  return pool ? `${pool.name} ${word}` : slot.label;
}

function rowSummary(row: StandingRow): string {
  return `${pointsText(row.points)}, NRR ${formatSignedNrr(row.nrr)}`;
}

function crossFigures(row: StandingRow, normalization: UnevenPoolNormalization): string {
  if (normalization === 'per_match_average') {
    const average = row.played > 0 ? row.points / row.played : 0;
    return `${average.toFixed(2)} pts per match, NRR ${formatSignedNrr(row.nrr)}`;
  }
  return rowSummary(row);
}

type ResolvedRow = StandingRow & { readonly teamId: TeamId };

function isResolvedRow(row: StandingRow): row is ResolvedRow {
  return row.teamId !== null;
}

function crossExplanation(
  index: SnapshotIndex,
  slot: StageSlot,
  normalization: UnevenPoolNormalization,
  row: ResolvedRow,
  next: StandingRow | undefined,
): SlotText {
  const name = teamName(index, row.teamId);
  const ahead = next && next.teamId !== null ? `, ahead of ${teamName(index, next.teamId)}` : '';
  const dropping = normalization === 'drop_extra_results';
  const dropped = dropping ? ' (results against the lowest-placed teams of larger pools are not counted)' : '';
  const phrase = slotPhrase(index, slot);
  const figures = `${capitalise(phrase)}: ${crossFigures(row, normalization)}${ahead}.`;
  return {
    explanation: `${name} are ${phrase}: ${crossFigures(row, normalization)}${ahead}${dropped}`,
    headline: `${slotDescriptor(index, slot)}: ${name}`,
    detail: dropping ? `${figures} ${DROPPED_RESULTS}` : figures,
  };
}

export class StageSlotResolver {
  private readonly results = new Map<SlotId, SlotResolution>();
  private readonly placed = new Map<TeamId, SlotId>();
  private readonly inProgress = new Set<SlotId>();
  private readonly earlierSlots = new Map<SlotId, SlotResolution>();
  private readonly earlierById: ReadonlyMap<StageId, StageEvaluation>;
  private readonly slots: readonly StageSlot[];
  private readonly eliminated: ReadonlySet<TeamId>;

  constructor(
    private readonly index: SnapshotIndex,
    private readonly stageId: StageId,
    private readonly earlier: readonly StageEvaluation[],
  ) {
    this.earlierById = new Map(earlier.map((evaluation) => [evaluation.stageId, evaluation]));
    earlier.forEach((evaluation) => evaluation.slots.forEach((resolution) => this.earlierSlots.set(resolution.slotId, resolution)));
    this.slots = index.slotsByStage.get(stageId) ?? [];
    this.eliminated = new Set(
      index.activeOverrides
        .filter((o): o is Extract<TournamentOverride, { kind: 'qualification' }> => o.kind === 'qualification')
        .filter((o) => o.action === 'eliminate' && o.stageId === stageId)
        .map((o) => o.teamId),
    );
  }

  resolveAll(): readonly SlotResolution[] {
    this.applyPins();
    for (const slot of this.slots) {
      if (slot.role !== 'entry' || this.results.has(slot.id)) continue;
      const resolution = this.resolveEntry(slot);
      this.results.set(slot.id, resolution);
      if (resolution.teamId !== null) this.placed.set(resolution.teamId, slot.id);
    }
    for (const slot of this.slots) {
      if (slot.role === 'progression') this.resolveProgression(slot);
    }
    return this.slots.map((slot) => this.results.get(slot.id) ?? pending(slot.id, `${slot.label}: to be decided`));
  }

  lookup = (slotId: SlotId): SlotResolution | undefined => {
    const own = this.results.get(slotId) ?? this.earlierSlots.get(slotId);
    if (own) return own;
    const slot = this.index.slotById.get(slotId);
    if (slot && slot.stageId === this.stageId && slot.role === 'progression') return this.resolveProgression(slot);
    return undefined;
  };

  private pins(): readonly Pin[] {
    const pins: Pin[] = [];
    for (const override of this.index.activeOverrides) {
      if (override.kind === 'slot_assignment') {
        const slot = this.index.slotById.get(override.slotId);
        if (slot && slot.stageId === this.stageId) pins.push({ slot, teamId: override.teamId, reason: override.reason, rank: 0, createdAt: override.createdAt });
      }
      if (override.kind === 'qualification' && override.action !== 'eliminate' && override.stageId === this.stageId && override.slotId !== null) {
        const slot = this.index.slotById.get(override.slotId);
        if (slot && slot.stageId === this.stageId) {
          pins.push({ slot, teamId: override.teamId, reason: override.reason, rank: override.action === 'qualify' ? 1 : 2, createdAt: override.createdAt });
        }
      }
    }
    return pins.sort((a, b) => a.rank - b.rank || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  private applyPins(): void {
    for (const pin of this.pins()) {
      if (this.results.has(pin.slot.id)) continue;
      if (pin.slot.role === 'entry' && this.placed.has(pin.teamId)) continue;
      const headline = `${slotDescriptor(this.index, pin.slot)}: ${teamName(this.index, pin.teamId)}`;
      this.results.set(pin.slot.id, {
        slotId: pin.slot.id,
        teamId: pin.teamId,
        status: 'final',
        viaOverride: true,
        explanation: `${headline} (Manual Override: '${pin.reason}')`,
        ...explain(headline, `Manual override: “${pin.reason}”.`),
      });
      if (pin.slot.role === 'entry') this.placed.set(pin.teamId, pin.slot.id);
    }
  }

  private resolveProgression(slot: StageSlot): SlotResolution {
    const done = this.results.get(slot.id);
    if (done) return done;
    if (this.inProgress.has(slot.id)) return pending(slot.id, `${slot.label}: to be decided`);
    this.inProgress.add(slot.id);
    const resolution = this.resolveSingle(slot);
    this.inProgress.delete(slot.id);
    this.results.set(slot.id, resolution);
    return resolution;
  }

  private resolveEntry(slot: StageSlot): SlotResolution {
    const source = slot.source;
    const descriptor = slotDescriptor(this.index, slot);
    switch (source.kind) {
      case 'pool_position': {
        const table = this.earlierById.get(source.stageId)?.tables.find((candidate) => candidate.poolId === source.poolId);
        return this.walk(
          slot,
          table,
          source.position,
          descriptor,
          (row, position, clean) =>
            !!table && ((table.complete && !row.sharedPosition) || (clean && row.teamId !== null && this.locked(source.stageId, source.poolId, row.teamId, position))),
          (row) => {
            const headline = `${descriptor}: ${teamName(this.index, row.teamId)}`;
            return { explanation: `${headline} (${rowSummary(row)})`, headline, detail: rowSummary(row) };
          },
        );
      }
      case 'best_of_position':
      case 'overall_position': {
        const evaluation = this.earlierById.get(source.stageId);
        const key = comparisonKey(source.kind === 'best_of_position' ? source.position : null, source.normalization);
        const table =
          evaluation?.comparisonTables.find((candidate) => candidate.key === key)?.table ??
          (source.kind === 'overall_position' && source.normalization === 'raw' ? (evaluation?.overall ?? undefined) : undefined);
        const allComplete = !!evaluation && evaluation.tables.length > 0 && evaluation.tables.every((candidate) => candidate.complete);
        const ambiguousMembers =
          source.kind === 'best_of_position' &&
          !!evaluation?.tables.some((candidate) => candidate.rows.filter((row) => row.teamId !== null && row.membership === 'active')[source.position - 1]?.sharedPosition);
        return this.walk(
          slot,
          table,
          source.rank,
          descriptor,
          (row) => allComplete && !row.sharedPosition && !ambiguousMembers,
          (row, next) => crossExplanation(this.index, slot, source.normalization, row, next),
        );
      }
      default: {
        const resolution = this.resolveSingle(slot);
        if (resolution.teamId === null || resolution.viaOverride) return resolution;
        const open = `${descriptor}: to be decided`;
        if (this.eliminated.has(resolution.teamId)) {
          const removed = `${teamName(this.index, resolution.teamId)} removed by Manual Override`;
          return pending(slot.id, `${open} — ${removed}`, open, `${teamName(this.index, resolution.teamId)} removed by manual override`);
        }
        const other = this.placed.get(resolution.teamId);
        if (other && other !== slot.id) {
          const already = `${teamName(this.index, resolution.teamId)} already qualified as ${this.describeSlot(other)}`;
          return pending(slot.id, `${open} — ${already}`, open, already);
        }
        return resolution;
      }
    }
  }

  private describeSlot(slotId: SlotId): string {
    const slot = this.index.slotById.get(slotId);
    return slot ? slotDescriptor(this.index, slot) : 'another slot';
  }

  private locked(stageId: StageId, poolId: string, teamId: TeamId, position: number): boolean {
    const evaluation = this.earlierById.get(stageId);
    const table = evaluation?.tables.find((candidate) => candidate.poolId === poolId);
    if (!evaluation || !table) return false;
    const input = sourceStageInputs(this.index, evaluation, this.earlier).get(poolId);
    if (!input) return false;
    const analysis = analysePool(this.index.snapshot, stageId, poolId, table, input, [...this.eliminated], DEFAULT_ENUMERATION_LIMIT);
    return positionLocked(analysis, teamId, position);
  }

  private walk(
    slot: StageSlot,
    table: StandingsTable | undefined,
    start: number,
    descriptor: string,
    isFinal: (row: ResolvedRow, position: number, clean: boolean) => boolean,
    describe: (row: ResolvedRow, next: StandingRow | undefined) => SlotText,
  ): SlotResolution {
    if (!table || table.rows.every((row) => row.played === 0)) return pending(slot.id, `${descriptor}: to be decided`);
    const eligible = table.rows.filter(isResolvedRow).filter((row) => row.membership === 'active' && !this.eliminated.has(row.teamId));
    const notes: string[] = [];
    const first = Math.max(0, start - 1);
    const before = eligible[first - 1];
    const splitTie = !!before && before.sharedPosition && eligible[first]?.position === before.position;
    let downgrade = splitTie || table.rows.some((row) => row.teamId === null);
    for (let i = first; i < eligible.length; i += 1) {
      const row = eligible[i];
      const teamId = row.teamId;
      const placedIn = this.placed.get(teamId);
      if (placedIn) {
        notes.push(`${teamName(this.index, teamId)} already qualified as ${this.describeSlot(placedIn)}`);
        if (this.results.get(placedIn)?.status !== 'final') downgrade = true;
        continue;
      }
      const removed = table.rows
        .filter(isResolvedRow)
        .filter((candidate) => this.eliminated.has(candidate.teamId) && candidate.position <= row.position)
        .map((candidate) => teamName(this.index, candidate.teamId));
      const allNotes = [...notes, ...removed.map((name) => `${name} removed by Manual Override`)];
      const final = !downgrade && isFinal(row, i + 1, allNotes.length === 0);
      const text = describe(row, eligible[i + 1]);
      const detailNotes = [...notes, ...removed.map((name) => `${name} removed by manual override`)].map(asSentence);
      const detail = [...(text.detail === null ? [] : [asSentence(text.detail)]), ...detailNotes].join(' ');
      return {
        slotId: slot.id,
        teamId,
        status: final ? 'final' : 'provisional',
        viaOverride: false,
        explanation: `${text.explanation}${allNotes.length > 0 ? ` — ${allNotes.join('; ')}` : ''}`,
        ...explain(text.headline, detail),
      };
    }
    return pending(slot.id, `${descriptor}: to be decided`);
  }

  private resolveSingle(slot: StageSlot): SlotResolution {
    const source = slot.source;
    switch (source.kind) {
      case 'manual':
        return source.teamId === null
          ? pending(slot.id, `${slot.label}: to be chosen by the organizer`)
          : this.chosen(slot, source.teamId);
      case 'bracket_winner':
      case 'bracket_loser':
        return this.resolveBracket(slot, source.stageId, source.round, source.position, source.kind === 'bracket_winner' ? 'winner' : 'loser');
      case 'fixture_winner':
      case 'fixture_loser': {
        const fixture = this.index.fixtureById.get(source.fixtureId);
        if (!fixture) return pending(slot.id, `${slot.label}: to be decided`);
        return this.fromFixture(slot, fixture, source.kind === 'fixture_winner' ? 'winner' : 'loser');
      }
      default:
        return pending(slot.id, `${slot.label}: to be decided`);
    }
  }

  private resolveBracket(slot: StageSlot, stageId: StageId, round: number, position: number, take: 'winner' | 'loser'): SlotResolution {
    const fixture = (this.index.fixturesByStage.get(stageId) ?? []).find(
      (candidate) => candidate.bracket?.kind === 'main' && candidate.bracket.round === round && candidate.bracket.position === position,
    );
    if (fixture) return this.fromFixture(slot, fixture, take);
    if (round !== 1 || take !== 'winner') return pending(slot.id, `${slot.label}: to be decided`);
    const entrySlots = (this.index.slotsByStage.get(stageId) ?? []).filter((candidate) => candidate.role === 'entry');
    const seed = byeSeedAt(entrySlots.length, position);
    const byeSlot = seed === null ? undefined : entrySlots.find((candidate) => candidate.seed === seed);
    const resolution = byeSlot ? this.lookup(byeSlot.id) : undefined;
    if (!resolution || resolution.teamId === null) return pending(slot.id, `${slot.label} (bye): to be decided`);
    const explanation = `${slot.label} (bye): ${teamName(this.index, resolution.teamId)}`;
    return { slotId: slot.id, teamId: resolution.teamId, status: resolution.status, viaOverride: false, explanation, ...explain(explanation) };
  }

  private chosen(slot: StageSlot, teamId: TeamId): SlotResolution {
    const explanation = `${slot.label}: ${teamName(this.index, teamId)}`;
    return { slotId: slot.id, teamId, status: 'final', viaOverride: false, explanation, ...explain(explanation) };
  }

  private fromFixture(slot: StageSlot, fixture: Fixture, take: 'winner' | 'loser'): SlotResolution {
    const teams = fixtureTeamsVia(fixture, this.lookup);
    const advancement = advance(this.index, fixture, teams, this.seedOf(fixture.stageId));
    return resolutionFromAdvancement(this.index, slot.id, slot.label, fixture, advancement, take);
  }

  private seedOf(stageId: StageId): SeedOf {
    return seedLookup(this.index, stageId, this.lookup);
  }
}

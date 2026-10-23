import { rulesForOvers } from '@/domain/scoring/presets';
import { manualFixture } from '@/domain/tournament/fixtures';
import type { FixtureDraft, FixtureSide, IdGenerator, PoolId, StageId } from '@/domain/types';
import { isValidIsoDate, isValidLocalTime } from './dates';
import type { TournamentIndex } from './names';
import { sideKey } from './pools';

export interface AddFixtureForm {
  readonly stageId: StageId | null;
  readonly poolId: PoolId | null;
  readonly sideA: FixtureSide | null;
  readonly sideB: FixtureSide | null;
  readonly date: string;
  readonly time: string;
  readonly venueId: string | null;
  readonly overs: string;
  readonly label: string;
  readonly notes: string;
  readonly isFinal: boolean;
}

export interface AddFixtureErrors {
  readonly sides: string | null;
  readonly date: string | null;
  readonly time: string | null;
  readonly overs: string | null;
}

export function emptyForm(stageId: StageId | null): AddFixtureForm {
  return { stageId, poolId: null, sideA: null, sideB: null, date: '', time: '', venueId: null, overs: '', label: '', notes: '', isFinal: false };
}

export function validateAddFixture(form: AddFixtureForm): AddFixtureErrors {
  const oversText = form.overs.trim();
  return {
    sides:
      form.sideA === null || form.sideB === null
        ? 'Choose both sides.'
        : sideKey(form.sideA) === sideKey(form.sideB)
          ? 'A side cannot play itself.'
          : null,
    date: form.date.trim().length === 0 || isValidIsoDate(form.date.trim()) ? null : 'Choose a valid date.',
    time: form.time.trim().length === 0 || isValidLocalTime(form.time.trim()) ? null : 'Choose a valid time.',
    overs: oversText.length === 0 || (/^\d+$/.test(oversText) && Number(oversText) >= 1 && Number(oversText) <= 50) ? null : 'Enter 1 to 50 overs.',
  };
}

export function hasErrors(errors: AddFixtureErrors): boolean {
  return Object.values(errors).some((value) => value !== null);
}

export function draftFromForm(index: TournamentIndex, form: AddFixtureForm, ids: IdGenerator): FixtureDraft | null {
  const stage = form.stageId ? index.stage(form.stageId) : undefined;
  if (!stage || form.sideA === null || form.sideB === null || hasErrors(validateAddFixture(form))) {
    return null;
  }
  const overs = form.overs.trim();
  const baseRules = stage.config.matchRules ?? index.snapshot.rules.defaultMatchRules;
  const matchRules = overs.length > 0 ? rulesForOvers(Number(overs), baseRules) : null;
  const startMatchNumber = index.snapshot.fixtures.reduce((max, fixture) => Math.max(max, fixture.matchNumber), 0) + 1;
  const draft = manualFixture(
    {
      sideA: form.sideA,
      sideB: form.sideB,
      scheduledDate: form.date.trim() || null,
      scheduledTime: form.time.trim() || null,
      venueId: form.venueId,
      formatId: matchRules ? 'custom' : null,
      matchRules,
      notes: form.notes.trim() || null,
      label: form.label.trim() || null,
    },
    {
      tournamentId: index.snapshot.tournament.id,
      stageId: stage.id,
      poolId: form.poolId,
      formatId: stage.config.formatId,
      matchRules: stage.config.matchRules,
      venueId: null,
      startMatchNumber,
    },
    ids,
  );
  return { ...draft, isFinal: stage.type === 'custom' ? form.isFinal : false };
}

export interface SideOption {
  readonly key: string;
  readonly side: FixtureSide;
  readonly title: string;
  readonly subtitle?: string;
}

export function teamOptions(index: TournamentIndex): readonly SideOption[] {
  return index.snapshot.teams
    .filter((view) => view.membership.status === 'active')
    .map((view) => ({ key: `team:${view.team.id}`, side: { kind: 'team', teamId: view.team.id }, title: view.team.name, subtitle: view.team.shortName }));
}

export function slotOptions(index: TournamentIndex, stageId: StageId | null): readonly SideOption[] {
  if (stageId === null) {
    return [];
  }
  return index.snapshot.slots
    .filter((slot) => slot.stageId === stageId)
    .sort((a, b) => a.index - b.index)
    .map((slot) => {
      const shown = index.side({ kind: 'slot', slotId: slot.id });
      return { key: `slot:${slot.id}`, side: { kind: 'slot', slotId: slot.id }, title: slot.label, subtitle: shown.resolved ? shown.text : 'To be decided' };
    });
}

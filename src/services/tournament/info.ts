import { DEFAULT_FORMAT_ID, getBuiltinPreset } from '@/domain/scoring';
import { builtinTemplates, DEFAULT_NRR_CONFIG, DEFAULT_POINTS_SYSTEM, DEFAULT_TIE_BREAKERS } from '@/domain/tournament';
import type { FormatId, MatchRules, Tournament, TournamentRules, TournamentStructureKind, TournamentTemplate } from '@/domain/types';
import type { Repositories } from '@/db';
import type { NewTournamentInput, TournamentInfoPatch } from '../contracts';
import { failure } from '../core/result';
import { isIsoDate, trimmedOrNull } from '../core/values';
import { mergeSettings } from '../settings/defaults';

const STRUCTURE_KINDS: readonly TournamentStructureKind[] = ['league', 'groups', 'knockout', 'groups_knockout', 'custom'];

export type TournamentInfo = Omit<Tournament, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

export function normalizeInfo(info: TournamentInfo): TournamentInfo {
  const name = trimmedOrNull(info.name);
  if (name === null) {
    throw failure('VALIDATION', 'Give the tournament a name.');
  }
  const startDate = trimmedOrNull(info.startDate);
  const endDate = trimmedOrNull(info.endDate);
  if (startDate !== null && !isIsoDate(startDate)) {
    throw failure('VALIDATION', 'Enter the start date as YYYY-MM-DD.');
  }
  if (endDate !== null && !isIsoDate(endDate)) {
    throw failure('VALIDATION', 'Enter the end date as YYYY-MM-DD.');
  }
  if (startDate !== null && endDate !== null && startDate > endDate) {
    throw failure('VALIDATION', 'The end date must be on or after the start date.');
  }
  if (!STRUCTURE_KINDS.includes(info.structureKind)) {
    throw failure('VALIDATION', 'Choose a tournament structure.');
  }
  if (new Set(info.venueIds).size !== info.venueIds.length) {
    throw failure('VALIDATION', 'Each venue can only be listed once.');
  }
  return {
    ...info,
    name,
    season: trimmedOrNull(info.season),
    description: trimmedOrNull(info.description),
    organizer: trimmedOrNull(info.organizer),
    contact: trimmedOrNull(info.contact),
    location: trimmedOrNull(info.location),
    notes: trimmedOrNull(info.notes),
    startDate,
    endDate,
  };
}

export function infoFromInput(input: NewTournamentInput): TournamentInfo {
  return {
    name: input.name,
    season: input.season,
    description: input.description,
    logoUri: null,
    organizer: input.organizer,
    contact: null,
    location: null,
    notes: null,
    startDate: input.startDate,
    endDate: input.endDate,
    venueIds: input.venueIds,
    structureKind: input.structureKind,
  };
}

export function infoOf(tournament: Tournament): TournamentInfo {
  return {
    name: tournament.name,
    season: tournament.season,
    description: tournament.description,
    logoUri: tournament.logoUri,
    organizer: tournament.organizer,
    contact: tournament.contact,
    location: tournament.location,
    notes: tournament.notes,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    venueIds: tournament.venueIds,
    structureKind: tournament.structureKind,
  };
}

export function patchInfo(tournament: Tournament, patch: TournamentInfoPatch): TournamentInfo {
  return { ...infoOf(tournament), ...patch };
}

export async function findTemplate(repos: Repositories, templateId: string): Promise<TournamentTemplate> {
  const builtin = builtinTemplates().find((template) => template.id === templateId);
  const template = builtin ?? (await repos.templates.get(templateId));
  if (template === null) {
    throw failure('NOT_FOUND', 'That template no longer exists.');
  }
  return template;
}

async function presetRules(repos: Repositories, formatId: FormatId): Promise<MatchRules | null> {
  const builtin = getBuiltinPreset(formatId);
  if (builtin !== null) {
    return builtin.rules;
  }
  const presets = await repos.presets.list();
  return presets.find((preset) => preset.id === formatId)?.rules ?? null;
}

export async function initialRules(
  repos: Repositories,
  tournamentId: string,
  template: TournamentTemplate | null,
  now: string,
): Promise<TournamentRules> {
  if (template !== null) {
    return {
      tournamentId,
      pointsSystem: template.pointsSystem,
      nrr: template.nrr,
      tieBreakers: template.tieBreakers,
      defaultFormatId: template.defaultFormatId,
      defaultMatchRules: template.defaultMatchRules,
      updatedAt: now,
    };
  }
  const settings = mergeSettings(await repos.settings.getAll());
  const preferred = await presetRules(repos, settings.defaultFormatId);
  const rules = preferred ?? getBuiltinPreset(DEFAULT_FORMAT_ID)?.rules ?? null;
  if (rules === null) {
    throw failure('VALIDATION', 'Choose a match format for this tournament.');
  }
  return {
    tournamentId,
    pointsSystem: DEFAULT_POINTS_SYSTEM,
    nrr: DEFAULT_NRR_CONFIG,
    tieBreakers: DEFAULT_TIE_BREAKERS,
    defaultFormatId: preferred === null ? DEFAULT_FORMAT_ID : settings.defaultFormatId,
    defaultMatchRules: rules,
    updatedAt: now,
  };
}

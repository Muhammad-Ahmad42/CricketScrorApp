import { validateRules } from '@/domain/scoring/presets';
import type { NewTournamentInput } from '@/services/contracts';
import type { Stage, TieBreakerKind, TournamentRules } from '@/domain/types';
import { isValidIsoDate } from '../selectors/dates';

export interface InfoErrors {
  readonly name: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

const DATE_FORMAT = 'Use the format YYYY-MM-DD, for example 2026-09-12.';

export function infoErrors(info: NewTournamentInput): InfoErrors {
  const start = info.startDate?.trim() ?? '';
  const end = info.endDate?.trim() ?? '';
  const startValid = start.length === 0 || isValidIsoDate(start);
  const endValid = end.length === 0 || isValidIsoDate(end);
  return {
    name: info.name.trim().length === 0 ? 'Enter a tournament name.' : null,
    startDate: startValid ? null : DATE_FORMAT,
    endDate: !endValid ? DATE_FORMAT : start.length > 0 && end.length > 0 && startValid && end < start ? 'The end date is before the start date.' : null,
  };
}

export function teamsError(teams: readonly { readonly teamId: string; readonly seed: number | null }[]): string | null {
  if (teams.length < 2) {
    return 'Add at least 2 teams';
  }
  const seeds = teams.map((team) => team.seed).filter((seed): seed is number => seed !== null);
  if (new Set(seeds).size !== seeds.length) {
    return 'Two teams have the same seed.';
  }
  return null;
}

export function structureError(stages: readonly Stage[]): string | null {
  if (stages.length === 0) {
    return 'Choose a template or a structure.';
  }
  const champions = stages.filter((stage) => stage.config.decidesChampion).length;
  if (champions !== 1) {
    return 'Mark exactly one stage as the one that decides the champion.';
  }
  return null;
}

export function chainError(chain: readonly TieBreakerKind[]): string | null {
  if (chain[0] !== 'points') {
    return 'Points must come first.';
  }
  if (new Set(chain).size !== chain.length) {
    return 'Each tie-breaker can be used once.';
  }
  return null;
}

export function rulesErrors(rules: TournamentRules | null): readonly string[] {
  if (rules === null) {
    return ['Rules are not set yet.'];
  }
  const errors: string[] = [];
  const chain = chainError(rules.tieBreakers);
  if (chain) {
    errors.push(chain);
  }
  const points = rules.pointsSystem;
  if ([points.win, points.tie, points.noResult, points.loss].some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push('Points must be whole numbers of 0 or more.');
  }
  for (const issue of validateRules(rules.defaultMatchRules)) {
    if (issue.severity === 'error') {
      errors.push(issue.message);
    }
  }
  return errors;
}

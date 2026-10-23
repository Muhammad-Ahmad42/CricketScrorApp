import type { ChampionResult, Stage, StageType, TournamentStatus, TournamentStructureKind } from '@/domain/types';
import { formatDateRange } from '../dates';
import { joinPresent, type NameLookup } from '../text';
import { leaderTables, recordLines } from './leaders';
import { fixtureLines, resultLines } from './matches';
import type { Fact, TournamentDocument, TournamentPdfSource } from './model';
import { tournamentNames } from './naming';
import { stageDocuments } from './stages';

export function tournamentStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'registration':
      return 'Registration open';
    case 'structure_configured':
    case 'pools_configured':
      return 'Being set up';
    case 'fixtures_generated':
      return 'Fixtures ready';
    case 'active':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function structureLabel(kind: TournamentStructureKind): string {
  switch (kind) {
    case 'league':
      return 'League';
    case 'groups':
      return 'Groups';
    case 'knockout':
      return 'Knockout';
    case 'groups_knockout':
      return 'Groups and knockout';
    case 'custom':
      return 'Custom';
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

const TABLE_STAGES: readonly StageType[] = ['league', 'group'];

export function formatLabel(stages: readonly Stage[], fallback: TournamentStructureKind): string {
  const types = [...stages].sort((a, b) => a.orderIndex - b.orderIndex).map((stage) => stage.type);
  if (types.length === 0) {
    return structureLabel(fallback);
  }
  const split = types.indexOf('knockout');
  const tables = split === -1 ? types : types.slice(0, split);
  const knockouts = split === -1 ? [] : types.slice(split);
  if (knockouts.some((type) => type !== 'knockout') || tables.some((type) => !TABLE_STAGES.includes(type))) {
    return structureLabel('custom');
  }
  if (tables.length === 0) {
    return structureLabel('knockout');
  }
  const table = tables.every((type) => type === 'league') ? structureLabel('league') : structureLabel('groups');
  return knockouts.length === 0 ? table : `${table} and knockout`;
}

function championText(champion: ChampionResult | null, team: NameLookup): string | null {
  if (champion === null || champion.teamIds.length === 0) {
    return null;
  }
  const names = champion.teamIds.map((id) => team(id)).join(' & ');
  switch (champion.basis) {
    case 'shared':
      return `${names} (shared)`;
    case 'manual':
      return `${names} (declared by the organizer)`;
    case 'final':
    case 'league_table':
      return names;
    default: {
      const unreachable: never = champion.basis;
      return unreachable;
    }
  }
}

function facts(source: TournamentPdfSource): readonly Fact[] {
  const { tournament, teams } = source.snapshot;
  const venues = new Map(source.venues.map((venue) => [venue.id, venue.name]));
  const venueNames = tournament.venueIds.map((id) => venues.get(id)).filter((name): name is string => name !== undefined);
  const active = teams.filter((view) => view.membership.status === 'active').length;
  const progress = source.evaluation.progress;
  const entries: readonly (readonly [string, string | null])[] = [
    ['Dates', formatDateRange(tournament.startDate, tournament.endDate)],
    ['Organizer', tournament.organizer],
    ['Contact', tournament.contact],
    ['Location', tournament.location],
    ['Venues', venueNames.length > 0 ? venueNames.join(', ') : null],
    ['Teams', String(active)],
    ['Format', formatLabel(source.snapshot.stages, tournament.structureKind)],
    ['Status', tournamentStatusLabel(tournament.status)],
    ['Matches played', `${progress.done}/${progress.total}`],
  ];
  return entries.flatMap(([label, value]) => (value === null || value.trim().length === 0 ? [] : [{ label, value }]));
}

export function tournamentDocument(source: TournamentPdfSource): TournamentDocument {
  const names = tournamentNames(source);
  const { tournament } = source.snapshot;
  return {
    title: tournament.name,
    season: tournament.season,
    description: joinPresent([tournament.description], '') || null,
    facts: facts(source),
    champion: championText(source.evaluation.champion, names.team),
    stages: stageDocuments(source, names),
    results: resultLines(source, names),
    fixtures: fixtureLines(source, names),
    records: recordLines(source, names.team),
    leaders: leaderTables(source, names.team),
  };
}

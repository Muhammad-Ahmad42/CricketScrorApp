import type { FormatPreset, Player, Team, TournamentTemplate, Venue } from '@/domain/types';
import { key, optionalRef, ref, type Cursor } from './cursor';

export function visitVenue(row: Venue, c: Cursor): Venue {
  return { ...row, id: key(c, 'id', 'venues', row.id) };
}

export function visitTeam(row: Team, c: Cursor): Team {
  const id = key(c, 'id', 'teams', row.id);
  const captainId = optionalRef(c, 'captainId', 'players', row.captainId);
  return { ...row, id, captainId };
}

export function visitPlayer(row: Player, c: Cursor): Player {
  const id = key(c, 'id', 'players', row.id);
  const teamId = ref(c, 'teamId', 'teams', row.teamId);
  return { ...row, id, teamId };
}

export function visitTemplate(row: TournamentTemplate, c: Cursor): TournamentTemplate {
  return { ...row, id: key(c, 'id', 'templates', row.id) };
}

export function visitFormatPreset(row: FormatPreset, c: Cursor): FormatPreset {
  return { ...row, id: key(c, 'id', 'formatPresets', row.id) };
}

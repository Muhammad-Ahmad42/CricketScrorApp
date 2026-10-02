import type { BackupData, Id, ImportAggregateKind } from '@/domain/types';
import { COLLECTION_LABELS } from '../collections';
import { collectIdReferences, type BackupEntity } from '../remap';
import { errorIssue, type IssueSink } from './issues';
import type { LocalData } from './context';

export const LIBRARY_KINDS: { readonly [K in BackupEntity]?: ImportAggregateKind } = {
  teams: 'team',
  players: 'player',
  venues: 'venue',
};

const MATCH_SCOPED_PATH = /^data\.(matches|matchPlayers|matchEvents)\[(\d+)\]/;

function matchIdAt(data: BackupData, path: string): Id | null {
  const found = MATCH_SCOPED_PATH.exec(path);
  if (found === null) {
    return null;
  }
  const index = Number(found[2]);
  switch (found[1]) {
    case 'matches':
      return data.matches[index]?.id ?? null;
    case 'matchPlayers':
      return data.matchPlayers[index]?.matchId ?? null;
    default:
      return data.matchEvents[index]?.matchId ?? null;
  }
}

export function existsLocally(local: LocalData, entity: BackupEntity, id: Id): boolean {
  const kind = LIBRARY_KINDS[entity];
  return kind !== undefined && (local.existingIds[kind]?.has(id) ?? false);
}

export function checkReferences(
  data: BackupData,
  knownIds: { readonly [K in BackupEntity]: ReadonlySet<Id> },
  local: LocalData,
  sink: IssueSink,
): ReadonlySet<Id> {
  const tainted = new Set<Id>();
  collectIdReferences(data).forEach((reference) => {
    if (knownIds[reference.entity].has(reference.id) || existsLocally(local, reference.entity, reference.id)) {
      return;
    }
    const label = COLLECTION_LABELS[reference.entity].one;
    const where = LIBRARY_KINDS[reference.entity] === undefined ? 'in the file' : 'in the file or on this device';
    sink.add(errorIssue('MISSING_REFERENCE', `This refers to a ${label} that is not ${where}.`, reference.path));
    const matchId = matchIdAt(data, reference.path);
    if (matchId !== null) {
      tainted.add(matchId);
    }
  });
  return tainted;
}

export function missingLibraryIds(data: BackupData, knownIds: { readonly [K in BackupEntity]: ReadonlySet<Id> }): {
  readonly [K in 'team' | 'player' | 'venue']: readonly Id[];
} {
  const missing = { team: new Set<Id>(), player: new Set<Id>(), venue: new Set<Id>() };
  collectIdReferences(data).forEach((reference) => {
    const kind = LIBRARY_KINDS[reference.entity];
    if ((kind === 'team' || kind === 'player' || kind === 'venue') && !knownIds[reference.entity].has(reference.id)) {
      missing[kind].add(reference.id);
    }
  });
  return { team: [...missing.team], player: [...missing.player], venue: [...missing.venue] };
}

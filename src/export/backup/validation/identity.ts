import type { BackupData, Id } from '@/domain/types';
import { COLLECTION_LABELS } from '../collections';
import { errorIssue, type IssueSink } from './issues';

type IdCollection =
  | 'venues'
  | 'teams'
  | 'players'
  | 'tournaments'
  | 'tournamentTeams'
  | 'stages'
  | 'pools'
  | 'slots'
  | 'poolEntries'
  | 'fixtures'
  | 'matches'
  | 'matchEvents'
  | 'overrides'
  | 'auditEvents'
  | 'templates'
  | 'formatPresets';

const ID_COLLECTIONS: readonly IdCollection[] = [
  'venues',
  'teams',
  'players',
  'tournaments',
  'tournamentTeams',
  'stages',
  'pools',
  'slots',
  'poolEntries',
  'fixtures',
  'matches',
  'matchEvents',
  'overrides',
  'auditEvents',
  'templates',
  'formatPresets',
];

function findDuplicates<T>(rows: readonly T[], keyOf: (row: T) => string, report: (row: T, index: number) => void): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const value = keyOf(row);
    if (seen.has(value)) {
      report(row, index);
    } else {
      seen.add(value);
    }
  });
}

export function checkIdentity(data: BackupData, sink: IssueSink): ReadonlySet<Id> {
  const tainted = new Set<Id>();
  ID_COLLECTIONS.forEach((collection) => {
    const rows: readonly { readonly id: Id }[] = data[collection];
    const label = COLLECTION_LABELS[collection].many;
    findDuplicates(
      rows,
      (row) => row.id,
      (_row, index) => sink.add(errorIssue('DUPLICATE_ID', `Two ${label} in this file have the same id.`, `data.${collection}[${index}].id`)),
    );
  });
  data.tournaments.forEach((row, index) => {
    findDuplicates(
      row.venueIds,
      (venueId) => venueId,
      (_venueId, position) =>
        sink.add(errorIssue('DUPLICATE_ID', 'The same venue is listed twice for this tournament.', `data.tournaments[${index}].venueIds[${position}]`)),
    );
  });
  findDuplicates(
    data.tournamentRules,
    (row) => row.tournamentId,
    (_row, index) =>
      sink.add(errorIssue('DUPLICATE_ID', 'A tournament has more than one set of rules in this file.', `data.tournamentRules[${index}].tournamentId`)),
  );
  findDuplicates(
    data.matchPlayers,
    (row) => `${row.matchId}\u0000${row.playerId}`,
    (row, index) => {
      tainted.add(row.matchId);
      sink.add(errorIssue('DUPLICATE_ID', 'A player is listed twice in the same match squad.', `data.matchPlayers[${index}].playerId`));
    },
  );
  findDuplicates(
    data.matchEvents,
    (row) => `${row.matchId}\u0000${row.seq}`,
    (row, index) => {
      tainted.add(row.matchId);
      sink.add(errorIssue('DUPLICATE_ID', 'Two ball-by-ball events of the same match have the same position in the log.', `data.matchEvents[${index}].seq`));
    },
  );
  return tainted;
}

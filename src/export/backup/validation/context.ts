import type { EventId, Id, ImportAggregateKind, IsoDateTime, MatchId } from '@/domain/types';
import type { MatchLogCheck, MatchLogChecker } from './eventLogs';

export interface LocalFootprint {
  readonly matchIds: readonly MatchId[];
  readonly events: number;
  readonly eventIds?: readonly EventId[];
}

export interface LocalData {
  readonly existingIds: { readonly [K in ImportAggregateKind]?: ReadonlySet<Id> };
  readonly footprint: (entity: 'tournament' | 'match', id: Id) => LocalFootprint | null;
  readonly previouslyImportedAt: IsoDateTime | null;
}

export const EMPTY_LOCAL_DATA: LocalData = {
  existingIds: {},
  footprint: () => null,
  previouslyImportedAt: null,
};

export interface BackupValidationContext {
  readonly checksum: string | null;
  readonly local: LocalData;
  readonly logChecker?: MatchLogChecker;
  readonly logChecks?: ReadonlyMap<MatchId, MatchLogCheck>;
}

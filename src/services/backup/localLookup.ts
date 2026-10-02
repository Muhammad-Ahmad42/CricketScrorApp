import type { LocalData, LocalFootprint, LocalLookupPlan } from '@/export';
import type { AuditEvent, Id, ImportAggregateKind, IsoDateTime } from '@/domain/types';
import type { Repositories } from '@/db';

const KINDS: readonly ImportAggregateKind[] = ['tournament', 'match', 'team', 'player', 'venue', 'template', 'preset'];
const AUDIT_PAGE = 1000;

async function footprintWithEvents(repos: Repositories, entity: 'tournament' | 'match', id: Id): Promise<LocalFootprint> {
  const footprint = await repos.backup.aggregateFootprint(entity, id);
  const eventIds: string[] = [];
  for (const matchId of footprint.matchIds) {
    const events = await repos.events.listByMatch(matchId);
    eventIds.push(...events.map((event) => event.id));
  }
  return { matchIds: footprint.matchIds, events: footprint.events, eventIds };
}

export async function previouslyImportedAt(repos: Repositories, exportId: string): Promise<IsoDateTime | null> {
  let before: IsoDateTime | undefined;
  for (;;) {
    const page: AuditEvent[] = await repos.audit.list({ limit: AUDIT_PAGE, ...(before === undefined ? {} : { before }) });
    const found = page.find((event) => event.action === 'backup_imported' && event.entityId === exportId);
    if (found !== undefined) {
      return found.createdAt;
    }
    if (page.length < AUDIT_PAGE) {
      return null;
    }
    before = page[page.length - 1].createdAt;
  }
}

export async function readLocalData(repos: Repositories, plan: LocalLookupPlan, exportId: string | null): Promise<LocalData> {
  const existingIds: { [K in ImportAggregateKind]?: ReadonlySet<Id> } = {};
  for (const kind of KINDS) {
    existingIds[kind] = await repos.backup.existingIds(kind, plan[kind]);
  }
  const footprints = new Map<string, LocalFootprint>();
  for (const entity of ['tournament', 'match'] as const) {
    for (const id of existingIds[entity] ?? []) {
      footprints.set(`${entity}:${id}`, await footprintWithEvents(repos, entity, id));
    }
  }
  return {
    existingIds,
    footprint: (entity, id) => footprints.get(`${entity}:${id}`) ?? null,
    previouslyImportedAt: exportId === null ? null : await previouslyImportedAt(repos, exportId),
  };
}

import type { AuditAction, AuditEntityType, AuditEvent, Id, ImpactSummary, MatchId, TournamentId } from '@/domain/types';
import type { Repositories } from '@/db';
import type { ServiceContext } from './context';
import { toJsonValue } from './values';

export interface AuditInput {
  readonly tournamentId: TournamentId | null;
  readonly matchId?: MatchId | null;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: Id;
  readonly summary: string;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly reason?: string | null;
  readonly impact?: ImpactSummary | null;
}

export function auditEvent(ctx: ServiceContext, input: AuditInput, createdAt: string = ctx.clock.now()): AuditEvent {
  return {
    id: ctx.ids(),
    tournamentId: input.tournamentId,
    matchId: input.matchId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    previousValue: input.previousValue === undefined ? null : toJsonValue(input.previousValue),
    newValue: input.newValue === undefined ? null : toJsonValue(input.newValue),
    reason: input.reason ?? null,
    impact: input.impact ?? null,
    createdAt,
  };
}

export async function writeAudit(ctx: ServiceContext, repos: Repositories, input: AuditInput, createdAt?: string): Promise<AuditEvent> {
  const event = auditEvent(ctx, input, createdAt);
  await repos.audit.append(event);
  return event;
}

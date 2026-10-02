import { AUDIT_ACTIONS } from '@/domain/types';
import type { AuditEntityType, AuditEvent, ImpactSummary, TournamentOverride } from '@/domain/types';
import {
  arrayOf,
  discriminated,
  idText,
  integer,
  isoDateTime,
  jsonObject,
  jsonValue,
  literal,
  nonEmptyText,
  nullable,
  object,
  text,
  type FieldGuards,
  type Guard,
} from '../guards';

type OverrideOf<K extends TournamentOverride['kind']> = Extract<TournamentOverride, { readonly kind: K }>;

type OverrideBaseFields = Pick<OverrideOf<'champion'>, 'id' | 'tournamentId' | 'reason' | 'createdAt' | 'revokedAt' | 'revokeReason'>;

const base: FieldGuards<OverrideBaseFields> = {
  id: idText,
  tournamentId: idText,
  reason: nonEmptyText,
  createdAt: isoDateTime,
  revokedAt: nullable(isoDateTime),
  revokeReason: nullable(text),
};

export const overrideShape = discriminated<TournamentOverride, 'kind'>('kind', {
  qualification: object<OverrideOf<'qualification'>>({
    ...base,
    kind: literal('qualification'),
    stageId: idText,
    teamId: idText,
    action: literal('qualify', 'eliminate', 'reassign'),
    slotId: nullable(idText),
    poolId: nullable(idText),
  }),
  points_adjustment: object<OverrideOf<'points_adjustment'>>({
    ...base,
    kind: literal('points_adjustment'),
    stageId: idText,
    poolId: nullable(idText),
    teamId: idText,
    points: integer(),
  }),
  tie_resolution: object<OverrideOf<'tie_resolution'>>({
    ...base,
    kind: literal('tie_resolution'),
    stageId: idText,
    poolId: nullable(idText),
    orderedTeamIds: arrayOf(idText),
    method: literal('organizer_decision', 'draw_lots'),
    seed: nullable(integer(0)),
  }),
  slot_assignment: object<OverrideOf<'slot_assignment'>>({ ...base, kind: literal('slot_assignment'), slotId: idText, teamId: idText }),
  expunge_results: object<OverrideOf<'expunge_results'>>({
    ...base,
    kind: literal('expunge_results'),
    stageId: nullable(idText),
    teamId: idText,
  }),
  champion: object<OverrideOf<'champion'>>({ ...base, kind: literal('champion'), teamIds: arrayOf(idText) }),
});

const auditEntityType: Guard<AuditEntityType> = literal(
  'tournament',
  'rules',
  'team',
  'stage',
  'pool',
  'slot',
  'fixture',
  'match',
  'override',
  'backup',
  'app',
);

export const auditShape = object<AuditEvent>({
  id: idText,
  tournamentId: nullable(idText),
  matchId: nullable(idText),
  action: literal(...AUDIT_ACTIONS),
  entityType: auditEntityType,
  entityId: idText,
  summary: text,
  previousValue: nullable(jsonValue),
  newValue: nullable(jsonValue),
  reason: nullable(text),
  impact: nullable(jsonObject<ImpactSummary>()),
  createdAt: isoDateTime,
});

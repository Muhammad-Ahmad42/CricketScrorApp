import { applyEvent, replayMatch, validateEvent } from '@/domain/scoring';
import type {
  IdGenerator,
  IsoDateTime,
  Match,
  MatchEvent,
  MatchEventInput,
  MatchId,
  MatchSetup,
  MatchState,
  Seq,
  ValidationWarning,
} from '@/domain/types';
import type { Repositories } from '@/db';
import { failure } from '../core/result';
import { MESSAGES } from '../core/errors';

export interface MatchLog {
  readonly match: Match;
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

export const MATCH_NOT_FOUND = 'This match no longer exists. It may have been deleted.';

export async function readMatchLog(repos: Repositories, matchId: MatchId): Promise<MatchLog> {
  const match = await repos.matches.get(matchId);
  const setup = match === null ? null : await repos.matches.getSetup(matchId);
  if (match === null || setup === null) {
    throw failure('NOT_FOUND', MATCH_NOT_FOUND);
  }
  const events = await repos.events.listByMatch(matchId);
  return { match, setup, events, state: replayMatch(setup, events) };
}

export function assertTail(log: MatchLog, expectedLastSeq: Seq): void {
  if (log.state.lastSeq !== expectedLastSeq) {
    throw failure('CONFLICT', MESSAGES.conflict, {
      detail: `Expected the log of match ${log.match.id} to end at seq ${expectedLastSeq}; it ends at ${log.state.lastSeq}.`,
    });
  }
}

export function assertHealthy(state: MatchState): void {
  if (state.needsRepair) {
    const issue = state.issues.find((entry) => entry.severity === 'error');
    throw failure('FORBIDDEN_STATE', MESSAGES.needsRepair, {
      domainCode: issue?.code ?? null,
      detail: issue === undefined ? null : `seq ${issue.seq}: ${issue.code} ${issue.message}`,
    });
  }
}

export interface ValidatedAppend {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
  readonly warnings: readonly ValidationWarning[];
}

export interface StampOptions {
  readonly ids: IdGenerator;
  readonly recordedAt: IsoDateTime;
  readonly actionId?: string;
}

export function appendPayloads(setup: MatchSetup, state: MatchState, payloads: readonly MatchEventInput[], stamp: StampOptions): ValidatedAppend {
  if (payloads.length === 0) {
    throw failure('VALIDATION', 'There is nothing to record.');
  }
  const actionId = stamp.actionId ?? stamp.ids();
  const events: MatchEvent[] = [];
  const warnings: ValidationWarning[] = [];
  let current = state;
  for (const payload of payloads) {
    const validation = validateEvent(setup, current, payload, 'append');
    if (!validation.ok) {
      throw failure('VALIDATION', validation.message, { domainCode: validation.code });
    }
    warnings.push(...validation.warnings);
    const event: MatchEvent = {
      ...payload,
      id: stamp.ids(),
      matchId: setup.matchId,
      seq: current.lastSeq + 1,
      actionId,
      recordedAt: stamp.recordedAt,
    };
    current = applyEvent(setup, current, event);
    events.push(event);
  }
  return { state: current, events, warnings };
}

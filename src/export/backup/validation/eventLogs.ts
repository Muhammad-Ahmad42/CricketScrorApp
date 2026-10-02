import { normalizeLog, validateLog } from '@/domain/scoring';
import type { BackupData, BackupIssue, EventId, Id, Match, MatchEvent, MatchId, MatchPlayer, MatchSetup, MatchState, MatchTeam, ReplayIssue } from '@/domain/types';
import { errorIssue, plural, warningIssue } from './issues';

export interface MatchLogJob {
  readonly matchId: MatchId;
  readonly label: string;
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly paths: ReadonlyMap<EventId, string>;
}

export interface MatchLogOutcome {
  readonly events: readonly MatchEvent[];
  readonly corrected: number;
  readonly errors: readonly ReplayIssue[];
  readonly state: MatchState | null;
}

export type MatchLogChecker = (setup: MatchSetup, events: readonly MatchEvent[]) => MatchLogOutcome;

export interface MatchLogCheck {
  readonly matchId: MatchId;
  readonly issues: readonly BackupIssue[];
  readonly events: readonly MatchEvent[];
  readonly state: MatchState | null;
}

export const engineLogChecker: MatchLogChecker = (setup, events) => {
  const normalized = normalizeLog(setup, events);
  const corrected = new Set<EventId>([...normalized.restampedIds, ...normalized.reanchoredIds]).size;
  const result = validateLog(setup, normalized.events);
  return {
    events: normalized.events,
    corrected,
    errors: result.ok ? [] : result.issues.filter((issue) => issue.severity === 'error'),
    state: result.state,
  };
};

function matchTeam(match: Match, teamId: Id, fallback: string, data: BackupData, playersInSide: number | null): MatchTeam {
  const team = data.teams.find((row) => row.id === teamId);
  return {
    id: teamId,
    name: team?.name ?? fallback,
    shortName: team?.shortName ?? fallback.slice(0, 3).toUpperCase(),
    playersInSide: playersInSide ?? match.rules.playersPerSide,
  };
}

export function matchLabel(match: Match, data: BackupData): string {
  if (match.title.trim().length > 0) {
    return match.title.trim();
  }
  const name = (teamId: Id) => data.teams.find((row) => row.id === teamId)?.name ?? 'Unknown team';
  return `${name(match.teamAId)} v ${name(match.teamBId)}`;
}

export function matchLogJobs(data: BackupData, skip: ReadonlySet<MatchId> = new Set()): readonly MatchLogJob[] {
  const players = new Map(data.players.map((row) => [row.id, row]));
  const squads = new Map<MatchId, MatchPlayer[]>();
  data.matchPlayers.forEach((row) => {
    const player = players.get(row.playerId);
    const entry: MatchPlayer = {
      ...row,
      name: player?.name ?? 'Unknown player',
      jerseyNumber: player?.jerseyNumber ?? null,
      role: player?.role ?? 'unknown',
    };
    const squad = squads.get(row.matchId) ?? [];
    squad.push(entry);
    squads.set(row.matchId, squad);
  });
  const logs = new Map<MatchId, { readonly event: MatchEvent; readonly path: string }[]>();
  data.matchEvents.forEach((event, index) => {
    const list = logs.get(event.matchId) ?? [];
    list.push({ event, path: `data.matchEvents[${index}]` });
    logs.set(event.matchId, list);
  });
  return data.matches
    .filter((match) => !skip.has(match.id) && logs.has(match.id))
    .map((match) => {
      const entries = [...(logs.get(match.id) ?? [])].sort((a, b) => a.event.seq - b.event.seq);
      return {
        matchId: match.id,
        label: matchLabel(match, data),
        setup: {
          matchId: match.id,
          rules: match.rules,
          teams: [
            matchTeam(match, match.teamAId, 'Team A', data, match.teamAPlayers),
            matchTeam(match, match.teamBId, 'Team B', data, match.teamBPlayers),
          ],
          players: squads.get(match.id) ?? [],
          toss: match.toss,
        },
        events: entries.map((entry) => entry.event),
        paths: new Map(entries.map((entry) => [entry.event.id, entry.path])),
      };
    });
}

function seqProblem(job: MatchLogJob): BackupIssue | null {
  const broken = job.events.findIndex((event, index) => event.seq !== index + 1);
  if (broken < 0) {
    return null;
  }
  const event = job.events[broken];
  const message =
    broken === 0
      ? `${job.label}: the ball-by-ball record does not start at the beginning of the match.`
      : `${job.label}: the ball-by-ball record has a gap or repeat after event ${job.events[broken - 1].seq}.`;
  return errorIssue('INVALID_EVENT_LOG', message, job.paths.get(event.id) ?? null);
}

function replayProblems(job: MatchLogJob, outcome: MatchLogOutcome): readonly BackupIssue[] {
  const issues: BackupIssue[] = [];
  if (outcome.corrected > 0) {
    issues.push(
      warningIssue(
        'INVALID_EVENT_LOG',
        `${plural(outcome.corrected, 'delivery', 'deliveries')} in ${job.label} had outdated batter or bowler names and will be corrected.`,
      ),
    );
  }
  const first = outcome.errors[0];
  if (first !== undefined) {
    const others = outcome.errors.length - 1;
    const more = others > 0 ? ` ${plural(others, 'other event has', 'other events have')} problems too.` : '';
    issues.push(
      errorIssue(
        'INVALID_EVENT_LOG',
        `${job.label}: event ${first.seq} of the ball-by-ball record can't be replayed. ${first.message}${more}`,
        job.paths.get(first.eventId) ?? null,
      ),
    );
  }
  return issues;
}

export function checkMatchLog(job: MatchLogJob, checker: MatchLogChecker = engineLogChecker): MatchLogCheck {
  const gap = seqProblem(job);
  if (gap !== null) {
    return { matchId: job.matchId, issues: [gap], events: job.events, state: null };
  }
  try {
    const outcome = checker(job.setup, job.events);
    return { matchId: job.matchId, issues: replayProblems(job, outcome), events: outcome.events, state: outcome.state };
  } catch {
    return {
      matchId: job.matchId,
      issues: [errorIssue('INVALID_EVENT_LOG', `${job.label}: the ball-by-ball record couldn't be checked.`, null)],
      events: job.events,
      state: null,
    };
  }
}

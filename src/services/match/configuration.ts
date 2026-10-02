import { replayMatch, validateRules } from '@/domain/scoring';
import { canTransitionMatch, matchEditPolicy, type EditPermission } from '@/domain/tournament';
import type { Match, MatchPlayer, NewPlayerInput, Player, PlayerId, TeamId } from '@/domain/types';
import type { Repositories } from '@/db';
import type { LiveMatch, MatchService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { isIsoDate, isLocalTime, trimmedOrNull } from '../core/values';
import { assertMatchTournamentWritable } from '../tournament/matchEffects';
import { mirrorPrePlayStatus } from '../tournament/prePlay';
import { commitLog } from './commit';
import { readMatchLog, type MatchLog } from './matchLog';

type ConfigurationOperations = Pick<
  MatchService,
  'updateDetails' | 'updateRules' | 'setToss' | 'setPrePlayStatus' | 'addSquadPlayer' | 'removeSquadPlayer'
>;

function permission(match: Match, key: 'rules' | 'toss' | 'squads'): EditPermission {
  return matchEditPolicy(match.status, { inTournament: match.tournamentId !== null })[key];
}

function requireReason(match: Match, key: 'rules' | 'toss', reason: string | null): string | null {
  const allowed = permission(match, key);
  if (allowed === 'forbidden') {
    throw failure('FORBIDDEN_STATE', key === 'rules' ? "This match's rules can't be changed now." : "The toss can't be changed for this match.");
  }
  const why = trimmedOrNull(reason);
  if (allowed === 'confirm' && why === null) {
    throw failure('CONFIRMATION_REQUIRED', key === 'rules' ? 'Add a reason for changing the rules of this match.' : 'Add a reason for changing the toss.');
  }
  return why;
}

function assertSideSize(value: number | null): void {
  if (value !== null && (!Number.isInteger(value) || value < 2 || value > 15)) {
    throw failure('VALIDATION', 'A side must have between 2 and 15 players.');
  }
}

function auditsSquadChanges(match: Match): boolean {
  return match.tournamentId !== null || match.status === 'completed' || match.status === 'abandoned';
}

async function reconfigure(ctx: ServiceContext, repos: Repositories, log: MatchLog, next: Match, mismatch: string): Promise<LiveMatch> {
  await repos.matches.update(next);
  const setup = await repos.matches.getSetup(next.id);
  if (setup === null) {
    throw failure('NOT_FOUND', 'This match no longer exists. It may have been deleted.');
  }
  const state = replayMatch(setup, log.events);
  if (state.needsRepair) {
    const issue = state.issues.find((entry) => entry.severity === 'error');
    throw failure('VALIDATION', mismatch, { domainCode: issue?.code ?? null, detail: issue?.message ?? null });
  }
  const committed = await commitLog(ctx, repos, { before: log, match: next, setup, events: log.events, state, now: next.updatedAt, appended: false });
  return committed.live;
}

async function newPlayer(ctx: ServiceContext, repos: Repositories, teamId: TeamId, input: NewPlayerInput): Promise<PlayerId> {
  const name = trimmedOrNull(input.name);
  if (name === null) {
    throw failure('VALIDATION', "Enter the player's name.");
  }
  const now = ctx.clock.now();
  const player: Player = {
    id: ctx.ids(),
    teamId,
    name,
    jerseyNumber: input.jerseyNumber ?? null,
    role: input.role ?? 'unknown',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  await repos.players.insert(player);
  return player.id;
}

function nextBattingOrder(log: MatchLog, teamId: TeamId): number {
  const orders = log.setup.players
    .filter((player) => player.teamId === teamId && !player.isSubstitute)
    .map((player) => player.battingOrder ?? 0);
  return Math.max(0, ...orders) + 1;
}

export function createConfigurationOperations(ctx: ServiceContext): ConfigurationOperations {
  return {
    updateDetails(matchId, patch) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const match = await repos.matches.get(matchId);
          if (match === null) {
            throw failure('NOT_FOUND', 'This match no longer exists. It may have been deleted.');
          }
          await assertMatchTournamentWritable(repos, match);
          const title = patch.title === undefined ? match.title : trimmedOrNull(patch.title);
          if (title === null) {
            throw failure('VALIDATION', 'Give the match a title.');
          }
          const scheduledDate = patch.scheduledDate === undefined ? match.scheduledDate : trimmedOrNull(patch.scheduledDate);
          const scheduledTime = patch.scheduledTime === undefined ? match.scheduledTime : trimmedOrNull(patch.scheduledTime);
          if (scheduledDate !== null && !isIsoDate(scheduledDate)) {
            throw failure('VALIDATION', 'Enter the match date as YYYY-MM-DD.');
          }
          if (scheduledTime !== null && !isLocalTime(scheduledTime)) {
            throw failure('VALIDATION', 'Enter the start time as HH:MM.');
          }
          const next: Match = {
            ...match,
            title,
            venueId: patch.venueId === undefined ? match.venueId : patch.venueId,
            scheduledDate,
            scheduledTime,
            updatedAt: ctx.clock.now(),
          };
          await repos.matches.update(next);
          return next;
        }),
      );
    },

    updateRules(matchId, patch, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          const why = requireReason(log.match, 'rules', reason);
          const rules = patch.rules ?? log.match.rules;
          const ruleError = validateRules(rules).find((issue) => issue.severity === 'error');
          if (ruleError !== undefined) {
            throw failure('VALIDATION', ruleError.message, { domainCode: ruleError.code });
          }
          const sizes = patch.teamSizes ?? { teamAPlayers: log.match.teamAPlayers, teamBPlayers: log.match.teamBPlayers };
          assertSideSize(sizes.teamAPlayers);
          assertSideSize(sizes.teamBPlayers);
          const next: Match = { ...log.match, rules, teamAPlayers: sizes.teamAPlayers, teamBPlayers: sizes.teamBPlayers, updatedAt: ctx.clock.now() };
          const live = await reconfigure(ctx, repos, log, next, "These rules don't fit the balls already recorded in this match.");
          if (permission(log.match, 'rules') === 'confirm') {
            await writeAudit(ctx, repos, {
              tournamentId: log.match.tournamentId,
              matchId,
              action: 'match_rules_changed',
              entityType: 'match',
              entityId: matchId,
              summary: `${log.match.title}: the match rules were changed.`,
              previousValue: { rules: log.match.rules, teamAPlayers: log.match.teamAPlayers, teamBPlayers: log.match.teamBPlayers },
              newValue: { rules, teamAPlayers: sizes.teamAPlayers, teamBPlayers: sizes.teamBPlayers },
              reason: why,
            });
          }
          return live;
        }),
      );
    },

    setToss(matchId, toss, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          const why = requireReason(log.match, 'toss', reason);
          if (toss !== null && toss.winnerTeamId !== log.match.teamAId && toss.winnerTeamId !== log.match.teamBId) {
            throw failure('VALIDATION', 'The toss winner must be one of the two teams.');
          }
          const next: Match = { ...log.match, toss, updatedAt: ctx.clock.now() };
          const live = await reconfigure(ctx, repos, log, next, 'The toss has to match the team that batted first.');
          if (permission(log.match, 'toss') === 'confirm') {
            await writeAudit(ctx, repos, {
              tournamentId: log.match.tournamentId,
              matchId,
              action: 'match_toss_changed',
              entityType: 'match',
              entityId: matchId,
              summary: `${log.match.title}: the toss was changed.`,
              previousValue: log.match.toss,
              newValue: toss,
              reason: why,
            });
          }
          return live.match;
        }),
      );
    },

    setPrePlayStatus(matchId, status, reason) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          if (log.events.length > 0) {
            throw failure('FORBIDDEN_STATE', 'This match has already started, so it can no longer be postponed or cancelled.');
          }
          if (log.match.status === status) {
            return log.match;
          }
          const guard = canTransitionMatch(log.match.status, status, { hasDeliveries: false });
          if (!guard.ok) {
            throw failure('FORBIDDEN_STATE', guard.reason);
          }
          const now = ctx.clock.now();
          const next: Match = { ...log.match, status, updatedAt: now };
          await repos.matches.update(next);
          const why = trimmedOrNull(reason);
          if (next.tournamentId !== null) {
            await mirrorPrePlayStatus(ctx, repos, { match: next, previous: log.match.status, reason: why, now });
          } else if (log.match.status === 'cancelled') {
            await writeAudit(ctx, repos, {
              tournamentId: null,
              matchId,
              action: 'match_reopened',
              entityType: 'match',
              entityId: matchId,
              summary: `${log.match.title} was restored from cancelled.`,
              previousValue: { status: log.match.status },
              newValue: { status },
              reason: why,
            });
          }
          return next;
        }),
      );
    },

    addSquadPlayer(matchId, teamId, player, opts) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos): Promise<MatchPlayer> => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          if (teamId !== log.match.teamAId && teamId !== log.match.teamBId) {
            throw failure('VALIDATION', 'Players can only be added to one of the two teams in this match.');
          }
          const playerId = 'newPlayer' in player ? await newPlayer(ctx, repos, teamId, player.newPlayer) : player.playerId;
          if (log.setup.players.some((entry) => entry.playerId === playerId)) {
            throw failure('VALIDATION', 'This player is already in the squad.');
          }
          const isSubstitute = opts?.isSubstitute ?? false;
          await repos.matches.addSquadPlayer(matchId, teamId, {
            playerId,
            battingOrder: isSubstitute ? null : nextBattingOrder(log, teamId),
            isCaptain: false,
            isWicketKeeper: false,
            isSubstitute,
          });
          await repos.matches.update({ ...log.match, updatedAt: ctx.clock.now() });
          const setup = await repos.matches.getSetup(matchId);
          const added = setup?.players.find((entry) => entry.playerId === playerId);
          if (added === undefined) {
            throw failure('NOT_FOUND', 'The player could not be added to the squad.');
          }
          if (auditsSquadChanges(log.match)) {
            await writeAudit(ctx, repos, {
              tournamentId: log.match.tournamentId,
              matchId,
              action: 'match_squad_changed',
              entityType: 'match',
              entityId: matchId,
              summary: `${added.name} was added to the ${isSubstitute ? 'substitutes' : 'squad'} of ${log.match.title}.`,
              newValue: { playerId, teamId, isSubstitute },
            });
          }
          return added;
        }),
      );
    },

    removeSquadPlayer(matchId, playerId) {
      return attempt(MESSAGES.matchChange, () =>
        inTransaction(ctx, async (repos) => {
          const log = await readMatchLog(repos, matchId);
          await assertMatchTournamentWritable(repos, log.match);
          const entry = log.setup.players.find((candidate) => candidate.playerId === playerId);
          if (entry === undefined) {
            throw failure('NOT_FOUND', "This player isn't in the squad.");
          }
          await repos.matches.removeSquadPlayer(matchId, playerId);
          const next: Match = { ...log.match, updatedAt: ctx.clock.now() };
          await reconfigure(ctx, repos, log, next, `${entry.name} has already taken part in this match, so they stay in the squad.`);
          if (auditsSquadChanges(log.match)) {
            await writeAudit(ctx, repos, {
              tournamentId: log.match.tournamentId,
              matchId,
              action: 'match_squad_changed',
              entityType: 'match',
              entityId: matchId,
              summary: `${entry.name} was removed from the squad of ${log.match.title}.`,
              previousValue: { playerId, teamId: entry.teamId, isSubstitute: entry.isSubstitute },
            });
          }
        }),
      );
    },
  };
}

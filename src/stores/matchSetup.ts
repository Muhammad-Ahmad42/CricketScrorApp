import { create } from 'zustand';
import { BASE_MATCH_RULES, blockingSquadIssue, checkDraftSquadSizes, getBuiltinPreset, openingBattingTeam, type SquadSizeIssue } from '@/domain/scoring';
import type { FormatId, MatchEventInput, MatchRules, MatchSquadEntry, NewMatchInput, PlayerId, TeamId } from '@/domain/types';
import { fixtureMatchDefaults } from '@/services';
import type { MatchSetupDraft, MatchSetupStore } from './contracts';
import { call, storeError } from './internal/call';
import { createSingleFlight } from './internal/singleFlight';
import { useSettingsStore } from './settings';

function rulesFor(formatId: FormatId): MatchRules {
  return getBuiltinPreset(formatId)?.rules ?? BASE_MATCH_RULES;
}

export function initialMatchSetupDraft(): MatchSetupDraft {
  const formatId = useSettingsStore.getState().settings.defaultFormatId;
  return {
    title: '',
    formatId,
    rules: rulesFor(formatId),
    venueId: null,
    scheduledDate: null,
    scheduledTime: null,
    teamAId: null,
    teamBId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    squadA: [],
    squadB: [],
    substitutesA: [],
    substitutesB: [],
    toss: null,
    battingFirstTeamId: null,
    openers: { strikerId: null, nonStrikerId: null, bowlerId: null },
    fixtureId: null,
  };
}

interface SquadRoles {
  readonly captainId: PlayerId | null;
  readonly keeperIds: ReadonlySet<PlayerId>;
  readonly teamName: string | null;
}

const NO_ROLES: SquadRoles = { captainId: null, keeperIds: new Set(), teamName: null };

async function rolesOf(teamId: TeamId): Promise<SquadRoles> {
  const result = await call((services) => services.teams.get(teamId));
  if (!result.ok) {
    return NO_ROLES;
  }
  const keepers = result.value.players.filter((player) => player.role === 'wicket_keeper').map((player) => player.id);
  return { captainId: result.value.team.captainId, keeperIds: new Set(keepers), teamName: result.value.team.name };
}

function squad(players: readonly PlayerId[], substitutes: readonly PlayerId[], roles: SquadRoles = NO_ROLES): MatchSquadEntry[] {
  const keeperId = players.find((playerId) => roles.keeperIds.has(playerId)) ?? null;
  return [
    ...players.map((playerId, index) => ({
      playerId,
      battingOrder: index + 1,
      isCaptain: playerId === roles.captainId,
      isWicketKeeper: playerId === keeperId,
      isSubstitute: false,
    })),
    ...substitutes.map((playerId) => ({ playerId, battingOrder: null, isCaptain: false, isWicketKeeper: false, isSubstitute: true })),
  ];
}

export const BATTING_FIRST_REQUIRED = 'Choose which team bats first, or record the toss.';

export type SquadTeamName = (teamId: TeamId) => string | null | undefined;

function fallbackName(draft: MatchSetupDraft, teamId: TeamId): string {
  return teamId === draft.teamAId ? 'Team A' : teamId === draft.teamBId ? 'Team B' : 'This team';
}

export function selectSquadIssues(draft: MatchSetupDraft, teamName?: SquadTeamName): readonly SquadSizeIssue[] {
  return checkDraftSquadSizes(draft, (teamId) => teamName?.(teamId) ?? fallbackName(draft, teamId));
}

export function selectBlockingSquadIssue(draft: MatchSetupDraft, teamName?: SquadTeamName): SquadSizeIssue | null {
  return blockingSquadIssue(selectSquadIssues(draft, teamName));
}

function openingEvents(draft: MatchSetupDraft, teamAId: TeamId, teamBId: TeamId): readonly MatchEventInput[] | null {
  const { strikerId, nonStrikerId, bowlerId } = draft.openers;
  if (strikerId === null || nonStrikerId === null || bowlerId === null) {
    return [];
  }
  const battingTeamId = openingBattingTeam({ teamAId, teamBId }, draft.toss, draft.battingFirstTeamId ?? null);
  if (battingTeamId === null) {
    return null;
  }
  return [{ kind: 'innings_started', inningsIndex: 0, battingTeamId, strikerId, nonStrikerId, bowlerId }];
}

const submitting = createSingleFlight();

export const useMatchSetupStore = create<MatchSetupStore>()((set, get) => ({
  draft: initialMatchSetupDraft(),
  status: 'idle',
  error: null,

  update(patch) {
    const current = get().draft;
    const preset = patch.formatId !== undefined && patch.formatId !== current.formatId ? getBuiltinPreset(patch.formatId) : null;
    set({ draft: { ...current, ...patch, rules: patch.rules ?? preset?.rules ?? current.rules } });
  },

  async startFromFixture(tournamentId, fixtureId) {
    set({ status: 'loading', error: null });
    const result = await call((services) => services.tournaments.evaluate(tournamentId));
    if (!result.ok) {
      set({ status: 'error', error: result.error });
      return false;
    }
    const { snapshot, evaluation } = result.value;
    const fixture = snapshot.fixtures.find((entry) => entry.id === fixtureId);
    const defaults = fixture === undefined ? null : fixtureMatchDefaults(snapshot, evaluation, fixture);
    if (defaults === null) {
      set({ status: 'error', error: storeError('FORBIDDEN_STATE', "The teams for this fixture aren't decided yet.") });
      return false;
    }
    set({
      status: 'ready',
      draft: {
        ...initialMatchSetupDraft(),
        title: defaults.title,
        formatId: defaults.formatId,
        rules: defaults.rules,
        venueId: defaults.venueId,
        scheduledDate: defaults.scheduledDate,
        scheduledTime: defaults.scheduledTime,
        teamAId: defaults.teamAId,
        teamBId: defaults.teamBId,
        fixtureId,
      },
    });
    return true;
  },

  reset() {
    set({ draft: initialMatchSetupDraft(), status: 'idle', error: null });
  },

  submit() {
    return submitting.run(async () => {
      const draft = get().draft;
      const { teamAId, teamBId } = draft;
      if (teamAId === null || teamBId === null) {
        set({ error: storeError('VALIDATION', 'Choose both teams.') });
        return null;
      }
      const opening = openingEvents(draft, teamAId, teamBId);
      if (opening === null) {
        set({ error: storeError('VALIDATION', BATTING_FIRST_REQUIRED) });
        return null;
      }
      const rolesA = await rolesOf(teamAId);
      const rolesB = await rolesOf(teamBId);
      const names = new Map<TeamId, string | null>([
        [teamAId, rolesA.teamName],
        [teamBId, rolesB.teamName],
      ]);
      const blocking = selectBlockingSquadIssue(draft, (teamId) => names.get(teamId));
      if (blocking !== null) {
        const text = blocking.headline === undefined ? undefined : { headline: blocking.headline, detail: blocking.detail };
        set({ error: storeError('VALIDATION', blocking.message, blocking.code, text) });
        return null;
      }
      set({ status: 'saving', error: null });
      const squads = [
        { teamId: teamAId, players: squad(draft.squadA, draft.substitutesA, rolesA) },
        { teamId: teamBId, players: squad(draft.squadB, draft.substitutesB, rolesB) },
      ];
      const fixtureId = draft.fixtureId;
      const result =
        fixtureId === null
          ? await call(async (services) => {
              const input: NewMatchInput = {
                title: draft.title,
                teamAId,
                teamBId,
                venueId: draft.venueId,
                scheduledDate: draft.scheduledDate,
                scheduledTime: draft.scheduledTime,
                formatId: draft.formatId,
                rules: draft.rules,
                squads,
                toss: draft.toss,
                tournamentId: null,
                fixtureId: null,
                teamAPlayers: draft.teamAPlayers,
                teamBPlayers: draft.teamBPlayers,
              };
              const created = await services.matches.createMatch(input, opening);
              return created.ok ? { ok: true as const, value: created.value.match.id } : created;
            })
          : await call(async (services) => {
              const started = await services.tournaments.startFixtureMatch(
                fixtureId,
                { squads, toss: draft.toss, rules: draft.rules, teamAPlayers: draft.teamAPlayers, teamBPlayers: draft.teamBPlayers },
                opening,
              );
              return started.ok ? { ok: true as const, value: started.value.id } : started;
            });
      if (!result.ok) {
        set({ status: 'ready', error: result.error });
        return null;
      }
      set({ draft: initialMatchSetupDraft(), status: 'idle', error: null });
      return result.value;
    }, null);
  },
}));

import { create } from 'zustand';
import { instantiateTemplate, type PoolAssignment } from '@/domain/tournament';
import type { PoolEntry, Stage, TournamentId, TournamentSnapshot, TournamentStatus } from '@/domain/types';
import type { AppServices, FixturePlan, GenerateFixturesOptions, NewTournamentInput, PoolAssignmentMethod, ServiceError, ServiceResult } from '@/services/contracts';
import type { TournamentWizardDraft, TournamentWizardStep, TournamentWizardStore } from './contracts';
import { call, storeError } from './internal/call';
import { createSingleFlight } from './internal/singleFlight';
import { getAppServices } from './services';

export interface TournamentWizardPreviews {
  previewPools(method: PoolAssignmentMethod): Promise<PoolAssignment | null>;
  generateFixtures(opts?: GenerateFixturesOptions): Promise<FixturePlan | null>;
}

export type TournamentWizardState = TournamentWizardStore & TournamentWizardPreviews;

export const WIZARD_STEPS: readonly TournamentWizardStep[] = ['info', 'teams', 'structure', 'rules', 'pools', 'fixtures', 'review'];

const SETUP_STEP: Partial<Record<TournamentStatus, TournamentWizardStep>> = {
  draft: 'teams',
  registration: 'structure',
  structure_configured: 'rules',
  pools_configured: 'fixtures',
  fixtures_generated: 'review',
};

const EMPTY_INFO: NewTournamentInput = {
  name: '',
  season: null,
  description: null,
  organizer: null,
  startDate: null,
  endDate: null,
  venueIds: [],
  structureKind: 'groups_knockout',
  templateId: null,
};

export function initialWizardDraft(): TournamentWizardDraft {
  return { tournamentId: null, info: EMPTY_INFO, teams: [], rules: null, stages: [], pools: [], slots: [], poolAssignment: null, fixturePlan: null };
}

class WizardFailure extends Error {
  readonly error: ServiceError;

  constructor(error: ServiceError) {
    super(error.message);
    this.error = error;
  }
}

async function must<T>(task: (services: AppServices) => Promise<ServiceResult<T>>): Promise<T> {
  const result = await call(task);
  if (!result.ok) {
    throw new WizardFailure(result.error);
  }
  return result.value;
}

function sortedStages(stages: readonly Stage[]): readonly Stage[] {
  return [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
}

function poolStage(snapshot: Pick<TournamentSnapshot, 'stages' | 'pools'>): Stage | null {
  return sortedStages(snapshot.stages).find((stage) => snapshot.pools.some((pool) => pool.stageId === stage.id)) ?? null;
}

function assignmentOf(snapshot: TournamentSnapshot): PoolAssignment | null {
  const stage = poolStage(snapshot);
  if (stage === null) {
    return null;
  }
  const pools = snapshot.pools.filter((pool) => pool.stageId === stage.id).sort((a, b) => a.orderIndex - b.orderIndex);
  const entries = snapshot.poolEntries.filter((entry) => entry.stageId === stage.id);
  if (entries.length === 0) {
    return null;
  }
  return {
    seed: stage.config.seedingSeed,
    pools: pools.map((pool) => ({ poolId: pool.id, name: pool.name, members: entries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side) })),
  };
}

function draftFrom(snapshot: TournamentSnapshot): TournamentWizardDraft {
  const tournament = snapshot.tournament;
  return {
    tournamentId: tournament.id,
    info: {
      name: tournament.name,
      season: tournament.season,
      description: tournament.description,
      organizer: tournament.organizer,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      venueIds: tournament.venueIds,
      structureKind: tournament.structureKind,
      templateId: null,
    },
    teams: snapshot.teams.filter((view) => view.membership.status === 'active').map((view) => ({ teamId: view.team.id, seed: view.membership.seed })),
    rules: snapshot.rules,
    stages: snapshot.stages,
    pools: snapshot.pools,
    slots: snapshot.slots,
    poolAssignment: assignmentOf(snapshot),
    fixturePlan: null,
  };
}

function nextStep(step: TournamentWizardStep): TournamentWizardStep {
  return WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(step) + 1, WIZARD_STEPS.length - 1)];
}

async function advanceStatus(tournamentId: TournamentId, from: TournamentStatus, to: TournamentStatus): Promise<void> {
  const snapshot = await must((services) => services.tournaments.snapshot(tournamentId));
  if (snapshot.tournament.status === from) {
    await must((services) => services.tournaments.setStatus(tournamentId, to, null));
  }
}

function entriesFor(snapshot: TournamentSnapshot, draft: TournamentWizardDraft, newId: () => string): readonly PoolEntry[] {
  const stage = poolStage(draft);
  const seeds = new Map(draft.teams.map((team) => [team.teamId, team.seed]));
  const kept = snapshot.poolEntries.filter((entry) => entry.stageId !== stage?.id && draft.pools.some((pool) => pool.id === entry.poolId));
  if (stage === null || draft.poolAssignment === null) {
    return kept;
  }
  const assigned = draft.poolAssignment.pools.flatMap((pool) =>
    pool.members.map((side): PoolEntry => ({ id: newId(), poolId: pool.poolId, stageId: stage.id, side, seed: side.kind === 'team' ? (seeds.get(side.teamId) ?? null) : null })),
  );
  return [...kept, ...assigned];
}

export const useTournamentWizardStore = create<TournamentWizardState>()((set, get) => {
  const saving = createSingleFlight();

  const requireTournament = (): TournamentId => {
    const tournamentId = get().draft.tournamentId;
    if (tournamentId === null) {
      throw new WizardFailure(storeError('VALIDATION', 'Save the tournament information first.'));
    }
    return tournamentId;
  };

  const saveStructure = async (tournamentId: TournamentId, draft: TournamentWizardDraft): Promise<TournamentSnapshot> => {
    const current = await must((services) => services.tournaments.snapshot(tournamentId));
    return must((services) =>
      services.tournaments.saveStructure(tournamentId, {
        rules: draft.rules ?? current.rules,
        stages: draft.stages,
        pools: draft.pools,
        slots: draft.slots,
        poolEntries: entriesFor(current, draft, services.newId),
      }),
    );
  };

  const saveInfo = async (): Promise<void> => {
    const { draft } = get();
    if (draft.tournamentId === null) {
      const tournament = await must((services) => services.tournaments.create(draft.info));
      set({ draft: { ...get().draft, tournamentId: tournament.id } });
      return;
    }
    const info = draft.info;
    await must((services) =>
      services.tournaments.updateInfo(requireTournament(), {
        name: info.name,
        season: info.season,
        description: info.description,
        organizer: info.organizer,
        startDate: info.startDate,
        endDate: info.endDate,
        venueIds: info.venueIds,
        structureKind: info.structureKind,
      }),
    );
  };

  const saveTeams = async (): Promise<void> => {
    const tournamentId = requireTournament();
    const { teams } = get().draft;
    const snapshot = await must((services) => services.tournaments.snapshot(tournamentId));
    const current = new Map(snapshot.teams.filter((view) => view.membership.status === 'active').map((view) => [view.team.id, view.membership.seed]));
    const wanted = new Set(teams.map((team) => team.teamId));
    const removed = [...current.keys()].filter((teamId) => !wanted.has(teamId));
    if (removed.length > 0) {
      await must((services) => services.tournaments.removeTeams(tournamentId, removed));
    }
    const added = teams.filter((team) => !current.has(team.teamId));
    if (added.length > 0) {
      await must((services) => services.tournaments.addTeams(tournamentId, added));
    }
    const reseeded = teams.filter((team) => current.has(team.teamId) && current.get(team.teamId) !== team.seed);
    if (reseeded.length > 0) {
      const change = { kind: 'team_seeds_change' as const, seeds: reseeded };
      const preview = await must((services) => services.tournaments.previewChange(tournamentId, change));
      await must((services) => services.tournaments.applyChange(tournamentId, change, null, preview));
    }
    await advanceStatus(tournamentId, 'draft', 'registration');
  };

  const saveKind = async (tournamentId: TournamentId, saved: TournamentSnapshot): Promise<void> => {
    const kind = get().draft.info.structureKind;
    if (saved.tournament.structureKind !== kind) {
      await must((services) => services.tournaments.updateInfo(tournamentId, { structureKind: kind }));
    }
  };

  const saveTemplateStructure = async (): Promise<void> => {
    const tournamentId = requireTournament();
    const { draft } = get();
    if (draft.stages.length === 0) {
      const templateId = draft.info.templateId;
      if (templateId === null) {
        throw new WizardFailure(storeError('VALIDATION', 'Choose a template or add at least one stage.'));
      }
      const templates = await must((services) => services.tournaments.listTemplates());
      const template = templates.find((entry) => entry.id === templateId);
      if (template === undefined) {
        throw new WizardFailure(storeError('NOT_FOUND', 'That template no longer exists.'));
      }
      const structure = instantiateTemplate(template, { tournamentId, now: new Date().toISOString(), ids: getAppServices().newId });
      const snapshot = await must((registry) =>
        registry.tournaments.saveStructure(tournamentId, {
          rules: draft.rules ?? structure.rules,
          stages: structure.stages,
          pools: structure.pools,
          slots: structure.slots,
          poolEntries: structure.poolEntries,
        }),
      );
      set({ draft: { ...get().draft, rules: snapshot.rules, stages: snapshot.stages, pools: snapshot.pools, slots: snapshot.slots, poolAssignment: null } });
      await saveKind(tournamentId, snapshot);
    } else {
      await saveKind(tournamentId, await saveStructure(tournamentId, draft));
    }
    await advanceStatus(tournamentId, 'registration', 'structure_configured');
  };

  const savePools = async (): Promise<void> => {
    const tournamentId = requireTournament();
    const { draft } = get();
    if (poolStage(draft) !== null && draft.poolAssignment === null) {
      throw new WizardFailure(storeError('VALIDATION', 'Arrange the teams into pools first.'));
    }
    await saveStructure(tournamentId, draft);
    await advanceStatus(tournamentId, 'structure_configured', 'pools_configured');
  };

  const saveFixtures = async (): Promise<void> => {
    const tournamentId = requireTournament();
    const snapshot = await must((services) => services.tournaments.snapshot(tournamentId));
    const [first, ...later] = sortedStages(snapshot.stages);
    if (first === undefined) {
      throw new WizardFailure(storeError('VALIDATION', 'Add at least one stage first.'));
    }
    const plan = get().draft.fixturePlan ?? (await must((services) => services.tournaments.generateFixtures(first.id)));
    await must((services) => services.tournaments.confirmFixtures(first.id, plan));
    for (const stage of later) {
      if (stage.config.fixtureGeneration.method !== 'manual' && !snapshot.fixtures.some((fixture) => fixture.stageId === stage.id)) {
        const generated = await call((services) => services.tournaments.generateFixtures(stage.id));
        if (generated.ok && generated.value.fixtures.length > 0) {
          await must((services) => services.tournaments.confirmFixtures(stage.id, generated.value));
        }
      }
    }
    await advanceStatus(tournamentId, 'pools_configured', 'fixtures_generated');
  };

  const saveCurrent = async (step: TournamentWizardStep): Promise<void> => {
    switch (step) {
      case 'info':
        return saveInfo();
      case 'teams':
        return saveTeams();
      case 'structure':
        return saveTemplateStructure();
      case 'rules':
        await saveStructure(requireTournament(), get().draft);
        return;
      case 'pools':
        return savePools();
      case 'fixtures':
        return saveFixtures();
      case 'review':
        return;
      default: {
        const unreachable: never = step;
        return unreachable;
      }
    }
  };

  const guarded = async <T>(task: () => Promise<T>, fallback: T): Promise<T> => {
    set({ status: 'saving', error: null });
    try {
      const value = await task();
      set({ status: 'ready' });
      return value;
    } catch (error) {
      if (error instanceof WizardFailure) {
        set({ status: 'ready', error: error.error });
        return fallback;
      }
      throw error;
    }
  };

  const guardedOnce = <T>(task: () => Promise<T>, fallback: T): Promise<T> => saving.run(() => guarded(task, fallback), fallback);

  return {
    step: 'info',
    draft: initialWizardDraft(),
    status: 'idle',
    error: null,

    async resume(tournamentId) {
      set({ status: 'loading', error: null });
      const result = await call((services) => services.tournaments.snapshot(tournamentId));
      if (!result.ok) {
        set({ status: 'error', error: result.error });
        return false;
      }
      const step = SETUP_STEP[result.value.tournament.status];
      if (step === undefined) {
        set({ status: 'error', error: storeError('FORBIDDEN_STATE', 'This tournament has already started. Its setup is finished.') });
        return false;
      }
      set({ step, draft: draftFrom(result.value), status: 'ready' });
      return true;
    },

    update(patch) {
      set({ draft: { ...get().draft, ...patch } });
    },

    goTo(step) {
      set({ step });
    },

    saveStep() {
      return guardedOnce(async () => {
        const step = get().step;
        await saveCurrent(step);
        set({ step: nextStep(step) });
        return true;
      }, false);
    },

    commit() {
      return guardedOnce(async () => {
        if (get().step !== 'review') {
          throw new WizardFailure(storeError('VALIDATION', 'Finish the remaining steps first.'));
        }
        const tournamentId = requireTournament();
        const snapshot = await must((services) => services.tournaments.snapshot(tournamentId));
        if (snapshot.tournament.status !== 'fixtures_generated' && snapshot.tournament.status !== 'active') {
          throw new WizardFailure(storeError('VALIDATION', "Confirm the tournament's fixtures first."));
        }
        set({ step: 'info', draft: initialWizardDraft() });
        return tournamentId;
      }, null);
    },

    reset() {
      set({ step: 'info', draft: initialWizardDraft(), status: 'idle', error: null });
    },

    async listTemplates() {
      const result = await call((services) => services.tournaments.listTemplates());
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.value;
    },

    previewPools(method) {
      return guarded(async () => {
        const stage = poolStage(get().draft);
        if (stage === null) {
          throw new WizardFailure(storeError('VALIDATION', 'This structure has no pools.'));
        }
        const assignment = await must((services) => services.tournaments.previewPoolAssignment(stage.id, method));
        set({ draft: { ...get().draft, poolAssignment: assignment } });
        return assignment;
      }, null);
    },

    generateFixtures(opts) {
      return guarded(async () => {
        const first = sortedStages(get().draft.stages)[0];
        if (first === undefined) {
          throw new WizardFailure(storeError('VALIDATION', 'Add at least one stage first.'));
        }
        const plan = await must((services) => services.tournaments.generateFixtures(first.id, opts));
        set({ draft: { ...get().draft, fixturePlan: plan } });
        return plan;
      }, null);
    },
  };
});

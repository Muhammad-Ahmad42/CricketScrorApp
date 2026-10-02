import type { ProposedChange, Team, TournamentListItem, TournamentSnapshot } from '@/domain/types';
import type { ChangePreview } from '@/services/contracts';
import type { TournamentWizardDraft, TournamentWizardStep } from '@/stores/contracts';
import { EMPTY_WIZARD_DRAFT } from './fakes';
import { resetStores, useTournamentStore, useTournamentWizardStore } from './mockStores';
import { resetRouter } from './router';
import { evaluated, teamView, type Evaluated } from './tournament';

export function resetAll(): void {
  resetStores();
  resetRouter();
}

export function loadTournament(snapshot: TournamentSnapshot): Evaluated {
  const data = evaluated(snapshot);
  useTournamentStore.setState({
    tournamentId: snapshot.tournament.id,
    status: 'ready',
    snapshot: data.snapshot,
    evaluation: data.evaluation,
    error: null,
  });
  return data;
}

export function previewOf(change: ProposedChange, overrides: Partial<ChangePreview['impact']> = {}): ChangePreview {
  return {
    version: 'v1',
    impact: {
      severity: 'warning',
      headline: `Preview of ${change.kind}`,
      lines: [],
      fixtures: [],
      standings: [],
      qualification: [],
      slots: [],
      nrrChanged: false,
      completedMatchesAffected: 0,
      requiresConfirmation: true,
      requiresReason: false,
      blocked: null,
      ...overrides,
    },
  };
}

export function listItem(overrides: Partial<TournamentListItem> = {}): TournamentListItem {
  return {
    id: 't1',
    name: 'City Cup',
    season: '2026',
    status: 'active',
    teamCount: 12,
    fixturesDone: 24,
    fixturesTotal: 48,
    championName: null,
    startDate: '2026-09-12',
    endDate: '2026-10-04',
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  };
}

export function liveWizard(draft: Partial<TournamentWizardDraft> = {}, step: TournamentWizardStep = 'info'): void {
  useTournamentWizardStore.setState({
    step,
    draft: { ...EMPTY_WIZARD_DRAFT, ...draft },
    update: jest.fn((patch: Partial<TournamentWizardDraft>) => {
      useTournamentWizardStore.setState((state) => ({ draft: { ...state.draft, ...patch } }));
    }),
    goTo: jest.fn((next: TournamentWizardStep) => {
      useTournamentWizardStore.setState({ step: next });
    }),
  });
}

export function libraryTeams(ids: readonly string[]): readonly Team[] {
  return ids.map((teamId) => teamView(teamId).team);
}

import '@/ui/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { computeTournamentStats } from '@/domain/tournament/stats';
import type { AuditEvent, ProposedChange } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { AuditScreen } from '../screens/AuditScreen';
import { StageDetailScreen } from '../screens/StageDetailScreen';
import { StagesScreen } from '../screens/StagesScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { loadTournament, previewOf, resetAll } from './support/harness';
import { useTournamentStore } from './support/mockStores';
import { mockRouter } from './support/router';
import { cupSnapshot, playGroups, playPair } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function auditEvent(id: string, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    tournamentId: 't1',
    matchId: null,
    action: 'team_moved',
    entityType: 'team',
    entityId: 'HAW',
    summary: 'Moved Hawks from Pool A to Pool B',
    previousValue: 'Pool A',
    newValue: 'Pool B',
    reason: 'Hawks asked to play on Sundays',
    impact: null,
    createdAt: '2026-09-14T11:40:00.000Z',
    ...overrides,
  };
}

describe('StatsScreen (§52)', () => {
  it('shows totals and records without stat cards', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    const stats = computeTournamentStats(data.snapshot, data.evaluation);
    useTournamentStore.setState({ loadStats: jest.fn(async () => stats) });
    await renderWithTheme(<StatsScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('stats-text-total-matches')).toHaveTextContent('6 of 15'));
    expect(screen.getByTestId('stats-row-record-highest-team-score')).toBeOnTheScreen();
    expect(screen.getByTestId('stats-row-record-best-bowling')).toBeOnTheScreen();
  });

  it('switches to the team table', async () => {
    const data = loadTournament(playGroups(cupSnapshot(), 6));
    useTournamentStore.setState({ loadStats: jest.fn(async () => computeTournamentStats(data.snapshot, data.evaluation)) });
    await renderWithTheme(<StatsScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('stats-text-total-matches')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('stats-tab-teams'));
    expect(screen.getByTestId('stats-table-teams')).toBeOnTheScreen();
    expect(screen.getAllByText('Lions').length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText(/, \d+ (match|matches), /).length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText(/(?:^|[^\d.,])1 (?:matches|points|runs|wickets)\b/)).toHaveLength(0);
  });

  it('offers a retry when statistics fail to load', async () => {
    loadTournament(cupSnapshot());
    const loadStats = jest.fn(async () => null);
    useTournamentStore.setState({ loadStats });
    await renderWithTheme(<StatsScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('stats-error')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('error-btn-retry'));
    await waitFor(() => expect(loadStats).toHaveBeenCalledTimes(2));
  });
});

describe('AuditScreen (§53)', () => {
  it('lists changes with summary, previous → new value and the reason', async () => {
    loadTournament(cupSnapshot());
    useTournamentStore.setState({ loadAudit: jest.fn(async () => [auditEvent('a1')]) });
    await renderWithTheme(<AuditScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('audit-text-summary-1')).toHaveTextContent('Moved Hawks from Pool A to Pool B'));
    expect(screen.getByText('Pool A → Pool B')).toBeOnTheScreen();
    expect(screen.getByTestId('audit-text-reason-1')).toHaveTextContent('“Hawks asked to play on Sundays”');
  });

  it('expands the stored impact read-only', async () => {
    loadTournament(cupSnapshot());
    const impact = previewOf({ kind: 'pool_swap', stageId: 's', memberA: { kind: 'team', teamId: 'LIO' }, memberB: { kind: 'team', teamId: 'BUL' } }, {
      headline: 'NRR changed for 2 teams',
      standings: [{ stageId: 's', poolId: null, teamId: 'LIO', before: { position: 1, points: 6, nrr: 1 }, after: { position: 2, points: 6, nrr: 0.5 } }],
    }).impact;
    useTournamentStore.setState({ loadAudit: jest.fn(async () => [auditEvent('a1', { impact })]) });
    await renderWithTheme(<AuditScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('audit-btn-impact-1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('audit-btn-impact-1'));
    expect(screen.getByTestId('impact-text-standing-1')).toHaveTextContent(/Lions/);
    expect(screen.queryByTestId('impact-btn-continue')).not.toBeOnTheScreen();
  });

  it('pages older changes by timestamp and filters by kind', async () => {
    loadTournament(cupSnapshot());
    const first = Array.from({ length: 30 }, (_, index) => auditEvent(`e${index}`, { createdAt: `2026-09-14T11:${String(59 - index).padStart(2, '0')}:00.000Z` }));
    const loadAudit = jest.fn(async (page: { readonly limit: number; readonly before?: string }) =>
      page.before ? [auditEvent('old', { action: 'result_corrected', summary: 'Result corrected · M13', createdAt: '2026-09-13T09:12:00.000Z' })] : first,
    );
    useTournamentStore.setState({ loadAudit });
    await renderWithTheme(<AuditScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('audit-row-1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('audit-tab-results'));
    expect(screen.queryByTestId('audit-row-1')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('audit-btn-more'));
    await waitFor(() => expect(loadAudit).toHaveBeenCalledWith({ limit: 30, before: first[29].createdAt }));
    await waitFor(() => expect(screen.getByText('Result corrected · M13')).toBeOnTheScreen());
  });

  it('shows an empty state', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<AuditScreen tournamentId="t1" />);
    await waitFor(() => expect(screen.getByTestId('audit-empty')).toBeOnTheScreen());
  });
});

describe('Stages (§29, §44–§46)', () => {
  it('lists stages with their summary and the champion marker', async () => {
    loadTournament(cupSnapshot());
    await renderWithTheme(<StagesScreen tournamentId="t1" />);
    expect(screen.getByTestId('stages-row-1')).toHaveProp('accessibilityLabel', expect.stringContaining('2 pools · single round robin'));
    expect(screen.getByTestId('stages-row-2')).toHaveProp('accessibilityLabel', expect.stringContaining('★ Decides the champion'));
    await fireEvent.press(screen.getByTestId('stages-row-2'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/tournament/[tournamentId]/stages/[stageId]' }));
  });

  it('adds a stage through the impact preview', async () => {
    loadTournament(cupSnapshot());
    const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change));
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<StagesScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('stages-btn-add'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stage_upsert' })));
    const change = previewChange.mock.calls[0][0];
    if (change.kind === 'stage_upsert') {
      expect(change.stage.config.entryRules).toEqual([expect.objectContaining({ kind: 'knockout_winners' })]);
    }
  });

  it('shows entry rules, slots with resolution and saves edits through the impact preview', async () => {
    const snapshot = playGroups(cupSnapshot());
    loadTournament(snapshot);
    const knockout = snapshot.stages.find((stage) => stage.type === 'knockout');
    const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change));
    useTournamentStore.setState({ previewChange });
    await renderWithTheme(<StageDetailScreen tournamentId="t1" stageId={knockout?.id ?? ''} />);
    expect(screen.getByTestId('stage-text-entry')).toHaveTextContent('Top 2 from each pool');
    expect(screen.getByTestId('stage-row-slot-1')).toHaveProp('accessibilityLabel', 'A1, Lions');
    expect(screen.getByTestId('stage-btn-review')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('stage-toggle-third-place'));
    await fireEvent.press(screen.getByTestId('stage-btn-review'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stage_upsert' })));
    const change = previewChange.mock.calls[0][0];
    if (change.kind === 'stage_upsert') {
      expect(change.stage.config.knockout?.thirdPlacePlayoff).toBe(true);
      expect(change.slots.filter((slot) => slot.role === 'entry').map((slot) => slot.label)).toEqual(['A1', 'B1', 'A2', 'B2']);
    }
  });

  it('generates a bracket preview and replaces fixtures through the impact preview once play started', async () => {
    const snapshot = playPair(cupSnapshot(), 'LIO', 'TIG', 'LIO');
    loadTournament(snapshot);
    const knockout = snapshot.stages.find((stage) => stage.type === 'knockout');
    const plan = { fixtures: [], slots: [], entrySlotSeeds: [], seed: null };
    const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change));
    useTournamentStore.setState({ generateFixtures: jest.fn(async () => plan), previewChange });
    await renderWithTheme(<StageDetailScreen tournamentId="t1" stageId={knockout?.id ?? ''} />);
    await fireEvent.press(screen.getByTestId('stage-btn-generate'));
    await waitFor(() => expect(screen.getByTestId('stage-btn-confirm-plan')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('stage-btn-confirm-plan'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fixtures_replace', stageId: knockout?.id })));
    expect(useTournamentStore.getState().confirmFixtures).not.toHaveBeenCalled();
  });
});

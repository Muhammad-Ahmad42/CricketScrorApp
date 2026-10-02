import '@/features/scoring/__tests__/support/mocks';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { BootstrapReport } from '@/services/contracts';
import type { MatchListItem } from '@/domain/types';
import { fakeApp, fakeHistory, fakeHome, fakeSetup, fakeWizard } from '@/features/scoring/__tests__/support/fakes';
import { completedItem, listItem, tournamentItem } from '@/features/scoring/__tests__/support/listItems';
import { renderScreen, resetCommonStores } from '@/features/scoring/__tests__/support/render';
import { HomeScreen, greetingFor } from '../screens/HomeScreen';
import { resetResumeSession } from '../resumeSession';
import { setHourSource } from '../clock';
import { mockStores } from '@/features/scoring/__tests__/support/storeModule';

const { useAppStore, useHomeStore, useMatchHistoryStore, useMatchSetupStore, useToastStore, useTournamentWizardStore } = mockStores();

function report(resumable: readonly MatchListItem[], repair: readonly string[] = []): BootstrapReport {
  return { schemaVersion: 1, resumable, projectionsRebuilt: 0, integrityIssues: repair.map((matchId) => ({ matchId, message: 'Bad event' })) };
}

describe('HomeScreen', () => {
  beforeEach(() => {
    resetCommonStores();
    resetResumeSession();
    useAppStore.setState(fakeApp(), true);
    useHomeStore.setState(fakeHome(), true);
    useMatchSetupStore.setState(fakeSetup(), true);
    useTournamentWizardStore.setState(fakeWizard(), true);
    useMatchHistoryStore.setState(fakeHistory(), true);
    jest.clearAllMocks();
  });

  it('greets by time of day', () => {
    expect([greetingFor(8), greetingFor(13), greetingFor(20)]).toEqual(['Good morning', 'Good afternoon', 'Good evening']);
  });

  it('takes the greeting hour from the injected clock, not the device clock', async () => {
    setHourSource(() => 7);
    const view = await renderScreen(<HomeScreen />);
    expect(screen.getByText('Good morning')).toBeOnTheScreen();
    await view.unmount();
    setHourSource(() => 21);
    await renderScreen(<HomeScreen />);
    expect(screen.getByText('Good evening')).toBeOnTheScreen();
    setHourSource(null);
  });

  it('loads the home lists and shows the first-run state when empty', async () => {
    await renderScreen(<HomeScreen />);
    expect(useHomeStore.getState().load).toHaveBeenCalled();
    expect(screen.getByTestId('home-first-run')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home-btn-create-tournament'));
    expect(useTournamentWizardStore.getState().reset).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/tournament/new');
  });

  it('starts a new match from a reset draft with the default format', async () => {
    await renderScreen(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-btn-new-match'));
    expect(useMatchSetupStore.getState().reset).toHaveBeenCalled();
    expect(useMatchSetupStore.getState().update).toHaveBeenCalledWith(expect.objectContaining({ formatId: 'T20' }));
    expect(router.push).toHaveBeenCalledWith('/match/new');
  });

  it('floats the title in the glass bar and the primary action as a glass button outside the scrolling content', async () => {
    await renderScreen(<HomeScreen />);
    expect(within(screen.getByTestId('screen-home-header')).getByText('Scorebook')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-home-scroll')).queryByTestId('home-btn-new-match')).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-btn-new-match')).toHaveProp('accessibilityLabel', 'New match');
  });

  it('shows Continue Match with team, score and overs, recent results and tournaments', async () => {
    useHomeStore.setState(fakeHome({ resumable: [listItem()], recent: [completedItem()], tournaments: [tournamentItem()] }), true);
    await renderScreen(<HomeScreen />);
    expect(screen.getByTestId('home-continue-m-live')).toHaveProp('accessibilityLabel', 'Pakistan XI v Lions · 20 ov, Live, Pakistan XI 142/4 after 16.4 overs, Lions yet to bat');
    expect(screen.getByText('Lions won by 5 wickets (12 balls left)')).toBeOnTheScreen();
    expect(screen.getByText('TIG 168/7 (20) · LIO 169/5 (18)')).toBeOnTheScreen();
    expect(screen.getByText('Active · 24/48')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home-continue-m-live-resume'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'm-live' } });
    await fireEvent.press(screen.getByTestId('home-recent-m-done'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/scorecard', params: { matchId: 'm-done' } });
    await fireEvent.press(screen.getByTestId('home-tournament-t-1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/tournament/[tournamentId]', params: { tournamentId: 't-1' } });
  });

  it('opens History filtered to live matches when there are more than three', async () => {
    const live = ['a', 'b', 'c', 'd'].map((id) => listItem({ id }));
    useHomeStore.setState(fakeHome({ resumable: live }), true);
    await renderScreen(<HomeScreen />);
    expect(screen.queryByTestId('home-continue-d')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home-btn-all-live'));
    expect(useMatchHistoryStore.getState().load).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['live', 'paused'] }));
    expect(router.push).toHaveBeenCalledWith('/history');
  });

  describe('MATCH IN PROGRESS prompt (§23)', () => {
    it('shows RESUME / SAVE & EXIT / DISCARD for an unfinished standalone match and resumes', async () => {
      useAppStore.setState(fakeApp({ report: report([listItem()]) }), true);
      await renderScreen(<HomeScreen />);
      expect(screen.getByTestId('sheet-resume')).toBeOnTheScreen();
      expect(screen.getByText('Pakistan XI')).toBeOnTheScreen();
      expect(screen.getByText('142/4', { exact: true })).toBeOnTheScreen();
      expect(screen.getByTestId('resume-btn-discard')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('resume-btn-resume'));
      expect(router.push).toHaveBeenCalledWith({ pathname: '/match/[matchId]/score', params: { matchId: 'm-live' } });
      await waitFor(() => expect(screen.queryByTestId('resume-btn-resume')).not.toBeOnTheScreen());
    });

    it('SAVE & EXIT dismisses the prompt for the match', async () => {
      useAppStore.setState(fakeApp({ report: report([listItem()]) }), true);
      await renderScreen(<HomeScreen />);
      await fireEvent.press(screen.getByTestId('resume-btn-save-exit'));
      expect(useHomeStore.getState().dismissResume).toHaveBeenCalledWith('m-live');
      await waitFor(() => expect(screen.queryByTestId('resume-btn-save-exit')).not.toBeOnTheScreen());
    });

    it('DISCARD asks for confirmation and then discards', async () => {
      useAppStore.setState(fakeApp({ report: report([listItem()]) }), true);
      await renderScreen(<HomeScreen />);
      await fireEvent.press(screen.getByTestId('resume-btn-discard'));
      await fireEvent.press(screen.getByTestId('home-discard-confirm'));
      await waitFor(() => expect(useHomeStore.getState().discard).toHaveBeenCalledWith('m-live'));
      expect(useToastStore.getState().show).toHaveBeenCalledWith({ kind: 'info', message: 'Match discarded', action: null });
    });

    it('offers no DISCARD for a tournament match and marks matches that need repair', async () => {
      useAppStore.setState(fakeApp({ report: report([listItem({ tournamentId: 't-1', tournamentName: 'City Cup' })], ['m-live']) }), true);
      await renderScreen(<HomeScreen />);
      expect(screen.queryByTestId('resume-btn-discard')).not.toBeOnTheScreen();
      expect(screen.getByTestId('resume-text-tournament')).toBeOnTheScreen();
      expect(screen.getByText('Needs repair')).toBeOnTheScreen();
    });

    it('does not prompt for a match already dismissed with SAVE & EXIT', async () => {
      useAppStore.setState(fakeApp({ report: report([listItem()]) }), true);
      useHomeStore.setState(fakeHome({ resumable: [listItem({ resumeDismissedAt: '2026-09-12T15:00:00.000Z' })] }), true);
      await renderScreen(<HomeScreen />);
      expect(screen.queryByTestId('sheet-resume')).not.toBeOnTheScreen();
      expect(screen.getByTestId('home-continue-m-live')).toBeOnTheScreen();
    });
  });
});

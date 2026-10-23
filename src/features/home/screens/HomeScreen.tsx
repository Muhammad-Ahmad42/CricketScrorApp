import { useCallback, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  FAB_HEIGHT,
  FloatingActionButton,
  Inset,
  Screen,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Text,
  TwoPane,
  floatingActionBottom,
  space,
  useContentInsets,
  useToastAnchor,
  useTwoPane,
} from '@/ui';
import { useAppStore, useHomeStore, useMatchHistoryStore, useToastStore } from '@/stores';
import { withStatus } from '@/features/history/selectors/query';
import { selectContinue, selectMatchCard } from '@/features/history/selectors/matchCard';
import { MatchCard } from '@/features/history/components/MatchCard';
import { formatTimeOfDay } from '@/features/scoring/selectors/dates';
import { startNewMatch } from '@/features/match-setup/actions';
import { TextAction } from '@/features/scoring/components/common/TextAction';
import { currentHour } from '../clock';
import { ContinueMatchCard } from '../components/ContinueMatchCard';
import { ResumePromptSheet, type ResumePromptItem } from '../components/ResumePromptSheet';
import { TournamentRow } from '../components/TournamentRow';
import { createTournament, openMatch, openTournament } from '../navigation';
import { isResumeHandled, markResumeHandled } from '../resumeSession';
import { isTournamentFinished, selectTournamentRow } from '../selectors/tournaments';

export const MAX_CONTINUE = 3;
export const MAX_RECENT = 3;
export const MAX_TOURNAMENTS = 2;

export const FAB_COLLAPSE_MAX_HEIGHT = 700;

export function shouldCollapseNewMatch(windowHeight: number, scrolled: boolean): boolean {
  return scrolled && windowHeight <= FAB_COLLAPSE_MAX_HEIGHT;
}

export function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function NewMatchButton({ scrolled }: { readonly scrolled: boolean }) {
  const insets = useContentInsets();
  const { height } = useWindowDimensions();
  useToastAnchor({ edge: 'bottom', offset: floatingActionBottom(insets.bottom) + FAB_HEIGHT + space.md });
  return (
    <FloatingActionButton
      label="New match"
      icon="plus"
      placement="end"
      accessibilityHint="Opens match setup"
      onPress={startNewMatch}
      collapsed={shouldCollapseNewMatch(height, scrolled)}
      testID="home-btn-new-match"
    />
  );
}

export function HomeScreen() {
  const home = useHomeStore(useShallow((s) => ({ status: s.status, resumable: s.resumable, recent: s.recent, tournaments: s.tournaments })));
  const report = useAppStore((s) => s.report);
  const [, setVersion] = useState(0);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const twoPane = useTwoPane();

  useFocusEffect(
    useCallback(() => {
      void useHomeStore.getState().load();
    }, []),
  );

  const refresh = () => setVersion((value) => value + 1);
  const repairIds = new Set(report?.integrityIssues.map((issue) => issue.matchId) ?? []);
  const promptItems: ResumePromptItem[] = (report?.resumable ?? [])
    .filter((item) => !isResumeHandled(item.id))
    .map((item) => home.resumable.find((entry) => entry.id === item.id) ?? item)
    .filter((item) => item.resumeDismissedAt === null && (item.status === 'live' || item.status === 'paused'))
    .map((item) => ({ vm: selectContinue(item), savedAt: formatTimeOfDay(item.updatedAt), needsRepair: repairIds.has(item.id) }));

  const resume = (matchId: string) => {
    markResumeHandled(promptItems.map((item) => item.vm.id));
    refresh();
    openMatch(matchId, true);
  };
  const saveExit = () => {
    const ids = promptItems.map((item) => item.vm.id);
    markResumeHandled(ids);
    refresh();
    for (const id of ids) {
      void useHomeStore.getState().dismissResume(id);
    }
  };
  const discard = async () => {
    const id = discardId;
    setDiscardId(null);
    if (id === null) {
      return;
    }
    const ok = await useHomeStore.getState().discard(id);
    if (ok) {
      markResumeHandled([id]);
      refresh();
      useToastStore.getState().show({ kind: 'info', message: 'Match discarded', action: null });
    }
  };

  const seeAllLive = () => {
    void useMatchHistoryStore.getState().load(withStatus({ sort: 'recent' }, 'live'));
    router.push('/history');
  };
  const continuing = home.resumable.slice(0, MAX_CONTINUE).map(selectContinue);
  const recent = home.recent.slice(0, MAX_RECENT).map(selectMatchCard);
  const tournaments = home.tournaments
    .filter((item) => !isTournamentFinished(item.status))
    .slice(0, MAX_TOURNAMENTS)
    .map(selectTournamentRow);
  const loading = home.status === 'loading' || home.status === 'idle';
  const firstRun = !loading && continuing.length === 0 && recent.length === 0 && tournaments.length === 0;
  const split = twoPane && tournaments.length > 0 && (continuing.length > 0 || recent.length > 0);
  const matches = (
    <>
      {continuing.length > 0 ? (
        <View testID="home-continue">
          <SectionHeader title="Continue match" />
          {continuing.map((vm, index) => (
            <ContinueMatchCard key={vm.id} vm={vm} primary={index === 0} onResume={() => openMatch(vm.id, true)} />
          ))}
          {home.resumable.length > MAX_CONTINUE ? (
            <TextAction label="See all" accessibilityLabel="See all live matches" onPress={seeAllLive} testID="home-btn-all-live" />
          ) : null}
        </View>
      ) : null}
      {recent.length > 0 ? (
        <View testID="home-recent">
          <SectionHeader title="Recent" action={{ label: 'See all', onPress: () => router.push('/history'), testID: 'home-btn-all-recent' }} />
          {recent.map((vm) => (
            <MatchCard key={vm.id} vm={vm} onPress={() => openMatch(vm.id, vm.inPlay)} testID={`home-recent-${vm.id}`} />
          ))}
        </View>
      ) : null}
    </>
  );
  const competitions =
    tournaments.length > 0 ? (
      <View testID="home-tournaments">
        <SectionHeader title="Tournaments" action={{ label: 'See all', onPress: () => router.push('/tournaments'), testID: 'home-btn-all-tournaments' }} />
        {tournaments.map((vm) => (
          <TournamentRow key={vm.id} vm={vm} onPress={() => openTournament(vm.id, vm.inSetup)} testID={`home-tournament-${vm.id}`} />
        ))}
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <Screen testID="screen-home" wide={split} onScrolledChange={setScrolled} header={<ScreenHeader title="Scorebook" subtitle={greetingFor(currentHour())} />}>
        {loading && continuing.length === 0 && recent.length === 0 ? <Skeleton rows={3} testID="home-loading" /> : null}
        {split ? (
          <TwoPane primary={matches} secondary={competitions} ratio={0.58} testID="home-panes" />
        ) : (
          <>
            {matches}
            {competitions}
          </>
        )}
        {firstRun ? (
          <View testID="home-first-run">
            <Inset top="xl" gap="xs">
              <Text variant="title2">Score your first match</Text>
              <Text variant="body" tone="secondary">
                Tap New match to get started.
              </Text>
            </Inset>
            <TextAction label="Create a tournament" icon="trophy" onPress={createTournament} testID="home-btn-create-tournament" />
          </View>
        ) : null}
        <View style={styles.fabSpace} />
        <ResumePromptSheet visible={promptItems.length > 0 && discardId === null} items={promptItems} onResume={resume} onSaveExit={saveExit} onDiscard={setDiscardId} />
        <Dialog
          visible={discardId !== null}
          destructive
          title="Discard this match?"
          message="Every recorded ball is deleted. This can't be undone."
          confirm={{ label: 'Discard match', onPress: () => void discard(), testID: 'home-discard-confirm' }}
          cancel={{ label: 'Cancel', onPress: () => setDiscardId(null), testID: 'home-discard-cancel' }}
          onRequestClose={() => setDiscardId(null)}
        />
      </Screen>
      <NewMatchButton scrolled={scrolled} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fabSpace: { height: FAB_HEIGHT + space.md },
});

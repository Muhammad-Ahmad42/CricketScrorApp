import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { Button, Dialog, FAB_HEIGHT, FloatingActionButton, Screen, ScreenHeader, SectionHeader, Skeleton, Text, floatingActionBottom, space, useContentInsets, useToastAnchor } from '@/ui';
import { useAppStore, useHomeStore, useMatchHistoryStore, useToastStore } from '@/stores';
import { withStatus } from '@/features/history/selectors/query';
import { selectContinue, selectMatchCard } from '@/features/history/selectors/matchCard';
import { MatchCard } from '@/features/history/components/MatchCard';
import { formatTimeOfDay } from '@/features/scoring/selectors/dates';
import { startNewMatch } from '@/features/match-setup/actions';
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

export function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function NewMatchButton() {
  const insets = useContentInsets();
  useToastAnchor({ edge: 'bottom', offset: floatingActionBottom(insets.bottom) + FAB_HEIGHT + space.md });
  return (
    <FloatingActionButton
      label="New match"
      icon="plus"
      placement="center"
      accessibilityHint="Opens match setup"
      onPress={startNewMatch}
      testID="home-btn-new-match"
    />
  );
}

export function HomeScreen() {
  const home = useHomeStore(useShallow((s) => ({ status: s.status, resumable: s.resumable, recent: s.recent, tournaments: s.tournaments })));
  const report = useAppStore((s) => s.report);
  const [, setVersion] = useState(0);
  const [discardId, setDiscardId] = useState<string | null>(null);

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

  return (
    <View style={styles.root}>
      <Screen testID="screen-home" ambient header={<ScreenHeader title="Scorebook" subtitle={greetingFor(currentHour())} />}>
        {loading && continuing.length === 0 && recent.length === 0 ? <Skeleton rows={3} testID="home-loading" /> : null}
        {continuing.length > 0 ? (
          <View testID="home-continue">
            <SectionHeader title="Continue match" />
            {continuing.map((vm) => (
              <ContinueMatchCard key={vm.id} vm={vm} onResume={() => openMatch(vm.id, true)} />
            ))}
            {home.resumable.length > MAX_CONTINUE ? (
              <Button label="See all live matches" variant="tertiary" size="sm" onPress={seeAllLive} testID="home-btn-all-live" />
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
        {tournaments.length > 0 ? (
          <View testID="home-tournaments">
            <SectionHeader title="Tournaments" action={{ label: 'See all', onPress: () => router.push('/tournaments'), testID: 'home-btn-all-tournaments' }} />
            {tournaments.map((vm) => (
              <TournamentRow key={vm.id} vm={vm} onPress={() => openTournament(vm.id, vm.inSetup)} testID={`home-tournament-${vm.id}`} />
            ))}
          </View>
        ) : null}
        {firstRun ? (
          <View style={styles.firstRun} testID="home-first-run">
            <Text variant="title2">Score your first match</Text>
            <Text variant="body" tone="secondary">
              Set the overs, pick two teams and start. Every ball is saved on this phone as you score. No account or internet needed.
            </Text>
            <Text variant="headline" style={styles.gap}>
              Running a competition?
            </Text>
            <View style={styles.link}>
              <Button label="Create a tournament" icon="trophy" variant="tertiary" onPress={createTournament} testID="home-btn-create-tournament" />
            </View>
          </View>
        ) : null}
        <View style={styles.fabSpace} />
        <ResumePromptSheet visible={promptItems.length > 0 && discardId === null} items={promptItems} onResume={resume} onSaveExit={saveExit} onDiscard={setDiscardId} />
        <Dialog
          visible={discardId !== null}
          destructive
          title="Discard this match?"
          message="All recorded balls will be deleted. This can't be undone."
          confirm={{ label: 'Discard match', onPress: () => void discard(), testID: 'home-discard-confirm' }}
          cancel={{ label: 'Cancel', onPress: () => setDiscardId(null), testID: 'home-discard-cancel' }}
          onRequestClose={() => setDiscardId(null)}
        />
      </Screen>
      <NewMatchButton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  firstRun: { paddingHorizontal: space.md, paddingTop: space.xl, gap: space.xs },
  gap: { marginTop: space.lg },
  link: { alignItems: 'flex-start', paddingHorizontal: space.xs, paddingTop: space.sm },
  fabSpace: { height: FAB_HEIGHT + space.sm },
});

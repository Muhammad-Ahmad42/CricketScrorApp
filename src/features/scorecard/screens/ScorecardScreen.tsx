import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, ChoiceSheet, Dialog, IconButton, Inset, Screen, Tabs, Text, space, type SheetChoice } from '@/ui';
import { useExportStore, useHomeStore, useLiveMatchStore, useMatchHistoryStore, useSettingsStore, useTeamLibraryStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { ReasonDialog } from '@/features/scoring/components/common/ReasonDialog';
import { undoLast } from '@/features/scoring/hooks/actions';
import { leaveMatch, MatchGate } from '@/features/scoring/screens/MatchGate';
import { matchHref } from '@/features/scoring/screens/ScoringScreen';
import { InningsCard } from '../components/InningsCard';
import { ResultBanner } from '../components/ResultBanner';
import { shareMatchBackup, shareScorecardPdf } from '../hooks/share';
import { selectScorecardHeader } from '../selectors/header';
import { selectInningsCards } from '../selectors/innings';

type Overlay = 'share' | 'menu' | 'reopen' | 'reopen_reason' | 'delete' | null;

function ScorecardBody() {
  const live = useLiveMatchStore((s) => s.live);
  const venues = useTeamLibraryStore((s) => s.venues);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const exporting = useExportStore((s) => s.status === 'saving' || s.status === 'loading');
  const [chosen, setChosen] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const needsVenues = (live?.match.venueId ?? null) !== null && venues.length === 0;
  useEffect(() => {
    if (needsVenues) {
      void useTeamLibraryStore.getState().load();
    }
  }, [needsVenues]);
  if (live === null) {
    return null;
  }
  const matchId = live.match.id;
  const header = selectScorecardHeader(live, venues);
  const cards = selectInningsCards(live.setup, live.state, dotStyle);
  const selected = cards.find((card) => `${card.index}` === chosen) ?? cards[cards.length - 1];
  const close = () => setOverlay(null);
  const reopen = async (reason?: string) => {
    if (overlay !== 'reopen' && overlay !== 'reopen_reason') {
      return;
    }
    setOverlay(null);
    const outcome = await undoLast(reason);
    if (outcome === 'done') {
      router.replace(matchHref(matchId, 'score'));
    } else if (outcome === 'needs_reason') {
      setOverlay('reopen_reason');
    }
  };
  const remove = async () => {
    if (overlay !== 'delete') {
      return;
    }
    setOverlay(null);
    const ok = await useMatchHistoryStore.getState().remove(matchId);
    if (ok) {
      void useHomeStore.getState().load();
      useToastStore.getState().show({ kind: 'success', message: 'Match deleted', action: null });
      router.replace('/history');
    } else {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't delete the match. Nothing was changed.", action: null });
    }
  };
  const menu: SheetChoice[] = [
    {
      key: 'manage',
      title: 'Match settings',
      icon: 'settings',
      kind: 'navigate',
      onPress: () => {
        close();
        router.push(matchHref(matchId, 'manage'));
      },
    },
  ];
  if (header.isLive) {
    menu.unshift({
      key: 'score',
      title: 'Continue scoring',
      icon: 'play',
      kind: 'navigate',
      onPress: () => {
        close();
        router.push(matchHref(matchId, 'score'));
      },
    });
  }
  if (header.canReopen) {
    menu.push({
      key: 'reopen',
      title: 'Reopen match',
      icon: 'undo-2',
      kind: 'action',
      onPress: () => setOverlay(header.tournamentId === null ? 'reopen' : 'reopen_reason'),
    });
  }
  if (header.canDelete && !header.isLive) {
    menu.push({ key: 'delete', title: 'Delete match', icon: 'trash-2', kind: 'action', destructive: true, onPress: () => setOverlay('delete') });
  }

  return (
    <Screen
      testID="screen-scorecard"
      header={
        <View>
          <TopBar
            title="Scorecard"
            onBack={leaveMatch}
            trailing={
              <View style={styles.trailing}>
                <Button label="Share" icon="share" variant="secondary" size="sm" loading={exporting} onPress={() => setOverlay('share')} testID="scorecard-btn-share" />
                <IconButton icon="ellipsis" accessibilityLabel="More options" onPress={() => setOverlay('menu')} testID="scorecard-btn-menu" />
              </View>
            }
          />
          {cards.length > 1 ? (
            <Tabs
              tabs={cards.map((card) => ({ key: `${card.index}`, label: card.tabLabel, accessibilityLabel: card.tabAccessibilityLabel, testID: `scorecard-tab-${card.index}` }))}
              selectedKey={`${selected.index}`}
              onSelect={setChosen}
              accessibilityLabel="Innings"
              testID="scorecard-tabs"
            />
          ) : null}
        </View>
      }
    >
      <ResultBanner
        vm={header}
        onTournament={() => {
          if (header.tournamentId !== null) {
            router.push({ pathname: '/tournament/[tournamentId]', params: { tournamentId: header.tournamentId } });
          }
        }}
      />
      {cards.length === 0 ? (
        <Inset top="md">
          <Text variant="body" tone="secondary" testID="scorecard-empty">
            No balls scored yet
          </Text>
        </Inset>
      ) : null}
      {selected ? (
        <InningsCard
          vm={selected}
          onOverPress={(over) =>
            router.push({ pathname: '/match/[matchId]/balls', params: { matchId, innings: `${selected.index}`, over: over.overNumber } })
          }
        />
      ) : null}
      <Inset top="md" bottom="md" direction="row" gap="xs">
        <View style={styles.flex}>
          <Button label="Ball by ball" variant="secondary" fullWidth onPress={() => router.push(matchHref(matchId, 'balls'))} testID="scorecard-btn-balls" />
        </View>
        <View style={styles.flex}>
          <Button label="Analytics" variant="secondary" fullWidth onPress={() => router.push(matchHref(matchId, 'analytics'))} testID="scorecard-btn-analytics" />
        </View>
      </Inset>
      <ChoiceSheet
        visible={overlay === 'share'}
        title="Share"
        onClose={close}
        testID="sheet-share"
        choices={[
          {
            key: 'pdf',
            title: 'PDF scorecard',
            icon: 'file-text',
            kind: 'action',
            onPress: () => {
              close();
              void shareScorecardPdf(matchId);
            },
          },
          {
            key: 'backup',
            title: 'Backup file',
            subtitle: 'Import on another phone',
            icon: 'hard-drive-download',
            kind: 'action',
            onPress: () => {
              close();
              void shareMatchBackup(matchId);
            },
          },
        ]}
      />
      <ChoiceSheet visible={overlay === 'menu'} title="Match" choices={menu} onClose={close} testID="sheet-scorecard-menu" />
      <Dialog
        visible={overlay === 'reopen'}
        title="Reopen this match?"
        message="The result will be removed until you confirm it again."
        confirm={{ label: 'Reopen match', onPress: () => void reopen(), testID: 'scorecard-reopen-confirm' }}
        cancel={{ label: 'Cancel', onPress: close }}
        onRequestClose={close}
      />
      <ReasonDialog
        visible={overlay === 'reopen_reason'}
        title="Reopen this tournament match?"
        message="Standings revert until the result is confirmed again."
        confirmLabel="Reopen match"
        onConfirm={(reason) => void reopen(reason)}
        onCancel={close}
      />
      <Dialog
        visible={overlay === 'delete'}
        destructive
        title={`Delete ${live.match.title}?`}
        message="This can't be undone."
        confirm={{ label: 'Delete match', onPress: () => void remove(), testID: 'scorecard-delete-confirm' }}
        cancel={{ label: 'Cancel', onPress: close }}
        onRequestClose={close}
      />
    </Screen>
  );
}

export function ScorecardScreen() {
  return (
    <MatchGate title="Scorecard">
      <ScorecardBody />
    </MatchGate>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  flex: { flex: 1 },
});

import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Screen, Tabs, useScreenList } from '@/ui';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { leaveMatch, MatchGate } from '@/features/scoring/screens/MatchGate';
import { formatOvers, formatScore } from '@/domain/scoring/format';
import { teamShortName } from '@/features/scoring/selectors/names';
import { OverGroup } from '../components/OverGroup';
import { selectBallLog, type OverGroupVM } from '../selectors/ballLog';

export interface BallLogScreenProps {
  readonly initialInnings?: number | null;
}

interface BallListProps {
  readonly groups: readonly OverGroupVM[];
  readonly onBall: (seq: number) => void;
}

function BallList({ groups, onBall }: BallListProps) {
  const list = useScreenList();
  return (
    <FlatList
      data={groups}
      keyExtractor={(group) => group.key}
      renderItem={({ item }) => <OverGroup group={item} onBall={onBall} />}
      contentContainerStyle={list.contentInset}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      ListEmptyComponent={<EmptyState title="No balls yet" body="Deliveries appear here as they are scored." testID="balls-empty" />}
      testID="balls-list"
    />
  );
}

function BallLogBody({ initialInnings }: BallLogScreenProps) {
  const live = useLiveMatchStore((s) => s.live);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const [chosen, setChosen] = useState<number | null>(initialInnings ?? null);
  if (live === null) {
    return null;
  }
  const allInnings = live.state.innings;
  const innings = allInnings.find((entry) => entry.index === chosen) ?? allInnings[allInnings.length - 1];
  const groups = innings === undefined ? [] : selectBallLog(live, innings, dotStyle);
  const matchId = live.match.id;
  const bpo = live.setup.rules.ballsPerOver;
  const header = (
    <View>
      <TopBar title="Ball by ball" onBack={leaveMatch} />
      {allInnings.length > 1 ? (
        <Tabs
          tabs={allInnings.map((entry) => ({
            key: `${entry.index}`,
            label: `${teamShortName(live.setup, entry.battingTeamId)} ${formatScore(entry.runs, entry.wickets)} (${formatOvers(entry.legalBalls, bpo)})`,
            testID: `balls-tab-${entry.index}`,
          }))}
          selectedKey={`${innings?.index ?? 0}`}
          onSelect={(key) => setChosen(Number(key))}
          accessibilityLabel="Innings"
        />
      ) : null}
    </View>
  );
  return (
    <Screen testID="screen-balls" scroll={false} header={header}>
      <BallList groups={groups} onBall={(seq) => router.push({ pathname: '/match/[matchId]/edit/[seq]', params: { matchId, seq: `${seq}` } })} />
    </Screen>
  );
}

export function BallLogScreen(props: BallLogScreenProps) {
  return (
    <MatchGate title="Ball by ball">
      <BallLogBody {...props} />
    </MatchGate>
  );
}

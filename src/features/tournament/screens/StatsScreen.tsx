import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId, TournamentStats } from '@/domain/types';
import { Button, COLUMN_WIDTH, ErrorState, ListRow, SegmentedControl, Separator, Skeleton, Table, Tabs, Text, space, type TableColumn } from '@/ui';
import { useTournamentStore } from '@/stores';
import { usePlayerNames } from '../hooks/usePlayerNames';
import { routes } from '../routes';
import type { TournamentIndex } from '../selectors/names';
import {
  battingRows,
  bowlingRows,
  recordsVM,
  teamStatsRows,
  totalsVM,
  type BattingRowVM,
  type BattingSort,
  type BowlingRowVM,
  type BowlingSort,
  type TeamStatsRowVM,
} from '../selectors/stats';
import { TournamentContainer } from './TournamentContainer';

export interface StatsScreenProps {
  readonly tournamentId: TournamentId;
}

type Tab = 'records' | 'batting' | 'bowling' | 'teams';

const PAGE = 50;

const BATTING_COLUMNS: readonly TableColumn<BattingRowVM>[] = [
  { key: 'name', header: 'Player', kind: 'name', value: (row) => row.name, subtext: (row) => row.team },
  { key: 'm', header: 'M', kind: 'numeric', value: (row) => row.matches },
  { key: 'r', header: 'R', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.runs },
  { key: 'avg', header: 'Avg', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.average },
  { key: 'sr', header: 'SR', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.strikeRate },
  { key: '4s', header: '4s', kind: 'numeric', value: (row) => row.fours },
  { key: '6s', header: '6s', kind: 'numeric', value: (row) => row.sixes },
  { key: 'hs', header: 'HS', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.best },
];

const BOWLING_COLUMNS: readonly TableColumn<BowlingRowVM>[] = [
  { key: 'name', header: 'Player', kind: 'name', value: (row) => row.name, subtext: (row) => row.team },
  { key: 'm', header: 'M', kind: 'numeric', value: (row) => row.matches },
  { key: 'o', header: 'O', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.overs },
  { key: 'w', header: 'W', kind: 'numeric', value: (row) => row.wickets },
  { key: 'r', header: 'R', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.runs },
  { key: 'econ', header: 'Econ', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.economy },
  { key: 'bb', header: 'Best', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.best },
];

const TEAM_COLUMNS: readonly TableColumn<TeamStatsRowVM>[] = [
  { key: 'team', header: 'Team', kind: 'name', value: (row) => row.team },
  { key: 'm', header: 'M', kind: 'numeric', value: (row) => row.matches },
  { key: 'w', header: 'W', kind: 'numeric', value: (row) => row.wins },
  { key: 'l', header: 'L', kind: 'numeric', value: (row) => row.losses },
  { key: 'pts', header: 'Pts', kind: 'numeric', value: (row) => row.points },
  { key: 'nrr', header: 'NRR', kind: 'numeric', width: COLUMN_WIDTH.nrr, value: (row) => row.nrr },
  { key: 'rs', header: 'Runs for', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.runsScored },
  { key: 'rc', header: 'Runs against', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.runsConceded },
];

const STATS_TABS: readonly { readonly key: Tab; readonly label: string; readonly testID: string }[] = [
  { key: 'records', label: 'Records', testID: 'stats-tab-records' },
  { key: 'batting', label: 'Batting', testID: 'stats-tab-batting' },
  { key: 'bowling', label: 'Bowling', testID: 'stats-tab-bowling' },
  { key: 'teams', label: 'Teams', testID: 'stats-tab-teams' },
];

interface StatsBodyProps {
  readonly index: TournamentIndex;
  readonly tab: Tab;
  readonly limit: number;
  readonly onLimit: (limit: number) => void;
}

function StatsBody({ index, tab, limit, onLimit }: StatsBodyProps) {
  const router = useRouter();
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [battingSort, setBattingSort] = useState<BattingSort>('runs');
  const [bowlingSort, setBowlingSort] = useState<BowlingSort>('wickets');
  const [attempt, setAttempt] = useState(0);
  const version = index.snapshot.version;
  const names = usePlayerNames(stats ? [...new Set(stats.players.map((player) => player.teamId))] : []);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void useTournamentStore
      .getState()
      .loadStats()
      .then((loaded) => {
        if (!active) {
          return;
        }
        if (loaded === null) {
          setFailed(true);
        } else {
          setStats(loaded);
        }
      });
    return () => {
      active = false;
    };
  }, [version, attempt]);

  if (failed && stats === null) {
    return <ErrorState title="Couldn't load the statistics" onRetry={() => setAttempt(attempt + 1)} testID="stats-error" />;
  }
  if (stats === null) {
    return <Skeleton rows={6} testID="stats-loading" />;
  }
  const totals = totalsVM(stats);
  const ballsPerOver = index.snapshot.rules.defaultMatchRules.ballsPerOver;
  const batting = battingRows(index, stats.players, names, battingSort);
  const bowling = bowlingRows(index, stats.players, names, bowlingSort, ballsPerOver);

  return (
    <View>
      {tab === 'records' ? (
        <View>
          <ListRow title="Matches" trailing={{ kind: 'custom', node: <Text variant="tableNumeric" testID="stats-text-total-matches">{totals.matches}</Text> }} compact />
          <ListRow title="Runs · Wickets" trailing={{ kind: 'value', text: totals.runsWickets }} compact />
          <ListRow title="Fours · Sixes" trailing={{ kind: 'value', text: totals.boundaries }} compact />
          <Separator />
          {recordsVM(index, stats, names).map((record) => (
            <ListRow
              key={record.key}
              title={`${record.title} · ${record.value}`}
              subtitle={record.detail}
              trailing={record.matchId ? { kind: 'chevron' } : undefined}
              onPress={record.matchId ? () => router.push(routes.matchScorecard(record.matchId ?? '')) : undefined}
              testID={`stats-row-record-${record.key}`}
            />
          ))}
        </View>
      ) : null}
      {tab === 'batting' ? (
        <View style={styles.tab}>
          <View style={styles.padded}>
            <SegmentedControl
              options={[
                { value: 'runs', label: 'Runs' },
                { value: 'average', label: 'Average' },
                { value: 'strike_rate', label: 'Strike rate' },
              ]}
              value={battingSort}
              onChange={setBattingSort}
              accessibilityLabel="Sort batting by"
            />
          </View>
          <Table
            columns={BATTING_COLUMNS}
            rows={batting.slice(0, limit)}
            rowKey={(row) => row.key}
            rowAccessibilityLabel={(row, position) => `${position + 1}, ${row.name}, ${row.team}, ${row.runs} runs, average ${row.average}, strike rate ${row.strikeRate}`}
            emptyText="No batting yet"
            scrollable
            testID="stats-table-batting"
          />
          {batting.length > limit ? <Button label="Show more" variant="tertiary" onPress={() => onLimit(limit + PAGE)} testID="stats-btn-more" /> : null}
        </View>
      ) : null}
      {tab === 'bowling' ? (
        <View style={styles.tab}>
          <View style={styles.padded}>
            <SegmentedControl
              options={[
                { value: 'wickets', label: 'Wickets' },
                { value: 'economy', label: 'Economy' },
              ]}
              value={bowlingSort}
              onChange={setBowlingSort}
              accessibilityLabel="Sort bowling by"
            />
          </View>
          <Table
            columns={BOWLING_COLUMNS}
            rows={bowling.slice(0, limit)}
            rowKey={(row) => row.key}
            rowAccessibilityLabel={(row, position) => `${position + 1}, ${row.name}, ${row.team}, ${row.wickets} wickets for ${row.runs}, economy ${row.economy}`}
            emptyText="No bowling yet"
            scrollable
            testID="stats-table-bowling"
          />
          {bowling.length > limit ? <Button label="Show more" variant="tertiary" onPress={() => onLimit(limit + PAGE)} testID="stats-btn-more" /> : null}
        </View>
      ) : null}
      {tab === 'teams' ? (
        <Table
          columns={TEAM_COLUMNS}
          rows={teamStatsRows(index, stats.teams)}
          rowKey={(row) => row.key}
          rowAccessibilityLabel={(row) => `${row.team}, ${row.matches} matches, ${row.wins} won, ${row.points} points, net run rate ${row.nrr}`}
          scrollable
          testID="stats-table-teams"
        />
      ) : null}
    </View>
  );
}

export function StatsScreen({ tournamentId }: StatsScreenProps) {
  const [tab, setTab] = useState<Tab>('records');
  const [limit, setLimit] = useState(PAGE);
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-tournament-stats"
      title="Statistics"
      controls={() => (
        <Tabs
          tabs={STATS_TABS}
          selectedKey={tab}
          onSelect={(next) => {
            setTab(next);
            setLimit(PAGE);
          }}
          accessibilityLabel="Statistics"
        />
      )}
    >
      {(index) => <StatsBody index={index} tab={tab} limit={limit} onLimit={setLimit} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  tab: { gap: space.sm, paddingTop: space.sm },
  padded: { paddingHorizontal: space.md },
});

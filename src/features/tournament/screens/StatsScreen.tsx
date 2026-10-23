import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId, TournamentStats } from '@/domain/types';
import {
  Button,
  COLUMN_WIDTH,
  ErrorState,
  Inset,
  PressableRow,
  SectionHeader,
  SegmentedControl,
  Separator,
  Skeleton,
  Table,
  Tabs,
  Text,
  space,
  type TableColumn,
} from '@/ui';
import { useTournamentStore } from '@/stores';
import { plural } from '@/features/shared';
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
  type RecordVM,
  type TeamStatsRowVM,
} from '../selectors/stats';
import { TournamentContainer } from './TournamentContainer';

export interface StatsScreenProps {
  readonly tournamentId: TournamentId;
}

type Tab = 'records' | 'batting' | 'bowling' | 'teams';

const PAGE = 50;

const DOWN = ' ▼';
const UP = ' ▲';

export function battingColumns(sort: BattingSort): readonly TableColumn<BattingRowVM>[] {
  const mark = (header: string, key: BattingSort) => (sort === key ? `${header}${DOWN}` : header);
  return [
    { key: 'name', header: 'Player', kind: 'name', value: (row) => row.name, subtext: (row) => row.team },
    { key: 'r', header: mark('R', 'runs'), kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.runs },
    { key: 'avg', header: mark('Avg', 'average'), kind: 'numeric', width: COLUMN_WIDTH.nrr, value: (row) => row.average },
    { key: 'sr', header: mark('SR', 'strike_rate'), kind: 'numeric', width: COLUMN_WIDTH.nrr, value: (row) => row.strikeRate },
    { key: 'hs', header: 'HS', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.best },
    { key: 'no', header: 'NO', kind: 'numeric', value: (row) => row.notOuts },
    { key: 'm', header: 'M', kind: 'numeric', value: (row) => row.matches },
    { key: '4s', header: '4s', kind: 'numeric', value: (row) => row.fours },
    { key: '6s', header: '6s', kind: 'numeric', value: (row) => row.sixes },
  ];
}

export function bowlingColumns(sort: BowlingSort): readonly TableColumn<BowlingRowVM>[] {
  return [
    { key: 'name', header: 'Player', kind: 'name', value: (row) => row.name, subtext: (row) => row.team },
    { key: 'w', header: sort === 'wickets' ? `W${DOWN}` : 'W', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.wickets },
    { key: 'econ', header: sort === 'economy' ? `Econ${UP}` : 'Econ', kind: 'numeric', width: COLUMN_WIDTH.nrr, value: (row) => row.economy },
    { key: 'bb', header: 'Best', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.best },
    { key: 'o', header: 'O', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.overs },
    { key: 'r', header: 'R', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.runs },
    { key: 'm', header: 'M', kind: 'numeric', value: (row) => row.matches },
  ];
}

function TotalRow({ title, value, testID }: { readonly title: string; readonly value: string; readonly testID?: string }) {
  return (
    <View style={styles.total} accessible accessibilityRole="text" accessibilityLabel={`${title}: ${value}`}>
      <Text variant="subhead" tone="secondary" style={styles.flex}>
        {title}
      </Text>
      <Text variant="figure" testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function RecordRow({ record, onPress }: { readonly record: RecordVM; readonly onPress?: () => void }) {
  return (
    <PressableRow testID={`stats-row-record-${record.key}`} accessibilityLabel={record.accessibilityLabel} onPress={onPress} chevron>
        <View style={styles.flex}>
          <Text variant="label" tone="secondary">
            {record.title}
          </Text>
          {record.holder ? (
            <Text variant="bodyStrong" testID={`stats-text-holder-${record.key}`}>
              {record.holder}
            </Text>
          ) : null}
          <Text variant="footnote" tone="secondary">
            {record.detail}
          </Text>
        </View>
        <Text variant="figure" align="right" testID={`stats-text-value-${record.key}`}>
          {record.value}
        </Text>
    </PressableRow>
  );
}

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
          <Inset top="sm" bottom="sm" gap="xxs">
            <TotalRow title="Matches played" value={totals.played} testID="stats-text-total-matches" />
            <TotalRow title="Runs" value={totals.runs} />
            <TotalRow title="Wickets" value={totals.wickets} />
            <TotalRow title="Fours" value={totals.fours} />
            <TotalRow title="Sixes" value={totals.sixes} />
          </Inset>
          <Separator />
          <SectionHeader title="Records" />
          {recordsVM(index, stats, names).map((record) => (
            <RecordRow
              key={record.key}
              record={record}
              onPress={record.matchId ? () => router.push(routes.matchScorecard(record.matchId ?? '')) : undefined}
            />
          ))}
        </View>
      ) : null}
      {tab === 'batting' ? (
        <View style={styles.tab}>
          <Inset>
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
          </Inset>
          <Table
            columns={battingColumns(battingSort)}
            rows={batting.slice(0, limit)}
            rowKey={(row) => row.key}
            rowAccessibilityLabel={(row, position) =>
              `${position + 1}, ${row.name}, ${row.team}, ${plural(row.runs, 'run')}, average ${row.average}, strike rate ${row.strikeRate}, highest ${row.best}, not out ${row.notOuts}`
            }
            emptyText="No batting yet"
            scrollable
            testID="stats-table-batting"
          />
          {batting.length > limit ? <Button label="Show more" variant="tertiary" onPress={() => onLimit(limit + PAGE)} testID="stats-btn-more" /> : null}
        </View>
      ) : null}
      {tab === 'bowling' ? (
        <View style={styles.tab}>
          <Inset>
            <SegmentedControl
              options={[
                { value: 'wickets', label: 'Wickets' },
                { value: 'economy', label: 'Economy' },
              ]}
              value={bowlingSort}
              onChange={setBowlingSort}
              accessibilityLabel="Sort bowling by"
            />
          </Inset>
          <Table
            columns={bowlingColumns(bowlingSort)}
            rows={bowling.slice(0, limit)}
            rowKey={(row) => row.key}
            rowAccessibilityLabel={(row, position) => `${position + 1}, ${row.name}, ${row.team}, ${plural(row.wickets, 'wicket')} for ${row.runs}, economy ${row.economy}`}
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
          rowAccessibilityLabel={(row) => `${row.team}, ${plural(row.matches, 'match', 'matches')}, ${row.wins} won, ${plural(row.points, 'point')}, net run rate ${row.nrr}`}
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
  flex: { flex: 1, minWidth: 0 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, minHeight: 32 },
});

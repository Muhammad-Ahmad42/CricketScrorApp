import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import {
  Button,
  DEFAULT_ERROR_BODY,
  ChoiceSheet,
  Dialog,
  EmptyState,
  ErrorState,
  GlassSurface,
  STICKY_GLASS_SCROLLER,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Text,
  space,
  useGutter,
  useScreenList,
  type SheetChoice,
} from '@/ui';
import type { MatchListQuery } from '@/domain/types';
import { useMatchHistoryStore, useTeamLibraryStore, useToastStore, useTournamentListStore } from '@/stores';
import { shareScorecardPdf } from '@/features/scorecard/hooks/share';
import { TournamentRow } from '@/features/home/components/TournamentRow';
import { openMatch, openTournament } from '@/features/home/navigation';
import { isTournamentFinished, selectTournamentRow, type TournamentRowVM } from '@/features/home/selectors/tournaments';
import { startNewMatch } from '@/features/match-setup/actions';
import { errorHeadline } from '@/features/scoring/selectors/scannable';
import { MatchCard } from '../components/MatchCard';
import { SearchField } from '../components/SearchField';
import type { MatchCardVM } from '../selectors/matchCard';
import {
  hasFilters,
  historyRows,
  SORT_OPTIONS,
  STATUS_FILTERS,
  statusFilterOf,
  withSearch,
  withSort,
  withStatus,
  withTeam,
  type HistoryRow,
} from '../selectors/query';

export const SEARCH_DEBOUNCE_MS = 250;

type Segment = 'matches' | 'tournaments';
type Picker = 'status' | 'team' | 'sort' | null;

type ListItem =
  | { readonly type: 'title'; readonly key: string }
  | { readonly type: 'bar'; readonly key: string }
  | { readonly type: 'state'; readonly key: string; readonly node: ReactElement }
  | { readonly type: 'tournament'; readonly key: string; readonly vm: TournamentRowVM }
  | HistoryRow;

interface MatchFilters {
  readonly search: string;
  readonly setSearch: (text: string) => void;
  readonly picker: Picker;
  readonly setPicker: (picker: Picker) => void;
}

function useMatchFilters(): MatchFilters {
  const [search, setSearch] = useState(() => useMatchHistoryStore.getState().query.search ?? '');
  const [picker, setPicker] = useState<Picker>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      void useMatchHistoryStore.getState().load(withSearch(useMatchHistoryStore.getState().query, search));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  return { search, setSearch, picker, setPicker };
}

function FilterChips({ filters }: { readonly filters: MatchFilters }) {
  const query = useMatchHistoryStore((s) => s.query);
  const teams = useTeamLibraryStore((s) => s.teams);
  const statusFilter = statusFilterOf(query);
  const teamName = teams.find((team) => team.id === query.teamId)?.name ?? 'Any';
  const sortLabel = SORT_OPTIONS.find((option) => option.key === (query.sort ?? 'recent'))?.label ?? 'Recent';
  const statusLabel = STATUS_FILTERS.find((entry) => entry.key === statusFilter)?.label ?? 'All';
  return (
    <View style={styles.filters}>
      <Button
        label={`Status: ${statusLabel}`}
        variant="tertiary"
        size="sm"
        icon="chevron-down"
        accessibilityHint="Opens the status filter"
        onPress={() => filters.setPicker('status')}
        testID="history-filter-status"
      />
      <Button label={`Team: ${teamName}`} variant="tertiary" size="sm" icon="chevron-down" accessibilityHint="Opens the team filter" onPress={() => filters.setPicker('team')} testID="history-filter-team" />
      <Button
        label={sortLabel}
        accessibilityLabel={`Sort: ${sortLabel}`}
        variant="tertiary"
        size="sm"
        icon="chevron-down"
        accessibilityHint="Opens the sort order"
        onPress={() => filters.setPicker('sort')}
        testID="history-filter-sort"
      />
    </View>
  );
}

interface HistoryBarProps {
  readonly segment: Segment;
  readonly onSegment: (segment: Segment) => void;
  readonly stuck: boolean;
  readonly filters: MatchFilters;
}

function HistoryBar({ segment, onSegment, stuck, filters }: HistoryBarProps) {
  const gutter = useGutter();
  return (
    <GlassSurface level="bar" rim="bottom" active={stuck} style={[styles.bar, { paddingHorizontal: gutter }]} testID="history-bar">
      <SegmentedControl
        options={[
          { value: 'matches', label: 'Matches', testID: 'history-segment-matches' },
          { value: 'tournaments', label: 'Tournaments', testID: 'history-segment-tournaments' },
        ]}
        value={segment}
        onChange={onSegment}
        accessibilityLabel="History"
      />
      {segment === 'matches' ? <FilterChips filters={filters} /> : null}
    </GlassSurface>
  );
}

function TitleBlock({ segment, filters, onLayout }: { readonly segment: Segment; readonly filters: MatchFilters; readonly onLayout: (event: LayoutChangeEvent) => void }) {
  const gutter = useGutter();
  return (
    <View style={[styles.title, { paddingHorizontal: gutter }]} onLayout={onLayout} testID="history-title">
      <Text variant="title1" accessibilityRole="header">
        History
      </Text>
      {segment === 'matches' ? (
        <SearchField value={filters.search} onChangeText={filters.setSearch} accessibilityLabel="Search matches" placeholder="Search teams or titles" testID="history-search" />
      ) : null}
    </View>
  );
}

interface HistoryListProps {
  readonly segment: Segment;
  readonly onSegment: (segment: Segment) => void;
  readonly filters: MatchFilters;
  readonly body: readonly ListItem[];
  readonly onEndReached?: () => void;
  readonly onRow: (item: ListItem) => ReactElement | null;
  readonly testID: string;
}

function HistoryList({ segment, onSegment, filters, body, onEndReached, onRow, testID }: HistoryListProps) {
  const list = useScreenList();
  const [titleHeight, setTitleHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = titleHeight > 0 && event.nativeEvent.contentOffset.y >= titleHeight - 1;
    if (next !== stuck) {
      setStuck(next);
    }
    list.onScroll(event);
  };
  const data: readonly ListItem[] = [{ type: 'title', key: 'title' }, { type: 'bar', key: 'bar' }, ...body];
  const renderItem = ({ item }: { readonly item: ListItem }) => {
    if (item.type === 'title') {
      return <TitleBlock segment={segment} filters={filters} onLayout={(event) => setTitleHeight(Math.round(event.nativeEvent.layout.height))} />;
    }
    if (item.type === 'bar') {
      return <HistoryBar segment={segment} onSegment={onSegment} stuck={stuck} filters={filters} />;
    }
    if (item.type === 'state') {
      return item.node;
    }
    return onRow(item);
  };
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      stickyHeaderIndices={[1]}
      style={STICKY_GLASS_SCROLLER}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      contentContainerStyle={list.contentInset}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      onScroll={onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    />
  );
}

interface ViewProps {
  readonly segment: Segment;
  readonly onSegment: (segment: Segment) => void;
  readonly filters: MatchFilters;
}

function MatchesView({ segment, onSegment, filters }: ViewProps) {
  const { status, items, query, error } = useMatchHistoryStore(useShallow((s) => ({ status: s.status, items: s.items, query: s.query, error: s.error })));
  const teams = useTeamLibraryStore((s) => s.teams);
  const { setSearch, picker, setPicker } = filters;
  const [menuFor, setMenuFor] = useState<MatchCardVM | null>(null);
  const [deleting, setDeleting] = useState<MatchCardVM | null>(null);

  useFocusEffect(
    useCallback(() => {
      void useMatchHistoryStore.getState().load(useMatchHistoryStore.getState().query);
      void useTeamLibraryStore.getState().load();
    }, []),
  );

  const reload = (next: MatchListQuery) => {
    setPicker(null);
    void useMatchHistoryStore.getState().load(next);
  };
  const rows = historyRows(items);
  const filtered = hasFilters(query);
  const statusFilter = statusFilterOf(query);
  const sort = query.sort ?? 'recent';

  const remove = async () => {
    const target = deleting;
    setDeleting(null);
    if (target === null) {
      return;
    }
    const ok = await useMatchHistoryStore.getState().remove(target.id);
    useToastStore.getState().show(
      ok ? { kind: 'success', message: 'Match deleted', action: null } : { kind: 'error', message: "Couldn't delete the match. Nothing was changed.", action: null },
    );
  };
  const menuChoices = (vm: MatchCardVM): SheetChoice[] => {
    const close = () => setMenuFor(null);
    const choices: SheetChoice[] = [
      {
        key: 'view',
        title: vm.inPlay ? 'Continue scoring' : 'View scorecard',
        icon: 'file-text',
        kind: 'navigate',
        onPress: () => {
          close();
          openMatch(vm.id, vm.inPlay);
        },
      },
      {
        key: 'pdf',
        title: 'Export PDF',
        icon: 'share',
        kind: 'action',
        onPress: () => {
          close();
          void shareScorecardPdf(vm.id);
        },
      },
    ];
    if (vm.tournamentId !== null) {
      choices.push({ key: 'delete', title: 'Delete', subtitle: 'Tournament match', icon: 'trash-2', kind: 'action', disabled: true, onPress: close });
    } else {
      choices.push({
        key: 'delete',
        title: 'Delete match',
        icon: 'trash-2',
        kind: 'action',
        destructive: true,
        onPress: () => {
          close();
          setDeleting(vm);
        },
      });
    }
    return choices;
  };

  const empty =
    status === 'loading' ? (
      <Skeleton rows={4} testID="history-loading" />
    ) : status === 'error' ? (
      <ErrorState title="Couldn't load your matches" body={error === null ? undefined : errorHeadline(error, DEFAULT_ERROR_BODY)} onRetry={() => reload(query)} testID="history-error" />
    ) : filtered ? (
      <EmptyState
        title="Nothing matches these filters"
        icon="search"
        action={{
          label: 'Clear filters',
          onPress: () => {
            setSearch('');
            reload({ sort: query.sort ?? 'recent' });
          },
          testID: 'history-btn-clear',
        }}
        testID="history-empty-filtered"
      />
    ) : (
      <EmptyState title="No matches yet" icon="history" action={{ label: 'New match', onPress: startNewMatch, testID: 'history-btn-new' }} testID="history-empty" />
    );
  const body: readonly ListItem[] = rows.length === 0 ? [{ type: 'state', key: 'empty', node: empty }] : rows;

  return (
    <View style={styles.flex}>
      <HistoryList
        segment={segment}
        onSegment={onSegment}
        filters={filters}
        body={body}
        onEndReached={() => {
          if (items.length > 0) {
            void useMatchHistoryStore.getState().loadMore();
          }
        }}
        onRow={(item) =>
          item.type === 'header' ? (
            <SectionHeader title={item.title} />
          ) : item.type === 'match' ? (
            <MatchCard vm={item.vm} onPress={() => openMatch(item.vm.id, item.vm.inPlay)} onMenu={() => setMenuFor(item.vm)} testID={`history-row-${item.vm.id}`} />
          ) : null
        }
        testID="history-list"
      />
      <ChoiceSheet
        visible={picker === 'status'}
        title="Status"
        onClose={() => setPicker(null)}
        testID="sheet-history-status"
        choices={STATUS_FILTERS.map((entry) => ({ key: entry.key, title: entry.label, kind: 'option', selected: entry.key === statusFilter, onPress: () => reload(withStatus(query, entry.key)) }))}
      />
      <ChoiceSheet
        visible={picker === 'team'}
        title="Team"
        onClose={() => setPicker(null)}
        testID="sheet-history-team"
        choices={[
          { key: 'any', title: 'Any team', kind: 'option', selected: query.teamId === undefined, onPress: () => reload(withTeam(query, null)) },
          ...teams.map((team): SheetChoice => ({ key: team.id, title: team.name, kind: 'option', selected: query.teamId === team.id, onPress: () => reload(withTeam(query, team.id)) })),
        ]}
      />
      <ChoiceSheet
        visible={picker === 'sort'}
        title="Sort"
        onClose={() => setPicker(null)}
        testID="sheet-history-sort"
        choices={SORT_OPTIONS.map((entry) => ({ key: entry.key, title: entry.label, kind: 'option', selected: entry.key === sort, onPress: () => reload(withSort(query, entry.key)) }))}
      />
      {menuFor !== null ? <ChoiceSheet visible title={menuFor.title} choices={menuChoices(menuFor)} onClose={() => setMenuFor(null)} testID="sheet-history-row" /> : null}
      <Dialog
        visible={deleting !== null}
        destructive
        title={`Delete ${deleting?.title ?? 'this match'}?`}
        message="This can't be undone."
        confirm={{ label: 'Delete match', onPress: () => void remove(), testID: 'history-delete-confirm' }}
        cancel={{ label: 'Cancel', onPress: () => setDeleting(null) }}
        onRequestClose={() => setDeleting(null)}
      />
    </View>
  );
}

function TournamentsView({ segment, onSegment, filters }: ViewProps) {
  const items = useTournamentListStore((s) => s.items);
  const status = useTournamentListStore((s) => s.status);
  useFocusEffect(
    useCallback(() => {
      void useTournamentListStore.getState().load();
    }, []),
  );
  const finished = items.filter((item) => isTournamentFinished(item.status)).map(selectTournamentRow);
  const empty =
    status === 'loading' ? (
      <Skeleton rows={3} />
    ) : (
      <EmptyState
        title="No finished tournaments"
        icon="trophy"
        action={{ label: 'See active tournaments', onPress: () => router.push('/tournaments'), testID: 'history-btn-tournaments' }}
        testID="history-tournaments-empty"
      />
    );
  const body: readonly ListItem[] = finished.length === 0 ? [{ type: 'state', key: 'empty', node: empty }] : finished.map((vm) => ({ type: 'tournament', key: vm.id, vm }));
  return (
    <HistoryList
      segment={segment}
      onSegment={onSegment}
      filters={filters}
      body={body}
      onRow={(item) => (item.type === 'tournament' ? <TournamentRow vm={item.vm} onPress={() => openTournament(item.vm.id, false)} testID={`history-tournament-${item.vm.id}`} /> : null)}
      testID="history-tournaments"
    />
  );
}

export function HistoryScreen() {
  const [segment, setSegment] = useState<Segment>('matches');
  const filters = useMatchFilters();
  return (
    <Screen testID="screen-history" scroll={false}>
      {segment === 'matches' ? (
        <MatchesView segment={segment} onSegment={setSegment} filters={filters} />
      ) : (
        <TournamentsView segment={segment} onSegment={setSegment} filters={filters} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  bar: { paddingTop: space.xs, paddingBottom: space.xxs, gap: space.xxs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs, marginLeft: -space.xs },
});

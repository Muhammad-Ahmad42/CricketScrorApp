import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { Button, Dialog, EmptyState, ErrorState, Screen, ScreenHeader, SectionHeader, SegmentedControl, Skeleton, TextField, space, useScreenList } from '@/ui';
import { useMatchHistoryStore, useTeamLibraryStore, useToastStore, useTournamentListStore } from '@/stores';
import { ChoiceSheet, type Choice } from '@/features/scorecard/components/ChoiceSheet';
import { shareScorecardPdf } from '@/features/scorecard/hooks/share';
import { TournamentRow } from '@/features/home/components/TournamentRow';
import { openMatch, openTournament } from '@/features/home/navigation';
import { isTournamentFinished, selectTournamentRow } from '@/features/home/selectors/tournaments';
import { startNewMatch } from '@/features/match-setup/actions';
import { MatchCard } from '../components/MatchCard';
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

function MatchFilterBar({ filters }: { readonly filters: MatchFilters }) {
  const query = useMatchHistoryStore((s) => s.query);
  const teams = useTeamLibraryStore((s) => s.teams);
  const statusFilter = statusFilterOf(query);
  const teamName = teams.find((team) => team.id === query.teamId)?.name ?? 'Any';
  const sortLabel = SORT_OPTIONS.find((option) => option.key === (query.sort ?? 'recent'))?.label ?? 'Recent';
  return (
    <View style={styles.controls}>
      <TextField label="Search" value={filters.search} onChangeText={filters.setSearch} placeholder="Search teams or titles" leadingIcon="search" testID="history-search" />
      <View style={styles.filters}>
        <Button label={`Status: ${STATUS_FILTERS.find((entry) => entry.key === statusFilter)?.label ?? 'All'}`} variant="tertiary" size="sm" icon="chevron-down" onPress={() => filters.setPicker('status')} testID="history-filter-status" />
        <Button label={`Team: ${teamName}`} variant="tertiary" size="sm" icon="chevron-down" onPress={() => filters.setPicker('team')} testID="history-filter-team" />
        <Button label={sortLabel} variant="tertiary" size="sm" icon="chevron-down" onPress={() => filters.setPicker('sort')} testID="history-filter-sort" />
      </View>
    </View>
  );
}

function MatchesView({ filters }: { readonly filters: MatchFilters }) {
  const list = useScreenList();
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

  const reload = (next: typeof query) => {
    setPicker(null);
    void useMatchHistoryStore.getState().load(next);
  };
  const rows = historyRows(items);
  const filtered = hasFilters(query);

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
  const menuChoices = (vm: MatchCardVM): Choice[] => {
    const close = () => setMenuFor(null);
    const choices: Choice[] = [
      {
        key: 'view',
        title: vm.inPlay ? 'Continue scoring' : 'View scorecard',
        icon: 'file-text',
        onPress: () => {
          close();
          openMatch(vm.id, vm.inPlay);
        },
      },
      {
        key: 'pdf',
        title: 'Export PDF',
        icon: 'share',
        onPress: () => {
          close();
          void shareScorecardPdf(vm.id);
        },
      },
    ];
    if (vm.tournamentId !== null) {
      choices.push({ key: 'delete', title: 'Delete', subtitle: 'Part of a tournament: open the fixture to change it', icon: 'trash-2', disabled: true, onPress: close });
    } else {
      choices.push({
        key: 'delete',
        title: 'Delete',
        icon: 'trash-2',
        onPress: () => {
          close();
          setDeleting(vm);
        },
      });
    }
    return choices;
  };

  const renderRow = ({ item }: { readonly item: HistoryRow }) =>
    item.type === 'header' ? (
      <SectionHeader title={item.title} />
    ) : (
      <MatchCard vm={item.vm} onPress={() => openMatch(item.vm.id, item.vm.inPlay)} onMenu={() => setMenuFor(item.vm)} testID={`history-row-${item.vm.id}`} />
    );

  const empty =
    status === 'loading' ? (
      <Skeleton rows={4} testID="history-loading" />
    ) : status === 'error' ? (
      <ErrorState title="Couldn't load your matches" body={error?.message} onRetry={() => reload(query)} testID="history-error" />
    ) : filtered ? (
      <EmptyState
        title="No matches match these filters"
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
      <EmptyState title="No matches yet" body="Matches you score appear here with their scorecards." action={{ label: 'NEW MATCH', onPress: startNewMatch, testID: 'history-btn-new' }} caps testID="history-empty" />
    );

  return (
    <View style={styles.flex}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        onEndReached={() => {
          if (items.length > 0) {
            void useMatchHistoryStore.getState().loadMore();
          }
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={empty}
        contentContainerStyle={list.contentInset}
        scrollIndicatorInsets={list.scrollIndicatorInsets}
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        keyboardShouldPersistTaps="handled"
        testID="history-list"
      />
      <ChoiceSheet
        visible={picker === 'status'}
        title="Status"
        onClose={() => setPicker(null)}
        testID="sheet-history-status"
        choices={STATUS_FILTERS.map((entry) => ({ key: entry.key, title: entry.label, onPress: () => reload(withStatus(query, entry.key)) }))}
      />
      <ChoiceSheet
        visible={picker === 'team'}
        title="Team"
        onClose={() => setPicker(null)}
        testID="sheet-history-team"
        choices={[{ key: 'any', title: 'Any team', onPress: () => reload(withTeam(query, null)) }, ...teams.map((team) => ({ key: team.id, title: team.name, onPress: () => reload(withTeam(query, team.id)) }))]}
      />
      <ChoiceSheet
        visible={picker === 'sort'}
        title="Sort"
        onClose={() => setPicker(null)}
        testID="sheet-history-sort"
        choices={SORT_OPTIONS.map((entry) => ({ key: entry.key, title: entry.label, onPress: () => reload(withSort(query, entry.key)) }))}
      />
      {menuFor !== null ? <ChoiceSheet visible title={menuFor.title} choices={menuChoices(menuFor)} onClose={() => setMenuFor(null)} testID="sheet-history-row" /> : null}
      <Dialog
        visible={deleting !== null}
        destructive
        title={`Delete ${deleting?.title ?? 'this match'}?`}
        message="Its scorecard and all recorded balls will be deleted. This can't be undone."
        confirm={{ label: 'Delete match', onPress: () => void remove(), testID: 'history-delete-confirm' }}
        cancel={{ label: 'Cancel', onPress: () => setDeleting(null) }}
        onRequestClose={() => setDeleting(null)}
      />
    </View>
  );
}

function TournamentsView() {
  const list = useScreenList();
  const items = useTournamentListStore((s) => s.items);
  const status = useTournamentListStore((s) => s.status);
  useFocusEffect(
    useCallback(() => {
      void useTournamentListStore.getState().load();
    }, []),
  );
  const finished = items.filter((item) => isTournamentFinished(item.status)).map(selectTournamentRow);
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={list.contentInset}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      testID="history-tournaments"
    >
      {finished.length === 0 ? (
        status === 'loading' ? (
          <Skeleton rows={3} />
        ) : (
          <EmptyState title="No finished tournaments" body="Completed and archived tournaments appear here with their champions." testID="history-tournaments-empty" />
        )
      ) : (
        finished.map((vm) => <TournamentRow key={vm.id} vm={vm} onPress={() => openTournament(vm.id, false)} testID={`history-tournament-${vm.id}`} />)
      )}
    </ScrollView>
  );
}

export function HistoryScreen() {
  const [segment, setSegment] = useState<Segment>('matches');
  const filters = useMatchFilters();
  const header = (
    <View>
      <ScreenHeader title="History" />
      <View style={styles.segment}>
        <SegmentedControl
          options={[
            { value: 'matches', label: 'Matches', testID: 'history-segment-matches' },
            { value: 'tournaments', label: 'Tournaments', testID: 'history-segment-tournaments' },
          ]}
          value={segment}
          onChange={setSegment}
          accessibilityLabel="History"
        />
      </View>
      {segment === 'matches' ? <MatchFilterBar filters={filters} /> : null}
    </View>
  );
  return (
    <Screen testID="screen-history" scroll={false} header={header}>
      {segment === 'matches' ? <MatchesView filters={filters} /> : <TournamentsView />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segment: { paddingHorizontal: space.md, paddingBottom: space.xs },
  controls: { paddingHorizontal: space.md, paddingBottom: space.xs, gap: space.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs },
});

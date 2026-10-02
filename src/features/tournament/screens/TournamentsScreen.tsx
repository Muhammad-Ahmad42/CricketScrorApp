import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { WithScreenList } from '@/features/shared';
import { Button, EmptyState, ErrorState, Screen, ScreenHeader, SegmentedControl, Skeleton, Text, space } from '@/ui';
import { useTournamentListStore, useTournamentWizardStore } from '@/stores';
import { TournamentRow } from '../components/TournamentRow';
import { showError } from '../hooks/toast';
import { routes } from '../routes';
import { emptyListText, filterTournaments, tournamentRowVM, type TournamentListFilter, type TournamentRowVM } from '../selectors/list';

const FILTERS: readonly { readonly value: TournamentListFilter; readonly label: string; readonly testID: string }[] = [
  { value: 'all', label: 'All', testID: 'tournaments-chip-all' },
  { value: 'active', label: 'Active', testID: 'tournaments-chip-active' },
  { value: 'drafts', label: 'Drafts', testID: 'tournaments-chip-drafts' },
  { value: 'completed', label: 'Completed', testID: 'tournaments-chip-completed' },
];

export function TournamentsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<TournamentListFilter>('all');
  const { status, items, load } = useTournamentListStore(useShallow((state) => ({ status: state.status, items: state.items, load: state.load })));

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = () => {
    useTournamentWizardStore.getState().reset();
    router.push(routes.wizardStep('info'));
  };

  const openRow = async (row: TournamentRowVM) => {
    if (!row.draft) {
      router.push(routes.dashboard(row.id));
      return;
    }
    const wizard = useTournamentWizardStore.getState();
    const resumed = await wizard.resume(row.id);
    if (!resumed) {
      showError(useTournamentWizardStore.getState().error, "Couldn't open this draft.");
      return;
    }
    router.push(routes.wizardStep(useTournamentWizardStore.getState().step));
  };

  const rows = filterTournaments(items, filter).map(tournamentRowVM);
  const noneAtAll = items.length === 0;

  const header = (
    <View>
      <ScreenHeader
        title="Tournaments"
        trailing={<Button label="New" icon="plus" variant="secondary" size="sm" onPress={create} testID="tournaments-btn-create" />}
      />
      {noneAtAll ? null : (
        <View style={styles.filters}>
          <SegmentedControl
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            accessibilityLabel="Show tournaments"
            testID="tournaments-filter"
          />
        </View>
      )}
    </View>
  );

  const body = () => {
    if (status === 'loading' && noneAtAll) {
      return <Skeleton rows={4} testID="tournaments-skeleton" />;
    }
    if (status === 'error' && noneAtAll) {
      return <ErrorState title="Couldn't load your tournaments" onRetry={() => void load()} testID="tournaments-error" />;
    }
    if (noneAtAll) {
      return (
        <EmptyState
          icon="trophy"
          title="No tournaments yet"
          body="Create a tournament and manage teams, fixtures, standings and finals in one place."
          action={{ label: 'Create tournament', onPress: create, testID: 'tournaments-btn-empty-create' }}
          caps
          testID="tournaments-text-empty"
        />
      );
    }
    return (
      <Text variant="callout" tone="secondary" style={styles.emptyLine} testID="tournaments-text-filter-empty">
        {emptyListText(filter)}
      </Text>
    );
  };

  return (
    <Screen testID="screen-tournaments" scroll={false} fullWidth ambient header={header}>
      <WithScreenList>
        {(list) => (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={({ item, index }) => <TournamentRow row={item} position={index + 1} onPress={() => void openRow(item)} />}
            ListEmptyComponent={body()}
            initialNumToRender={12}
            windowSize={7}
            onScroll={list.onScroll}
            scrollEventThrottle={list.scrollEventThrottle}
            scrollIndicatorInsets={list.scrollIndicatorInsets}
            contentContainerStyle={list.contentInset}
            testID="tournaments-list"
          />
        )}
      </WithScreenList>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.md, paddingBottom: space.sm },
  emptyLine: { paddingHorizontal: space.md, paddingTop: space.md },
});

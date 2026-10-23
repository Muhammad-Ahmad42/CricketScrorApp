import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { EmptyState, IconButton, Inset, ListRow, Screen, Skeleton, useScreenList } from '@/ui';
import type { Team } from '@/domain/types';
import { useTeamLibraryStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { TeamSheet, type TeamValues } from '../sheets/TeamSheet';
import { SearchField } from '@/features/history/components/SearchField';
import { teamRowSubtitle } from '../selectors';
import { errorHeadline } from '@/features/scoring/selectors/scannable';

export const TEAM_SEARCH_DEBOUNCE_MS = 250;

const NO_COUNTS: Readonly<Record<string, number>> = {};

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

interface TeamListProps {
  readonly teams: readonly Team[];
  readonly counts: Readonly<Record<string, number>>;
  readonly loading: boolean;
  readonly archived: boolean;
  readonly onArchived: (value: boolean) => void;
  readonly onCreate: () => void;
}

function TeamList({ teams, counts, loading, archived, onArchived, onCreate }: TeamListProps) {
  const list = useScreenList();
  return (
    <FlatList
      data={teams}
      keyExtractor={(team) => team.id}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={teamRowSubtitle(item, counts[item.id])}
          leading={{ monogram: item.shortName }}
          trailing={{ kind: 'chevron' }}
          onPress={() => router.push({ pathname: '/teams/[teamId]', params: { teamId: item.id } })}
          testID={`teams-row-${item.id}`}
        />
      )}
      ListEmptyComponent={
        loading ? (
          <Skeleton rows={4} />
        ) : (
          <EmptyState
            title="No teams yet"
            icon="plus"
            action={{ label: 'Add team', onPress: onCreate, testID: 'teams-btn-empty-add' }}
            testID="teams-empty"
          />
        )
      }
      ListFooterComponent={<ListRow title="Show archived teams" trailing={{ kind: 'switch', value: archived, onValueChange: onArchived }} testID="teams-archived" />}
      contentContainerStyle={list.contentInset}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      keyboardShouldPersistTaps="handled"
      testID="teams-list"
    />
  );
}

export function TeamsScreen() {
  const teams = useTeamLibraryStore((s) => s.teams);
  const counts = useTeamLibraryStore((s) => s.playerCounts ?? NO_COUNTS);
  const status = useTeamLibraryStore((s) => s.status);
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useSingleFlight();
  const first = useRef(true);

  const reload = useCallback((text: string, includeArchived: boolean) => {
    void useTeamLibraryStore.getState().load({ search: text.trim() === '' ? undefined : text.trim(), includeArchived });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload('', false);
    }, [reload]),
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(() => reload(search, archived), TEAM_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, archived, reload]);

  const create = async (values: TeamValues) => {
    setBusy(true);
    const team = await useTeamLibraryStore.getState().createTeam({ name: values.name, shortName: values.shortName, players: [] });
    setBusy(false);
    if (team === null) {
      const error = useTeamLibraryStore.getState().error;
      useTeamLibraryStore.getState().clearError();
      useToastStore.getState().show({ kind: 'error', message: errorHeadline(error, "Couldn't create the team."), action: null });
      return;
    }
    setCreating(false);
    router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } });
  };

  return (
    <Screen
      testID="screen-teams"
      scroll={false}
      header={
        <View>
          <TopBar
            title="Teams"
            onBack={goBack}
            trailing={<IconButton icon="plus" label="New team" tone="accent" accessibilityLabel="New team" onPress={() => setCreating(true)} testID="teams-btn-new" />}
          />
          <Inset bottom="sm">
            <SearchField value={search} onChangeText={setSearch} accessibilityLabel="Search teams" placeholder="Search teams" testID="teams-search" />
          </Inset>
        </View>
      }
    >
      <TeamList teams={teams} counts={counts} loading={status === 'loading'} archived={archived} onArchived={setArchived} onCreate={() => setCreating(true)} />
      {creating ? (
        <TeamSheet
          visible
          title="New team"
          initial={{ name: '', shortName: '', captainId: null }}
          busy={busy}
          submitLabel="Create team"
          onSubmit={(values) => void flight(() => create(values))}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </Screen>
  );
}

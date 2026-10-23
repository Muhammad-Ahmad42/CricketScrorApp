import { useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { EmptyState, FAB_GAP, FAB_HEIGHT, FloatingActionButton, Inset, SegmentedControl, Tabs, Text, TextField, space, useScreenList, useTheme } from '@/ui';
import { FixtureRow } from '../components/FixtureRow';
import { useVenues, venueLookup } from '../hooks/useLibrary';
import { routes } from '../routes';
import { filterFixtures, fixtureSections, type FixtureStatusFilter } from '../selectors/fixtures';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { TournamentContainer } from './TournamentContainer';

export interface FixturesScreenProps {
  readonly tournamentId: TournamentId;
}

type FixtureGrouping = 'round' | 'date';

const STATUS_TABS: readonly { readonly key: FixtureStatusFilter; readonly label: string; readonly accessibilityLabel?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'live', label: 'Live' },
  { key: 'completed', label: 'Results' },
  { key: 'off', label: 'Called off', accessibilityLabel: 'Postponed or cancelled' },
];

interface FixtureFiltersProps {
  readonly mode: FixtureGrouping;
  readonly onMode: (mode: FixtureGrouping) => void;
  readonly filter: FixtureStatusFilter;
  readonly onFilter: (filter: FixtureStatusFilter) => void;
}

function FixtureFilters({ mode, onMode, filter, onFilter }: FixtureFiltersProps) {
  return (
    <View>
      <Inset bottom="xs">
        <SegmentedControl
          options={[
            { value: 'round', label: 'By round', testID: 'fixtures-chip-round' },
            { value: 'date', label: 'By date', testID: 'fixtures-chip-date' },
          ]}
          value={mode}
          onChange={onMode}
          accessibilityLabel="Group fixtures"
        />
      </Inset>
      <Tabs
        tabs={STATUS_TABS.map((tab) => ({ key: tab.key, label: tab.label, accessibilityLabel: tab.accessibilityLabel, testID: `fixtures-tab-${tab.key}` }))}
        selectedKey={filter}
        onSelect={onFilter}
        accessibilityLabel="Fixture status"
      />
    </View>
  );
}

interface FixturesBodyProps {
  readonly tournamentId: TournamentId;
  readonly index: TournamentIndex;
  readonly mode: FixtureGrouping;
  readonly filter: FixtureStatusFilter;
}

function FixturesBody({ tournamentId, index, mode, filter }: FixturesBodyProps) {
  const router = useRouter();
  const theme = useTheme();
  const venues = useVenues();
  const list = useScreenList();
  const [search, setSearch] = useState('');
  const canAdd = editPolicy(index).fixtureSchedule !== 'forbidden';
  const fixtures = filterFixtures(index, index.snapshot.fixtures, filter, search);
  const sections = fixtureSections(index, fixtures, mode, venueLookup(venues)).map((section) => ({ ...section, data: [...section.data] }));
  const clearance = canAdd ? FAB_HEIGHT + FAB_GAP + space.md : 0;
  return (
    <View style={styles.fill}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => <FixtureRow row={item} onPress={() => router.push(routes.fixture(tournamentId, item.fixtureId))} />}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: theme.color.background }}>
            <Inset top="md" bottom="xs">
              <Text variant="label" tone="secondary" accessibilityRole="header">
                {section.title}
              </Text>
            </Inset>
          </View>
        )}
        ListHeaderComponent={
          <Inset top="sm">
            <TextField
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Team or match number"
              leadingIcon="search"
              autoCapitalize="none"
              returnKeyType="search"
              testID="fixtures-input-search"
            />
          </Inset>
        }
        ListEmptyComponent={
          index.snapshot.fixtures.length === 0 ? (
            <EmptyState icon="file-text" title="No fixtures yet" body="Generate them from a stage or add a match." testID="fixtures-empty" />
          ) : (
            <EmptyState title="No matching fixtures" testID="fixtures-text-none" />
          )
        }
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        windowSize={9}
        keyboardShouldPersistTaps="handled"
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        scrollIndicatorInsets={list.scrollIndicatorInsets}
        contentContainerStyle={{ paddingTop: list.contentInset.paddingTop, paddingBottom: list.contentInset.paddingBottom + clearance }}
        testID="fixtures-list"
      />
      {canAdd ? (
        <FloatingActionButton label="Add match" icon="plus" onPress={() => router.push(routes.addFixture(tournamentId))} testID="fixtures-btn-add" />
      ) : null}
    </View>
  );
}

export function FixturesScreen({ tournamentId }: FixturesScreenProps) {
  const [mode, setMode] = useState<FixtureGrouping>('round');
  const [filter, setFilter] = useState<FixtureStatusFilter>('all');
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-fixtures"
      title="Fixtures"
      scroll={false}
      controls={() => <FixtureFilters mode={mode} onMode={setMode} filter={filter} onFilter={setFilter} />}
    >
      {(index) => <FixturesBody tournamentId={tournamentId} index={index} mode={mode} filter={filter} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

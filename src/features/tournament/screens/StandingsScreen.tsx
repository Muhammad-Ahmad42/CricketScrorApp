import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StageId, TournamentId } from '@/domain/types';
import { Notice } from '@/features/shared';
import { BoundaryRule, EmptyState, SegmentedControl, Tabs, Text, space, useScreenList } from '@/ui';
import { StandingsHeader, StandingsRow, StandingsScroller, StandingsStickyBlock, standingsColumns, useStandingsScroll } from '../components/StandingsTable';
import { routes } from '../routes';
import type { TournamentIndex } from '../selectors/names';
import { cachedStageStandings, stagesWithTables, type StageStandingsVM, type StandingsTableVM } from '../selectors/standings';
import { TournamentContainer } from './TournamentContainer';

export interface StandingsScreenProps {
  readonly tournamentId: TournamentId;
}

function tabTestID(table: StandingsTableVM): string {
  if (table.key === 'overall') {
    return 'standings-tab-overall';
  }
  if (table.key.startsWith('compare-')) {
    return `standings-tab-${table.key}`;
  }
  return `standings-tab-pool-${table.key}`;
}

function slotLine(index: TournamentIndex, table: StandingsTableVM): string | null {
  if (table.poolId === null) {
    return null;
  }
  const slots = index.snapshot.slots
    .filter((slot) => slot.source.kind === 'pool_position' && slot.source.poolId === table.poolId)
    .sort((a, b) => a.index - b.index);
  if (slots.length === 0) {
    return null;
  }
  const parts = slots.map((slot) => {
    const resolution = index.slotResolution(slot.id);
    if (!resolution || resolution.teamId === null) {
      return `${slot.label} to be decided`;
    }
    const name = index.teamName(resolution.teamId);
    return resolution.status === 'provisional' ? `${slot.label} ${name} (provisional)` : `${slot.label} ${name}`;
  });
  return `Slots: ${parts.join(' · ')}`;
}

interface StandingsSelection {
  readonly stages: ReturnType<typeof stagesWithTables>;
  readonly stageId: StageId;
  readonly vm: StageStandingsVM;
  readonly table: StandingsTableVM | null;
}

function selectStandings(index: TournamentIndex, stageId: StageId | null, tableKey: string | null): StandingsSelection | null {
  const stages = stagesWithTables(index);
  const fallback = stages.find((stage) => stage.stageId === index.evaluation?.currentStageId) ?? stages[0];
  const stage = stages.find((candidate) => candidate.stageId === stageId) ?? fallback;
  if (!stage) {
    return null;
  }
  const vm = cachedStageStandings(index, stage);
  const table = vm.tables.find((candidate) => candidate.key === tableKey) ?? vm.tables[0] ?? null;
  return { stages, stageId: stage.stageId, vm, table };
}

interface StandingsControlsProps {
  readonly index: TournamentIndex;
  readonly selection: StandingsSelection;
  readonly onStage: (stageId: StageId) => void;
  readonly onTable: (key: string) => void;
}

function StandingsControls({ index, selection, onStage, onTable }: StandingsControlsProps) {
  const { stages, stageId, vm, table } = selection;
  if (stages.length <= 1 && vm.tables.length <= 1) {
    return null;
  }
  return (
    <View>
      {stages.length > 1 ? (
        <View style={styles.stagePicker}>
          <SegmentedControl
            options={stages.map((candidate) => ({
              value: candidate.stageId,
              label: index.stageName(candidate.stageId),
              testID: `standings-chip-stage-${candidate.stageId}`,
            }))}
            value={stageId}
            onChange={onStage}
            accessibilityLabel="Stage"
          />
        </View>
      ) : null}
      {vm.tables.length > 1 && table ? (
        <Tabs
          tabs={vm.tables.map((candidate) => ({ key: candidate.key, label: candidate.title, testID: tabTestID(candidate) }))}
          selectedKey={table.key}
          onSelect={onTable}
          accessibilityLabel="Standings tables"
          testID="standings-tabs"
        />
      ) : null}
    </View>
  );
}

interface StandingsBodyProps {
  readonly tournamentId: TournamentId;
  readonly index: TournamentIndex;
  readonly selection: StandingsSelection | null;
}

function StandingsBody({ tournamentId, index, selection }: StandingsBodyProps) {
  const router = useRouter();
  const scroll = useStandingsScroll();
  const list = useScreenList();
  if (!selection) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <EmptyState icon="trophy" title="No standings yet" body="Standings appear once a stage with pools or a league has fixtures." testID="standings-empty" />
      </View>
    );
  }
  const { vm, table } = selection;
  if (!table) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <EmptyState icon="trophy" title="No standings yet" testID="standings-empty" />
      </View>
    );
  }
  const slots = slotLine(index, table);
  const columns = standingsColumns(table.rows, table.showTies);

  const top = (
    <View>
      {vm.tables.length > 1 ? null : (
        <Text variant="label" tone="secondary" style={styles.tableTitle} accessibilityRole="header">
          {table.title}
        </Text>
      )}
      {table.unresolvedTies.map((text, position) => (
        <Notice
          key={text}
          tone="warning"
          message={text}
          action={{ label: 'Resolve tie', onPress: () => router.push(routes.qualification(tournamentId)), testID: `standings-btn-resolve-tie-${position + 1}` }}
          testID={`standings-text-tie-${position + 1}`}
        />
      ))}
    </View>
  );

  const header = (
    <View>
      {scroll ? <StandingsStickyBlock>{top}</StandingsStickyBlock> : top}
      <StandingsHeader columns={columns} testID="standings-header" />
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <BoundaryRule />
      <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.footerTitle}>
        How this table is decided
      </Text>
      <Text variant="callout" testID="standings-text-rule">
        {vm.rulesText}
      </Text>
      <Text variant="callout" tone="secondary" testID="standings-text-chain">
        {`Ranking: ${table.chain}`}
      </Text>
      {table.rows
        .filter((row) => row.note)
        .map((row) => (
          <Text key={row.key} variant="footnote" tone="secondary">
            {`${row.team}: ${row.note}`}
          </Text>
        ))}
      {slots ? (
        <Text variant="footnote" tone="secondary" testID="standings-text-slots">
          {slots}
        </Text>
      ) : null}
      {!table.complete ? (
        <Text variant="footnote" tone="muted">
          Positions can still change while matches remain.
        </Text>
      ) : null}
    </View>
  );

  const rows = (
    <FlatList
      data={table.rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item, index: position }) => (
        <StandingsRow row={item} ordinal={position + 1} tableKey={table.key} columns={columns} />
      )}
      ListHeaderComponent={header}
      ListFooterComponent={scroll ? <StandingsStickyBlock>{footer}</StandingsStickyBlock> : footer}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={9}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      contentContainerStyle={list.contentInset}
      testID="standings-list"
    />
  );

  return scroll ? (
    <StandingsScroller columns={columns} fill testID="standings-scroller">
      {rows}
    </StandingsScroller>
  ) : (
    rows
  );
}

export function StandingsScreen({ tournamentId }: StandingsScreenProps) {
  const [stageId, setStageId] = useState<StageId | null>(null);
  const [tableKey, setTableKey] = useState<string | null>(null);
  const changeStage = (next: StageId) => {
    setStageId(next);
    setTableKey(null);
  };
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-standings"
      title="Standings"
      scroll={false}
      controls={(index) => {
        const selection = selectStandings(index, stageId, tableKey);
        return selection ? <StandingsControls index={index} selection={selection} onStage={changeStage} onTable={setTableKey} /> : null;
      }}
    >
      {(index) => <StandingsBody tournamentId={tournamentId} index={index} selection={selectStandings(index, stageId, tableKey)} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  stagePicker: { paddingHorizontal: space.md, paddingBottom: space.xs },
  tableTitle: { paddingHorizontal: space.md, paddingVertical: space.sm },
  footer: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.xs },
  footerTitle: { paddingTop: space.sm },
});

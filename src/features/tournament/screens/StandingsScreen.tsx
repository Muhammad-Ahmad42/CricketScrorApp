import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StageId, TournamentId } from '@/domain/types';
import { Banner, Disclosure, EmptyState, Inset, SegmentedControl, Tabs, Text, space, useScreenList, useTheme } from '@/ui';
import {
  StandingsHeader,
  StandingsRow,
  StandingsScroller,
  StandingsStickyBlock,
  useMeasuredWidth,
  useStandingsLayout,
  useStandingsScroll,
} from '../components/StandingsTable';
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
        <Inset bottom="xs">
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
        </Inset>
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
  const theme = useTheme();
  const scroll = useStandingsScroll();
  const list = useScreenList();
  const [width, onLayout] = useMeasuredWidth();
  const layout = useStandingsLayout(selection?.table?.rows ?? [], selection?.table?.showTies ?? false, width);
  if (!selection) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <EmptyState icon="trophy" title="No standings yet" body="They appear once fixtures exist." testID="standings-empty" />
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
  const columns = layout.columns;
  const notes = table.rows.map((row, position) => ({ row, ordinal: position + 1 })).filter((entry) => entry.row.note);

  const top = (
    <View>
      {vm.tables.length > 1 ? null : (
        <Inset top="sm" bottom="sm">
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {table.title}
          </Text>
        </Inset>
      )}
      {table.unresolvedTies.map((text, position) => (
        <Banner
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
    <View style={[styles.footer, { borderTopWidth: theme.borderWidth.hairline, borderTopColor: theme.color.border }]}>
      <Inset gap="xs">
        <Text variant="callout" testID="standings-text-rule" style={styles.footerTitle}>
          {vm.rulesText}
        </Text>
        {slots ? (
          <Text variant="footnote" tone="secondary" testID="standings-text-slots">
            {slots}
          </Text>
        ) : null}
        {table.chain.length > 0 || notes.length > 0 ? (
          <Disclosure label={notes.length > 0 ? `Tie-breaks (${notes.length})` : 'Tie-breaks'} testID="standings-btn-tiebreaks">
            <View style={styles.notes}>
              {table.chain.length > 0 ? (
                <Text variant="footnote" tone="secondary" testID="standings-text-chain">
                  {`Ranking: ${table.chain}`}
                </Text>
              ) : null}
              {notes.map(({ row, ordinal }) => (
                <View key={row.key} style={styles.note}>
                  <Text variant="footnote" weight="semibold">
                    {row.team}
                  </Text>
                  <Text variant="footnote" tone="secondary" testID={`standings-text-tiebreak-${table.key}-${ordinal}`}>
                    {row.note}
                  </Text>
                </View>
              ))}
            </View>
          </Disclosure>
        ) : null}
      </Inset>
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

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {scroll ? (
        <StandingsScroller columns={columns} fill testID="standings-scroller">
          {rows}
        </StandingsScroller>
      ) : (
        rows
      )}
    </View>
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
  fill: { flex: 1 },
  footer: { paddingTop: space.md, marginTop: space.lg },
  footerTitle: { paddingTop: space.sm },
  notes: { gap: space.sm },
  note: { gap: space.xxs },
});

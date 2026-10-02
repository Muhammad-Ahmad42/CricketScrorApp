import type { ReactElement } from 'react';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';
import { ListRow, Text, space, useLayoutClass, useScreenList } from '@/ui';
import type { PoolMemberVM } from '../selectors/pools';

export interface PoolBoardPool {
  readonly poolId: string;
  readonly key: string;
  readonly name: string;
  readonly summary?: string | null;
  readonly members: readonly PoolMemberVM[];
}

export interface PoolBoardProps {
  readonly pools: readonly PoolBoardPool[];
  readonly rowTestIDPrefix: string;
  readonly onMemberActions?: (member: PoolMemberVM, pool: PoolBoardPool) => void;
  readonly emptyPoolText?: string;
  readonly header?: ReactElement | null;
  readonly footer?: ReactElement | null;
  readonly testID?: string;
}

interface PoolSection {
  readonly pool: PoolBoardPool;
  readonly key: string;
  readonly data: readonly (PoolMemberVM | null)[];
}

const STACKED_INITIAL_ITEMS = 24;
const COLUMN_INITIAL_ROWS = 3;

function PoolHeader({ pool, testID }: { readonly pool: PoolBoardPool; readonly testID: string }) {
  return (
    <View style={styles.header} testID={testID}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {pool.summary ? `${pool.name} · ${pool.summary}` : pool.name}
      </Text>
    </View>
  );
}

interface MemberRowProps {
  readonly member: PoolMemberVM;
  readonly position: number;
  readonly pool: PoolBoardPool;
  readonly rowTestIDPrefix: string;
  readonly onMemberActions?: (member: PoolMemberVM, pool: PoolBoardPool) => void;
}

function MemberRow({ member, position, pool, rowTestIDPrefix, onMemberActions }: MemberRowProps) {
  return (
    <ListRow
      title={member.label}
      subtitle={member.detail ?? undefined}
      compact
      menu={
        onMemberActions
          ? {
              accessibilityLabel: `Actions for ${member.label}`,
              onPress: () => onMemberActions(member, pool),
              testID: `${rowTestIDPrefix}-${pool.key}-${position}-menu`,
            }
          : undefined
      }
      onPress={onMemberActions ? () => onMemberActions(member, pool) : undefined}
      testID={`${rowTestIDPrefix}-${pool.key}-${position}`}
    />
  );
}

function EmptyPool({ text }: { readonly text: string }) {
  return (
    <Text variant="callout" tone="muted" style={styles.empty}>
      {text}
    </Text>
  );
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }
  return rows;
}

export function PoolBoard({ pools, rowTestIDPrefix, onMemberActions, emptyPoolText = 'No teams yet', header = null, footer = null, testID }: PoolBoardProps) {
  const layout = useLayoutClass();
  const list = useScreenList();
  const wide = layout.width === 'medium' || layout.width === 'expanded';
  const perRow = Math.min(pools.length, layout.width === 'expanded' ? 3 : 2);

  if (wide && pools.length > 1) {
    const rows = chunk(pools, perRow);
    return (
      <FlatList
        data={rows}
        keyExtractor={(row) => row.map((pool) => pool.poolId).join('|')}
        renderItem={({ item }) => (
          <View style={styles.columns}>
            {item.map((pool) => (
              <View key={pool.poolId} style={styles.column}>
                <PoolHeader pool={pool} testID={`${rowTestIDPrefix}-${pool.key}`} />
                {pool.members.length === 0 ? (
                  <EmptyPool text={emptyPoolText} />
                ) : (
                  pool.members.map((member, position) => (
                    <MemberRow
                      key={member.key}
                      member={member}
                      position={position + 1}
                      pool={pool}
                      rowTestIDPrefix={rowTestIDPrefix}
                      onMemberActions={onMemberActions}
                    />
                  ))
                )}
              </View>
            ))}
            {Array.from({ length: perRow - item.length }, (_, filler) => (
              <View key={`filler-${filler}`} style={styles.column} />
            ))}
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        initialNumToRender={COLUMN_INITIAL_ROWS}
        maxToRenderPerBatch={COLUMN_INITIAL_ROWS}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        style={styles.fill}
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        scrollIndicatorInsets={list.scrollIndicatorInsets}
        contentContainerStyle={list.contentInset}
        testID={testID}
      />
    );
  }

  const sections: readonly PoolSection[] = pools.map((pool) => ({
    pool,
    key: pool.poolId,
    data: pool.members.length === 0 ? [null] : pool.members,
  }));
  return (
    <SectionList<PoolMemberVM | null, PoolSection>
      sections={sections}
      keyExtractor={(item, position) => item?.key ?? `empty-${position}`}
      renderSectionHeader={({ section }) => <PoolHeader pool={section.pool} testID={`${rowTestIDPrefix}-${section.pool.key}`} />}
      renderItem={({ item, index: position, section }) =>
        item === null ? (
          <EmptyPool text={emptyPoolText} />
        ) : (
          <MemberRow member={item} position={position + 1} pool={section.pool} rowTestIDPrefix={rowTestIDPrefix} onMemberActions={onMemberActions} />
        )
      }
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      initialNumToRender={STACKED_INITIAL_ITEMS}
      maxToRenderPerBatch={STACKED_INITIAL_ITEMS}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      style={styles.fill}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      contentContainerStyle={list.contentInset}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.xs },
  empty: { paddingHorizontal: space.md, paddingVertical: space.sm },
});

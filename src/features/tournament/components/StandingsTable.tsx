import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { MANUAL_OVERRIDE_LABEL, QualificationText } from '@/features/shared';
import { Badge, COLUMN_WIDTH, Text, space, useLayoutClass, useTheme } from '@/ui';
import type { StandingRowVM, StandingsTableVM } from '../selectors/standings';

export const STANDINGS_COLUMNS = ['Pos', 'Team', 'P', 'W', 'L', 'NR', 'Pts', 'NRR'] as const;

type ColumnKey = 'pos' | 'team' | 'p' | 'w' | 'l' | 't' | 'nr' | 'pts' | 'nrr';

export interface StandingsColumn {
  readonly key: ColumnKey;
  readonly header: string;
  readonly width: number | null;
  readonly value: (row: StandingRowVM) => string;
}

const CELL_GAP = space.xxs;

function digitsWidth(values: readonly string[]): number {
  return values.some((value) => value.length > 2) ? COLUMN_WIDTH.digits3 : COLUMN_WIDTH.digits2;
}

export function standingsColumns(rows: readonly StandingRowVM[], showTies: boolean): readonly StandingsColumn[] {
  const count = digitsWidth(rows.flatMap((row) => [row.played, row.won, row.lost, row.tied, row.noResult].map(String)));
  const columns: StandingsColumn[] = [
    { key: 'pos', header: 'Pos', width: digitsWidth(rows.map((row) => row.position)), value: (row) => row.position },
    { key: 'team', header: 'Team', width: null, value: (row) => row.team },
    { key: 'p', header: 'P', width: count, value: (row) => String(row.played) },
    { key: 'w', header: 'W', width: count, value: (row) => String(row.won) },
    { key: 'l', header: 'L', width: count, value: (row) => String(row.lost) },
  ];
  if (showTies) {
    columns.push({ key: 't', header: 'T', width: count, value: (row) => String(row.tied) });
  }
  columns.push(
    { key: 'nr', header: 'NR', width: count, value: (row) => String(row.noResult) },
    { key: 'pts', header: 'Pts', width: digitsWidth(rows.map((row) => String(row.points))), value: (row) => String(row.points) },
    { key: 'nrr', header: 'NRR', width: COLUMN_WIDTH.nrr, value: (row) => row.nrr },
  );
  return columns;
}

interface ScrollFrame {
  readonly scrollX: Animated.Value;
  readonly viewport: number;
  readonly teamWidth: number;
}

const ScrollFrameContext = createContext<ScrollFrame | null>(null);

function lead(columns: readonly StandingsColumn[]): readonly StandingsColumn[] {
  return columns.filter((column) => column.key === 'pos' || column.key === 'team');
}

function numeric(columns: readonly StandingsColumn[]): readonly StandingsColumn[] {
  return columns.filter((column) => column.key !== 'pos' && column.key !== 'team');
}

function posWidth(columns: readonly StandingsColumn[]): number {
  return columns.find((column) => column.key === 'pos')?.width ?? COLUMN_WIDTH.digits2;
}

function numericWidth(columns: readonly StandingsColumn[]): number {
  return numeric(columns).reduce((sum, column) => sum + (column.width ?? 0) + CELL_GAP, 0);
}

export function useStandingsScroll(): boolean {
  return useLayoutClass().largeText;
}

export interface StandingsScrollerProps {
  readonly columns: readonly StandingsColumn[];
  readonly children: ReactNode;
  readonly fill?: boolean;
  readonly testID?: string;
}

export function StandingsScroller({ columns, children, fill = false, testID }: StandingsScrollerProps) {
  const window = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState<number | null>(null);
  const viewport = measured ?? window.width;
  const teamWidth = Math.round(COLUMN_WIDTH.name * Math.min(window.fontScale, 1.5));
  const content = space.md + posWidth(columns) + CELL_GAP + teamWidth + numericWidth(columns) + space.md;
  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== measured) {
      setMeasured(width);
    }
  };
  return (
    <ScrollFrameContext.Provider value={{ scrollX, viewport, teamWidth }}>
      <Animated.ScrollView
        horizontal
        style={fill ? styles.fill : undefined}
        onLayout={onLayout}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        <View style={[{ width: Math.max(viewport, content) }, fill ? styles.fill : null]}>{children}</View>
      </Animated.ScrollView>
    </ScrollFrameContext.Provider>
  );
}

interface StickyProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

function Sticky({ style, children }: StickyProps) {
  const frame = useContext(ScrollFrameContext);
  if (frame === null) {
    return <View style={style}>{children}</View>;
  }
  return <Animated.View style={[style, styles.raised, { transform: [{ translateX: frame.scrollX }] }]}>{children}</Animated.View>;
}

export function StandingsStickyBlock({ children }: { readonly children: ReactNode }) {
  const frame = useContext(ScrollFrameContext);
  return <Sticky style={frame ? { width: frame.viewport } : undefined}>{children}</Sticky>;
}

function leadStyle(frame: ScrollFrame | null, columns: readonly StandingsColumn[]): ViewStyle {
  if (frame === null) {
    return styles.leadFlexible;
  }
  return { width: space.md + posWidth(columns) + CELL_GAP + frame.teamWidth };
}

function cellStyle(column: StandingsColumn): ViewStyle {
  return column.width === null ? styles.flexCell : { width: column.width };
}

export interface StandingsHeaderProps {
  readonly columns: readonly StandingsColumn[];
  readonly testID?: string;
}

export function StandingsHeader({ columns, testID }: StandingsHeaderProps) {
  const theme = useTheme();
  const frame = useContext(ScrollFrameContext);
  const label = (column: StandingsColumn) => (
    <View key={column.key} style={cellStyle(column)}>
      <Text variant="label" tone="secondary" align={column.key === 'team' || column.key === 'pos' ? 'left' : 'right'} numberOfLines={1}>
        {column.header}
      </Text>
    </View>
  );
  return (
    <View
      testID={testID}
      style={[styles.header, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Sticky style={[styles.lead, leadStyle(frame, columns), frame ? { backgroundColor: theme.color.surface } : null]}>{lead(columns).map(label)}</Sticky>
      {numeric(columns).map(label)}
    </View>
  );
}

export interface StandingsRowProps {
  readonly row: StandingRowVM;
  readonly ordinal: number;
  readonly tableKey: string;
  readonly columns: readonly StandingsColumn[];
  readonly compact?: boolean;
  readonly testIDPrefix?: string;
  readonly onPress?: () => void;
}

function AdjustmentLine({ row, testID }: { readonly row: StandingRowVM; readonly testID: string }) {
  if (row.adjustment === null) {
    return null;
  }
  const parts = [`Points adjusted by the organizer: ${row.adjustment.amount}`, ...row.adjustment.reasons];
  return (
    <View style={styles.adjustment}>
      <Badge label={MANUAL_OVERRIDE_LABEL} tone="override" testID={testID} />
      <Text variant="footnote" tone="secondary" style={styles.adjustmentText}>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}

function compactMark(row: StandingRowVM): string | null {
  if (row.qualification && row.qualification.state !== 'in_contention') {
    return row.qualification.short;
  }
  return row.adjustment ? 'M' : null;
}

export function StandingsRow({ row, ordinal, tableKey, columns, compact = false, testIDPrefix = 'standings', onPress }: StandingsRowProps) {
  const theme = useTheme();
  const frame = useContext(ScrollFrameContext);
  const id = `${tableKey}-${ordinal}`;
  const qualified = row.qualification?.state === 'qualified';
  const mark = compact ? compactMark(row) : null;
  const detailWidth = frame ? { width: frame.viewport - space.md } : null;
  const detailInset = { paddingLeft: space.md + posWidth(columns) + CELL_GAP };
  const hasDetail = !compact && (row.qualification !== null || row.note !== null || row.adjustment !== null);
  return (
    <Pressable
      testID={`${testIDPrefix}-row-${id}`}
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={row.accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface,
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.color.border,
        },
      ]}
    >
      {({ pressed }) => (
        <>
      <View style={styles.cells}>
        <Sticky style={[styles.lead, leadStyle(frame, columns), frame ? { backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface } : null]}>
          {lead(columns).map((column) => (
            <View key={column.key} style={cellStyle(column)}>
              {column.key === 'team' ? (
                <View style={styles.teamCell}>
                  <Text
                    variant="body"
                    tone={row.muted ? 'muted' : 'primary'}
                    weight={qualified ? 'semibold' : undefined}
                    numberOfLines={1}
                    style={styles.teamText}
                    testID={`${testIDPrefix}-cell-${id}-team`}
                  >
                    {column.value(row)}
                  </Text>
                  {mark ? (
                    <Text variant="label" tone={row.qualification?.state === 'qualified' ? 'success' : 'muted'} testID={`${testIDPrefix}-mark-${id}`}>
                      {mark}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text variant="tableNumeric" tone={row.muted ? 'muted' : 'primary'} align="left" numberOfLines={1} testID={`${testIDPrefix}-cell-${id}-${column.key}`}>
                  {column.value(row)}
                </Text>
              )}
            </View>
          ))}
        </Sticky>
        {numeric(columns).map((column) => (
          <View key={column.key} style={cellStyle(column)}>
            <Text
              variant="tableNumeric"
              tone={row.muted ? 'muted' : 'primary'}
              align="right"
              numberOfLines={1}
              adjustsFontSizeToFit
              testID={`${testIDPrefix}-cell-${id}-${column.key}`}
            >
              {column.value(row)}
            </Text>
          </View>
        ))}
      </View>
      {hasDetail ? (
        <Sticky style={[styles.details, detailInset, detailWidth]}>
          {row.qualification ? (
            <QualificationText
              state={row.qualification.state}
              certainty={row.qualification.certainty}
              explanation={row.qualification.explanation}
              manual={row.qualification.manual}
              detail={row.remaining}
              explanationTestID={`${testIDPrefix}-text-qual-${id}`}
              badgeTestID={`${testIDPrefix}-badge-qual-${id}`}
              compact
            />
          ) : null}
          <AdjustmentLine row={row} testID={`${testIDPrefix}-badge-adjust-${id}`} />
          {row.note ? (
            <Text variant="footnote" tone="secondary" testID={`${testIDPrefix}-text-tiebreak-${id}`}>
              {row.note}
            </Text>
          ) : null}
        </Sticky>
      ) : null}
      {qualified ? <Sticky style={[styles.bar, { backgroundColor: theme.color.success }]} /> : null}
        </>
      )}
    </Pressable>
  );
}

export interface StandingsTableProps {
  readonly table: StandingsTableVM;
  readonly compact?: boolean;
  readonly testIDPrefix?: string;
  readonly maxRows?: number;
}

export function StandingsTable({ table, compact = false, testIDPrefix = 'standings', maxRows }: StandingsTableProps) {
  const scroll = useStandingsScroll();
  const rows = maxRows === undefined ? table.rows : table.rows.slice(0, maxRows);
  const columns = standingsColumns(table.rows, table.showTies);
  const body = (
    <View>
      <StandingsHeader columns={columns} />
      {rows.map((row, position) => (
        <StandingsRow key={row.key} row={row} ordinal={position + 1} tableKey={table.key} columns={columns} compact={compact} testIDPrefix={testIDPrefix} />
      ))}
    </View>
  );
  return scroll ? <StandingsScroller columns={columns}>{body}</StandingsScroller> : body;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  raised: { zIndex: 1 },
  header: { height: 36, flexDirection: 'row', alignItems: 'center', paddingRight: space.md, gap: CELL_GAP },
  row: { paddingRight: space.md, paddingVertical: space.xs, minHeight: 44, justifyContent: 'center', gap: space.xxs },
  cells: { flexDirection: 'row', alignItems: 'center', gap: CELL_GAP },
  lead: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: CELL_GAP, paddingLeft: space.md },
  leadFlexible: { flex: 1 },
  flexCell: { flex: 1 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  teamText: { flexShrink: 1 },
  details: { gap: space.xxs },
  adjustment: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  adjustmentText: { flexShrink: 1 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});

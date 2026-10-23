import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BoundaryRule } from '../layout/BoundaryRule';
import { space, useContentSurface, useTheme, type Theme } from '../theme';
import { Text } from '../typography';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { RowMarkerGlyph, type RowMarker } from './Markers';
import { EdgeFades } from '../glass/EdgeFades';
import { rowOverflow } from './ScrollRow';

export const COLUMN_WIDTH = { digits2: 32, digits3: 40, decimal: 56, nrr: 64, name: 120 } as const;

export interface TableColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly kind: 'name' | 'numeric';
  readonly width?: number;
  readonly value: (row: Row) => string;
  readonly subtext?: (row: Row) => string | null;
}

export interface TableEmphasis {
  readonly marker: RowMarker;
}

export interface TableTotals {
  readonly cells: Readonly<Record<string, string>>;
  readonly accessibilityLabel: string;
  readonly ruled?: boolean;
  readonly testID?: string;
}

export interface TableProps<Row> {
  readonly columns: readonly TableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row, index: number) => string;
  readonly rowAccessibilityLabel: (row: Row, index: number) => string;
  readonly emphasis?: (row: Row) => TableEmphasis | null;
  readonly muted?: (row: Row) => boolean;
  readonly onRowPress?: (row: Row, index: number) => void;
  readonly rowTestID?: (row: Row, index: number) => string;
  readonly totals?: TableTotals;
  readonly emptyText?: string;
  readonly scrollable?: boolean | 'auto';
  readonly testID?: string;
}

export const TABLE_PADDING_X = space.md;
export const TABLE_NAME_GAP = space.xs;
export const TABLE_NUMERIC_GAP = space.xxs;

export function columnGap<Row>(columns: readonly TableColumn<Row>[], index: number): number {
  if (index === 0) {
    return 0;
  }
  return columns[index - 1]?.kind === 'numeric' && columns[index]?.kind === 'numeric' ? TABLE_NUMERIC_GAP : TABLE_NAME_GAP;
}

export function tableMinWidth<Row>(columns: readonly TableColumn<Row>[]): number {
  return columns.reduce(
    (total, column, index) => total + columnGap(columns, index) + (column.kind === 'name' ? column.width ?? COLUMN_WIDTH.name : column.width ?? COLUMN_WIDTH.digits2),
    TABLE_PADDING_X * 2,
  );
}

export function shouldSplitTable<Row>(scrollable: boolean | 'auto', columns: readonly TableColumn<Row>[], width: number): boolean {
  if (scrollable === 'auto') {
    return columns.length > 1 && width > 0 && tableMinWidth(columns) > width;
  }
  return scrollable;
}

function cellStyle<Row>(column: TableColumn<Row>): ViewStyle {
  if (column.kind === 'name') {
    return { flex: 1, minWidth: column.width ?? COLUMN_WIDTH.name };
  }
  return { width: column.width ?? COLUMN_WIDTH.digits2, alignItems: 'flex-end' };
}

function rowSurface(theme: Theme, surface: string, emphasised: boolean, pressed: boolean): ViewStyle {
  if (pressed) {
    return { backgroundColor: theme.color.surfaceSunken };
  }
  return { backgroundColor: emphasised ? theme.color.accentSubtle : surface };
}

interface CellsProps<Row> {
  readonly columns: readonly TableColumn<Row>[];
  readonly row: Row;
  readonly muted: boolean;
  readonly marker: RowMarker | null;
}

function Cells<Row>({ columns, row, muted, marker }: CellsProps<Row>) {
  return (
    <>
      {columns.map((column, index) => {
        const subtext = column.subtext?.(row) ?? null;
        const subtextLine = subtext ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {subtext}
          </Text>
        ) : null;
        return (
          <View key={column.key} style={[styles.cell, cellStyle(column), { marginLeft: columnGap(columns, index) }]}>
            {index === 0 && marker !== null ? (
              <View style={styles.nameLine}>
                <View style={styles.markerSlot}>
                  <RowMarkerGlyph marker={marker} />
                </View>
                <View style={styles.flexText}>
                  <Text variant="body" tone={muted ? 'muted' : 'primary'} weight={marker === 'none' ? undefined : 'semibold'}>
                    {column.value(row)}
                  </Text>
                  {subtextLine}
                </View>
              </View>
            ) : (
              <>
                <Text
                  variant={column.kind === 'numeric' ? 'tableNumeric' : 'body'}
                  tone={muted ? 'muted' : 'primary'}
                  numberOfLines={column.kind === 'numeric' ? 1 : undefined}
                  align={column.kind === 'numeric' ? 'right' : 'left'}
                >
                  {column.value(row)}
                </Text>
                {subtextLine}
              </>
            )}
          </View>
        );
      })}
    </>
  );
}

function HeaderCells<Row>({ columns }: { readonly columns: readonly TableColumn<Row>[] }) {
  return (
    <>
      {columns.map((column, index) => (
        <View key={column.key} style={[styles.cell, cellStyle(column), { marginLeft: columnGap(columns, index) }]}>
          <Text variant="label" tone="secondary" numberOfLines={1} align={column.kind === 'numeric' ? 'right' : 'left'}>
            {column.header}
          </Text>
        </View>
      ))}
    </>
  );
}

interface TableRowFrameProps {
  readonly testID?: string;
  readonly primary: boolean;
  readonly label?: string;
  readonly onPress?: () => void;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly frameStyle: (pressed: boolean) => StyleProp<ViewStyle>;
  readonly children: ReactNode;
}

function TableRowFrame({ testID, primary, label, onPress, onLayout, frameStyle, children }: TableRowFrameProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const pressable = onPress !== undefined;
  return (
    <Pressable
      testID={testID}
      accessible={primary}
      focusable={primary && pressable}
      importantForAccessibility={primary ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={primary ? (pressable ? 'button' : 'text') : undefined}
      accessibilityLabel={label}
      disabled={!pressable}
      onPress={onPress}
      onLayout={onLayout}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [frameStyle(pressed), focusRingStyle(theme, primary && focus.focused, 'inside')]}
    >
      {children}
    </Pressable>
  );
}

export function Table<Row>({
  columns,
  rows,
  rowKey,
  rowAccessibilityLabel,
  emphasis,
  muted,
  onRowPress,
  rowTestID,
  totals,
  emptyText = 'No matches played yet',
  scrollable = 'auto',
  testID,
}: TableProps<Row>) {
  const theme = useTheme();
  const surface = useContentSurface();
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const hairline = { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border };
  const rowMin = onRowPress ? theme.size.tableRowPressable : theme.size.tableRow;
  const split = shouldSplitTable(scrollable, columns, width);
  const fixed = split ? columns.slice(0, 1) : columns;
  const rest = split ? columns.slice(1) : [];
  const fixedWidth = (columns[0]?.width ?? COLUMN_WIDTH.name) + TABLE_PADDING_X * 2 + TABLE_NAME_GAP;
  const onOuterLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) {
      setWidth(next);
    }
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(event.nativeEvent.contentOffset.x);

  const header = (cols: readonly TableColumn<Row>[]) => (
    <View
      style={[styles.header, hairline, { backgroundColor: surface }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <HeaderCells columns={cols} />
    </View>
  );

  const renderRow = (row: Row, index: number, cols: readonly TableColumn<Row>[], primary: boolean) => {
    const key = rowKey(row, index);
    const emph = emphasis?.(row) ?? null;
    const isMuted = muted?.(row) ?? false;
    const measured = heights[key];
    const onLayout = primary && split
      ? (event: LayoutChangeEvent) => {
          const h = Math.round(event.nativeEvent.layout.height);
          if (heights[key] !== h) {
            setHeights((prev) => ({ ...prev, [key]: h }));
          }
        }
      : undefined;
    return (
      <TableRowFrame
        key={key}
        testID={primary ? rowTestID?.(row, index) : undefined}
        primary={primary}
        label={primary ? rowAccessibilityLabel(row, index) : undefined}
        onPress={onRowPress ? () => onRowPress(row, index) : undefined}
        onLayout={onLayout}
        frameStyle={(pressed) => [
          styles.row,
          hairline,
          { minHeight: !primary && measured ? measured : rowMin },
          rowSurface(theme, surface, emph !== null, pressed && onRowPress !== undefined),
        ]}
      >
        {primary && emph !== null ? <View style={[styles.bar, { backgroundColor: theme.color.accent }]} /> : null}
        <Cells columns={cols} row={row} muted={isMuted} marker={primary && emphasis ? emph?.marker ?? 'none' : null} />
      </TableRowFrame>
    );
  };

  const totalsRow = (cols: readonly TableColumn<Row>[], primary: boolean) =>
    totals ? (
      <View
        testID={primary ? totals.testID : undefined}
        accessible={primary}
        accessibilityRole={primary ? 'text' : undefined}
        accessibilityLabel={primary ? totals.accessibilityLabel : undefined}
        importantForAccessibility={primary ? 'yes' : 'no-hide-descendants'}
        style={[styles.row, { minHeight: rowMin, borderTopWidth: theme.borderWidth.hairline, borderTopColor: theme.color.border }]}
      >
        {cols.map((column, index) => (
          <View key={column.key} style={[styles.cell, cellStyle(column), { marginLeft: columnGap(cols, index) }]}>
            <Text variant="bodyStrong" numberOfLines={1} align={column.kind === 'numeric' ? 'right' : 'left'} style={{ fontVariant: ['tabular-nums'] }}>
              {totals.cells[column.key] ?? ''}
            </Text>
          </View>
        ))}
      </View>
    ) : null;

  if (rows.length === 0) {
    return (
      <View testID={testID} style={{ backgroundColor: surface }}>
        {header(columns)}
        <View style={[styles.row, styles.empty, { minHeight: rowMin }]} accessible accessibilityRole="text" accessibilityLabel={emptyText}>
          <Text variant="body" tone="muted">
            {emptyText}
          </Text>
        </View>
      </View>
    );
  }

  const body = (cols: readonly TableColumn<Row>[], primary: boolean) => (
    <View style={primary && split ? { width: fixedWidth } : styles.grow}>
      {header(cols)}
      {rows.map((row, index) => renderRow(row, index, cols, primary))}
      {totalsRow(cols, primary)}
    </View>
  );

  return (
    <View testID={testID} onLayout={onOuterLayout} style={{ backgroundColor: surface }}>
      {split ? (
        <View style={styles.split}>
          {body(fixed, true)}
          <View style={styles.scrollPane}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollPane}
              testID={testID ? `${testID}-scroll` : undefined}
              onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
              onContentSizeChange={(contentWidth: number) => setContent(contentWidth)}
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {body(rest, false)}
            </ScrollView>
            <EdgeFades overflow={rowOverflow(offset, viewport, content)} color={surface} hintAt="top" testID={testID ? `${testID}-scroll` : undefined} />
          </View>
        </View>
      ) : (
        body(fixed, true)
      )}
      {totals?.ruled ? <BoundaryRule /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row' },
  grow: { flexGrow: 1 },
  scrollPane: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  header: { height: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: TABLE_PADDING_X },
  row: { flexDirection: 'row', alignItems: 'center', minWidth: 44, paddingHorizontal: TABLE_PADDING_X, paddingVertical: space.xs },
  cell: { justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  markerSlot: { height: 24, justifyContent: 'center' },
  flexText: { flexShrink: 1 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  empty: { justifyContent: 'flex-start' },
});

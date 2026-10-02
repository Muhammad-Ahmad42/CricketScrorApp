import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { BoundaryRule } from '../layout/BoundaryRule';
import { space, useTheme, type Theme } from '../theme';
import { Text } from '../typography';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { RowMarkerGlyph, type RowMarker } from './Markers';

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
  readonly scrollable?: boolean;
  readonly testID?: string;
}

function cellStyle<Row>(column: TableColumn<Row>): ViewStyle {
  if (column.kind === 'name') {
    return { flex: 1, minWidth: column.width ?? COLUMN_WIDTH.name };
  }
  return { width: column.width ?? COLUMN_WIDTH.digits2, alignItems: 'flex-end' };
}

function rowSurface(theme: Theme, emphasised: boolean, pressed: boolean): ViewStyle {
  if (pressed) {
    return { backgroundColor: theme.color.surfaceSunken };
  }
  return { backgroundColor: emphasised ? theme.color.accentSubtle : theme.color.surface };
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
        return (
          <View key={column.key} style={[styles.cell, cellStyle(column)]}>
            {index === 0 && marker !== null ? (
              <View style={styles.nameLine}>
                <RowMarkerGlyph marker={marker} />
                <Text variant="body" tone={muted ? 'muted' : 'primary'} weight={marker === 'none' ? undefined : 'semibold'} numberOfLines={1} style={styles.flexText}>
                  {column.value(row)}
                </Text>
              </View>
            ) : (
              <Text
                variant={column.kind === 'numeric' ? 'tableNumeric' : 'body'}
                tone={muted ? 'muted' : 'primary'}
                numberOfLines={1}
                align={column.kind === 'numeric' ? 'right' : 'left'}
              >
                {column.value(row)}
              </Text>
            )}
            {subtext ? (
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                {subtext}
              </Text>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function HeaderCells<Row>({ columns }: { readonly columns: readonly TableColumn<Row>[] }) {
  return (
    <>
      {columns.map((column) => (
        <View key={column.key} style={[styles.cell, cellStyle(column)]}>
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
  scrollable = false,
  testID,
}: TableProps<Row>) {
  const theme = useTheme();
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const hairline = { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border };
  const rowMin = onRowPress ? theme.size.tableRowPressable : theme.size.tableRow;
  const fixed = scrollable ? columns.slice(0, 1) : columns;
  const rest = scrollable ? columns.slice(1) : [];

  const header = (cols: readonly TableColumn<Row>[]) => (
    <View
      style={[styles.header, hairline, { backgroundColor: theme.color.surface }]}
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
    const onLayout = primary && scrollable
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
          rowSurface(theme, emph !== null, pressed && onRowPress !== undefined),
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
        {cols.map((column) => (
          <View key={column.key} style={[styles.cell, cellStyle(column)]}>
            <Text variant="bodyStrong" numberOfLines={1} align={column.kind === 'numeric' ? 'right' : 'left'} style={{ fontVariant: ['tabular-nums'] }}>
              {totals.cells[column.key] ?? ''}
            </Text>
          </View>
        ))}
      </View>
    ) : null;

  if (rows.length === 0) {
    return (
      <View testID={testID} style={{ backgroundColor: theme.color.surface }}>
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
    <View style={primary && scrollable ? styles.fixedColumn : styles.grow}>
      {header(cols)}
      {rows.map((row, index) => renderRow(row, index, cols, primary))}
      {totalsRow(cols, primary)}
    </View>
  );

  return (
    <View testID={testID} style={{ backgroundColor: theme.color.surface }}>
      {scrollable ? (
        <View style={styles.split}>
          {body(fixed, true)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.grow}>
            {body(rest, false)}
          </ScrollView>
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
  fixedColumn: { width: COLUMN_WIDTH.name + space.md * 2 + space.xs },
  grow: { flexGrow: 1 },
  header: { height: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', minWidth: 44, paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.xs },
  cell: { justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flexText: { flexShrink: 1 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  empty: { justifyContent: 'flex-start' },
});

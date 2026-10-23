import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { MANUAL_OVERRIDE_LABEL, QualificationText } from '@/features/shared';
import { Badge, COLUMN_WIDTH, MIN_TEXT_SIZE, TEXT_VARIANTS, Text, space, useGutter, useLayoutClass, useTheme } from '@/ui';
import type { StandingRowVM, StandingsTableVM } from '../selectors/standings';

export const STANDINGS_COLUMNS = ['Pos', 'Team', 'P', 'W', 'L', 'NR', 'Pts', 'NRR'] as const;

export type StandingsColumnKey = 'pos' | 'team' | 'p' | 'w' | 'l' | 't' | 'nr' | 'pts' | 'nrr' | 'delta';

export interface StandingsColumn {
  readonly key: StandingsColumnKey;
  readonly header: string;
  readonly width: number | null;
  readonly value: (row: StandingRowVM) => string;
}

export interface StandingsLayoutOptions {
  readonly width?: number | null;
  readonly fontScale?: number;
  readonly delta?: boolean;
  readonly nrrHeader?: string;
  readonly gutter?: number;
  readonly teamTarget?: number;
}

export const LEAD_GAP = space.xs;
export const NUMERIC_GAP = space.sm;
export const MIN_TEAM_WIDTH = 104;
export const WIDE_TEAM_WIDTH = COLUMN_WIDTH.name + space['2xl'];
export const STANDINGS_DROP_ORDER: readonly StandingsColumnKey[] = ['nr', 't', 'l', 'p'];
const HEADER_HEIGHT = 36;
const CELL_SLACK = 2;
const NARROW_GLYPHS: Readonly<Record<string, number>> = { '.': 0.34, ',': 0.34, ' ': 0.3, I: 0.34, '†': 0.56 };
const WIDE_GLYPHS: Readonly<Record<string, number>> = { W: 1.02, M: 0.94, '▲': 0.8, '▼': 0.8 };
const LABEL_GLYPH = 0.74;
const FIGURE_GLYPH = 0.66;

type MeasuredVariant = 'label' | 'tableNumeric';

function clampScale(fontScale: number, maxScale: number): number {
  return Math.min(Math.max(fontScale, 1), maxScale);
}

function scaled(value: number, fontScale: number): number {
  return Math.round(value * clampScale(fontScale, 1.5));
}

export function cellTextWidth(text: string, variant: MeasuredVariant, fontScale = 1): number {
  const spec = TEXT_VARIANTS[variant];
  const shown = spec.uppercase ? text.toUpperCase() : text;
  const glyphs = [...shown];
  const fallback = variant === 'label' ? LABEL_GLYPH : FIGURE_GLYPH;
  const em = glyphs.reduce((sum, glyph) => sum + (NARROW_GLYPHS[glyph] ?? WIDE_GLYPHS[glyph] ?? fallback), 0);
  const raw = em * spec.size + Math.max(spec.tracking, 0) * glyphs.length;
  return glyphs.length === 0 ? 0 : Math.ceil(raw * clampScale(fontScale, spec.maxScale)) + CELL_SLACK;
}

export function contentWidth(header: string, values: readonly string[], fontScale = 1): number {
  const words = header.split(/\s+/).filter((word) => word.length > 0);
  const head = words.reduce((max, word) => Math.max(max, cellTextWidth(word, 'label', fontScale)), 0);
  return values.reduce((max, value) => Math.max(max, cellTextWidth(value, 'tableNumeric', fontScale)), head);
}

export function teamLabel(row: StandingRowVM, short: boolean): string {
  return short ? row.teamShort : row.team;
}

function sized(key: StandingsColumnKey, header: string, rows: readonly StandingRowVM[], value: (row: StandingRowVM) => string, fontScale: number): StandingsColumn {
  return { key, header, width: contentWidth(header, rows.map(value), fontScale), value };
}

function nrrValue(row: StandingRowVM): string {
  return row.nrrUncertain ? `${row.nrr}†` : row.nrr;
}

function allColumns(rows: readonly StandingRowVM[], showTies: boolean, options: StandingsLayoutOptions, short: boolean): StandingsColumn[] {
  const fontScale = options.fontScale ?? 1;
  const columns: StandingsColumn[] = [
    sized('pos', 'Pos', rows, (row) => row.position, fontScale),
    { key: 'team', header: 'Team', width: null, value: (row) => teamLabel(row, short) },
    sized('p', 'P', rows, (row) => String(row.played), fontScale),
    sized('w', 'W', rows, (row) => String(row.won), fontScale),
    sized('l', 'L', rows, (row) => String(row.lost), fontScale),
  ];
  if (showTies) {
    columns.push(sized('t', 'T', rows, (row) => String(row.tied), fontScale));
  }
  columns.push(
    sized('nr', 'NR', rows, (row) => String(row.noResult), fontScale),
    sized('pts', 'Pts', rows, (row) => String(row.points), fontScale),
    sized('nrr', options.nrrHeader ?? 'NRR', rows, nrrValue, fontScale),
  );
  if (options.delta) {
    columns.push(sized('delta', 'Move', rows, (row) => row.delta ?? '–', fontScale));
  }
  return columns;
}

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
  return numeric(columns).reduce((sum, column) => sum + (column.width ?? 0) + NUMERIC_GAP, 0);
}

function fixedWidth(columns: readonly StandingsColumn[], gutter: number): number {
  return posWidth(columns) + LEAD_GAP + numericWidth(columns) + gutter * 2;
}

export function teamColumnWidth(columns: readonly StandingsColumn[], width: number, gutter: number = space.md): number {
  return width - fixedWidth(columns, gutter);
}

export interface StandingsLayout {
  readonly columns: readonly StandingsColumn[];
  readonly short: boolean;
  readonly dropped: readonly StandingsColumnKey[];
}

export function standingsLayout(rows: readonly StandingRowVM[], showTies: boolean, options: StandingsLayoutOptions = {}): StandingsLayout {
  const width = options.width ?? null;
  let columns = allColumns(rows, showTies, options, false);
  if (width === null) {
    return { columns, short: false, dropped: [] };
  }
  const fontScale = options.fontScale ?? 1;
  const minTeam = scaled(MIN_TEAM_WIDTH, fontScale);
  const target = Math.max(minTeam, scaled(options.teamTarget ?? MIN_TEAM_WIDTH, fontScale));
  const gutter = options.gutter ?? space.md;
  const dropped: StandingsColumnKey[] = [];
  for (const key of STANDINGS_DROP_ORDER) {
    if (teamColumnWidth(columns, width, gutter) >= target) {
      break;
    }
    if (columns.some((column) => column.key === key)) {
      columns = columns.filter((column) => column.key !== key);
      dropped.push(key);
    }
  }
  const short = teamColumnWidth(columns, width, gutter) < minTeam;
  if (short) {
    const keep = new Set(columns.map((column) => column.key));
    columns = allColumns(rows, showTies, options, true).filter((column) => keep.has(column.key));
  }
  return { columns, short, dropped };
}

export function standingsColumns(rows: readonly StandingRowVM[], showTies: boolean, options: StandingsLayoutOptions = {}): readonly StandingsColumn[] {
  return standingsLayout(rows, showTies, options).columns;
}

export function useMeasuredWidth(): readonly [number, (event: LayoutChangeEvent) => void] {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== measured) {
      setMeasured(next);
    }
  };
  return [measured ?? window.width, onLayout] as const;
}

export function useStandingsLayout(
  rows: readonly StandingRowVM[],
  showTies: boolean,
  width: number,
  options: Omit<StandingsLayoutOptions, 'width' | 'fontScale' | 'gutter' | 'teamTarget'> = {},
): StandingsLayout {
  const window = useWindowDimensions();
  const layoutClass = useLayoutClass();
  const scroll = useStandingsScroll();
  const gutter = useGutter();
  const wide = layoutClass.width === 'medium' || layoutClass.width === 'expanded';
  return standingsLayout(rows, showTies, {
    ...options,
    width: scroll ? null : width,
    fontScale: window.fontScale,
    gutter,
    teamTarget: wide ? WIDE_TEAM_WIDTH : MIN_TEAM_WIDTH,
  });
}

interface ScrollFrame {
  readonly scrollX: Animated.Value;
  readonly viewport: number;
  readonly teamWidth: number;
}

const ScrollFrameContext = createContext<ScrollFrame | null>(null);

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
  const gutter = useGutter();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState<number | null>(null);
  const viewport = measured ?? window.width;
  const teamWidth = Math.round(COLUMN_WIDTH.name * Math.min(window.fontScale, 1.5));
  const content = gutter + posWidth(columns) + LEAD_GAP + teamWidth + numericWidth(columns) + gutter;
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

function leadStyle(frame: ScrollFrame | null, columns: readonly StandingsColumn[], gutter: number): ViewStyle {
  if (frame === null) {
    return { flex: 1, minWidth: 0, paddingLeft: gutter };
  }
  return { width: gutter + posWidth(columns) + LEAD_GAP + frame.teamWidth, paddingLeft: gutter };
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
  const gutter = useGutter();
  const frame = useContext(ScrollFrameContext);
  const label = (column: StandingsColumn) => (
    <View key={column.key} style={cellStyle(column)}>
      <Text variant="label" tone="secondary" align={column.key === 'team' || column.key === 'pos' ? 'left' : 'right'} testID={testID ? `${testID}-${column.key}` : undefined}>
        {column.header}
      </Text>
    </View>
  );
  return (
    <View
      testID={testID}
      style={[
        styles.header,
        { minHeight: HEADER_HEIGHT, paddingRight: gutter, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Sticky style={[styles.lead, leadStyle(frame, columns, gutter), frame ? { backgroundColor: theme.color.surface } : null]}>{lead(columns).map(label)}</Sticky>
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
  readonly deltaTestID?: string;
}

function AdjustmentLine({ row, testID }: { readonly row: StandingRowVM; readonly testID: string }) {
  if (row.adjustment === null) {
    return null;
  }
  const parts = [`${row.adjustment.amount} pts`, ...row.adjustment.reasons];
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

function spokenDelta(delta: string | null | undefined): string {
  if (!delta || delta === '–') {
    return 'No change';
  }
  return delta.startsWith('▲') ? `Up ${delta.slice(1)}` : `Down ${delta.slice(1)}`;
}

export function StandingsRow({ row, ordinal, tableKey, columns, compact = false, testIDPrefix = 'standings', deltaTestID }: StandingsRowProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const frame = useContext(ScrollFrameContext);
  const id = `${tableKey}-${ordinal}`;
  const qualified = row.qualification?.state === 'qualified';
  const mark = compact ? compactMark(row) : null;
  const detailWidth = frame ? { width: frame.viewport - gutter } : null;
  const detailInset = { paddingLeft: gutter + posWidth(columns) + LEAD_GAP };
  const hasDetail = !compact && (row.qualification !== null || row.adjustment !== null);
  const base = row.delta !== undefined ? `${row.accessibilityLabel} ${spokenDelta(row.delta)}.` : row.accessibilityLabel;
  const spoken = compact || row.qualification === null ? null : (row.qualification.headline ?? row.qualification.condition);
  const label = spoken ? `${base} ${spoken}.` : base;
  return (
    <View
      testID={`${testIDPrefix}-row-${id}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.row, { paddingRight: gutter, backgroundColor: theme.color.surface, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
    >
      <View style={styles.cells}>
        <Sticky style={[styles.lead, leadStyle(frame, columns, gutter), frame ? { backgroundColor: theme.color.surface } : null]}>
          {lead(columns).map((column) => (
            <View key={column.key} style={cellStyle(column)}>
              {column.key === 'team' ? (
                <View style={styles.teamCell}>
                  <Text
                    variant="body"
                    tone={row.muted ? 'muted' : 'primary'}
                    weight={qualified ? 'semibold' : undefined}
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
              weight={column.key === 'pts' ? 'semibold' : undefined}
              align="right"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={MIN_TEXT_SIZE / TEXT_VARIANTS.tableNumeric.size}
              testID={column.key === 'delta' && deltaTestID ? deltaTestID : `${testIDPrefix}-cell-${id}-${column.key}`}
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
              explanation={row.qualification.condition ?? ''}
              spokenExplanation={row.qualification.explanation}
              manual={row.qualification.manual}
              detail={row.remaining}
              whyTitle={row.team}
              explanationTestID={`${testIDPrefix}-text-qual-${id}`}
              badgeTestID={`${testIDPrefix}-badge-qual-${id}`}
              concise
            />
          ) : null}
          <AdjustmentLine row={row} testID={`${testIDPrefix}-badge-adjust-${id}`} />
        </Sticky>
      ) : null}
      {qualified ? <Sticky style={[styles.bar, { width: theme.borderWidth.bar, backgroundColor: theme.color.success }]} /> : null}
    </View>
  );
}

export interface StandingsTableProps {
  readonly table: StandingsTableVM;
  readonly compact?: boolean;
  readonly testIDPrefix?: string;
  readonly maxRows?: number;
  readonly delta?: boolean;
  readonly nrrHeader?: string;
  readonly deltaTestID?: (ordinal: number) => string;
}

export function StandingsTable({ table, compact = false, testIDPrefix = 'standings', maxRows, delta = false, nrrHeader, deltaTestID }: StandingsTableProps) {
  const scroll = useStandingsScroll();
  const [width, onLayout] = useMeasuredWidth();
  const rows = maxRows === undefined ? table.rows : table.rows.slice(0, maxRows);
  const layout = useStandingsLayout(table.rows, table.showTies, width, { delta, nrrHeader });
  const body = (
    <View>
      <StandingsHeader columns={layout.columns} testID={`${testIDPrefix}-header-${table.key}`} />
      {rows.map((row, position) => (
        <StandingsRow
          key={row.key}
          row={row}
          ordinal={position + 1}
          tableKey={table.key}
          columns={layout.columns}
          compact={compact}
          testIDPrefix={testIDPrefix}
          deltaTestID={deltaTestID?.(position + 1)}
        />
      ))}
    </View>
  );
  return (
    <View onLayout={onLayout} testID={`${testIDPrefix}-table-${table.key}`}>
      {scroll ? <StandingsScroller columns={layout.columns}>{body}</StandingsScroller> : body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  raised: { zIndex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: space.xs, gap: NUMERIC_GAP },
  row: { paddingVertical: space.xs, minHeight: 44, justifyContent: 'center', gap: space.xxs },
  cells: { flexDirection: 'row', alignItems: 'center', gap: NUMERIC_GAP },
  lead: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: LEAD_GAP },
  flexCell: { flex: 1, minWidth: 0 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  teamText: { flexShrink: 1 },
  details: { gap: space.xxs },
  adjustment: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  adjustmentText: { flexShrink: 1 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});

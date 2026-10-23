import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { BallChip, BoundaryRule, COLUMN_WIDTH, Inset, PressableRow, SectionHeader, Table, Text, space, useGutter, type TableColumn } from '@/ui';
import type { BattingRowVM, BowlingRowVM, InningsCardVM, OverRowVM } from '../selectors/innings';

export type CardDensity = 'full' | 'phone' | 'compact';

export const PHONE_CARD_WIDTH = 360;
export const FULL_CARD_WIDTH = 520;

export const COLUMN_SCALE_MAX = 1.5;

export function columnScale(fontScale: number): number {
  return Math.min(Math.max(1, fontScale), COLUMN_SCALE_MAX);
}

export function densityFor(width: number, scale = 1): CardDensity {
  const room = width / Math.max(1, scale);
  if (room >= FULL_CARD_WIDTH) {
    return 'full';
  }
  return room >= PHONE_CARD_WIDTH ? 'phone' : 'compact';
}

const NAME_MIN = 96;
const RATE_WIDTH = 64;

export function battingColumns(density: CardDensity, scale = 1): readonly TableColumn<BattingRowVM>[] {
  const tight = density !== 'full';
  const w = (width: number) => Math.ceil(width * scale);
  const name: TableColumn<BattingRowVM> = {
    key: 'name',
    header: 'Batter',
    kind: 'name',
    width: w(NAME_MIN),
    value: (row) => row.name,
    subtext: (row) => (density === 'compact' ? [row.dismissal, row.boundaries].filter((part): part is string => part !== null && part !== '').join(' · ') : row.dismissal) || null,
  };
  const runs: TableColumn<BattingRowVM> = { key: 'runs', header: 'R', kind: 'numeric', width: w(tight ? 32 : COLUMN_WIDTH.digits3), value: (row) => row.runs };
  const balls: TableColumn<BattingRowVM> = { key: 'balls', header: 'B', kind: 'numeric', width: w(tight ? 32 : COLUMN_WIDTH.digits3), value: (row) => row.balls };
  const fours: TableColumn<BattingRowVM> = { key: 'fours', header: '4s', kind: 'numeric', width: w(tight ? 24 : COLUMN_WIDTH.digits2), value: (row) => row.fours };
  const sixes: TableColumn<BattingRowVM> = { key: 'sixes', header: '6s', kind: 'numeric', width: w(tight ? 24 : COLUMN_WIDTH.digits2), value: (row) => row.sixes };
  const rate: TableColumn<BattingRowVM> = { key: 'sr', header: 'SR', kind: 'numeric', width: w(RATE_WIDTH), value: (row) => row.strikeRate };
  return density === 'compact' ? [name, runs, balls, rate] : [name, runs, balls, fours, sixes, rate];
}

export function bowlingColumns(density: CardDensity, scale = 1): readonly TableColumn<BowlingRowVM>[] {
  const tight = density !== 'full';
  const w = (width: number) => Math.ceil(width * scale);
  const name: TableColumn<BowlingRowVM> = {
    key: 'name',
    header: 'Bowler',
    kind: 'name',
    width: w(NAME_MIN),
    value: (row) => row.name,
    subtext: (row) => {
      if (density === 'full') {
        return null;
      }
      const maidens = density === 'compact' && row.maidens !== '0' ? `${row.maidens} ${row.maidens === '1' ? 'maiden' : 'maidens'}` : null;
      return [maidens, row.extrasNote].filter((part): part is string => part !== null).join(' · ') || null;
    },
  };
  const overs: TableColumn<BowlingRowVM> = { key: 'overs', header: 'O', kind: 'numeric', width: w(tight ? 36 : COLUMN_WIDTH.digits3), value: (row) => row.overs };
  const maidens: TableColumn<BowlingRowVM> = { key: 'maidens', header: 'M', kind: 'numeric', width: w(tight ? 24 : COLUMN_WIDTH.digits2), value: (row) => row.maidens };
  const runs: TableColumn<BowlingRowVM> = { key: 'runs', header: 'R', kind: 'numeric', width: w(tight ? 32 : COLUMN_WIDTH.digits3), value: (row) => row.runs };
  const wickets: TableColumn<BowlingRowVM> = { key: 'wickets', header: 'W', kind: 'numeric', width: w(tight ? 24 : COLUMN_WIDTH.digits2), value: (row) => row.wickets };
  const econ: TableColumn<BowlingRowVM> = { key: 'econ', header: 'Econ', kind: 'numeric', width: w(RATE_WIDTH), value: (row) => row.economy };
  const wides: TableColumn<BowlingRowVM> = { key: 'wd', header: 'WD', kind: 'numeric', width: w(COLUMN_WIDTH.digits2), value: (row) => row.wides };
  const noBalls: TableColumn<BowlingRowVM> = { key: 'nb', header: 'NB', kind: 'numeric', width: w(COLUMN_WIDTH.digits2), value: (row) => row.noBalls };
  if (density === 'full') {
    return [name, overs, maidens, runs, wickets, econ, wides, noBalls];
  }
  return density === 'phone' ? [name, overs, maidens, runs, wickets, econ] : [name, overs, runs, wickets, econ];
}

export interface InningsCardProps {
  readonly vm: InningsCardVM;
  readonly compact?: boolean;
  readonly maxOvers?: number;
  readonly onOverPress?: (over: OverRowVM) => void;
  readonly testID?: string;
}

function OverLine({ over, onPress }: { readonly over: OverRowVM; readonly onPress?: () => void }) {
  return (
    <PressableRow
      testID={`scorecard-over-${over.overNumber}`}
      accessibilityLabel={over.accessibilityLabel}
      accessibilityHint="Opens this over in the ball by ball log"
      onPress={onPress}
      gap="xs"
      compact
    >
      <Text variant="tableNumeric" tone="secondary" style={styles.overNumber}>
        {over.overNumber}
      </Text>
      <View style={styles.chips}>
        {over.chips.map((chip, index) => (
          <BallChip key={`${over.key}-${index}`} text={chip.text} kind={chip.kind} isFreeHit={chip.isFreeHit} accessibilityLabel={chip.accessibilityLabel} size="sm" />
        ))}
      </View>
      <Text variant="tableNumeric" align="right" style={styles.overRuns}>
        {over.runs}
      </Text>
      <Text variant="tableNumeric" tone="secondary" align="right" style={styles.overScore}>
        {over.scoreAtEnd}
      </Text>
    </PressableRow>
  );
}

export function InningsCard({ vm, compact = false, maxOvers, onOverPress, testID = 'scorecard-innings' }: InningsCardProps) {
  const window = useWindowDimensions();
  const gutter = useGutter();
  const lineStyle = [styles.line, { paddingHorizontal: gutter }];
  const [width, setWidth] = useState<number | null>(null);
  const overs = maxOvers === undefined ? vm.overs : vm.overs.slice(0, maxOvers);
  const scale = columnScale(window.fontScale);
  const measured = densityFor(width ?? window.width, scale);
  const density: CardDensity = compact && measured === 'full' ? 'phone' : measured;
  return (
    <View testID={testID} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      <SectionHeader title={vm.title} />
      <Table
        columns={battingColumns(density, scale)}
        rows={vm.batting}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={(row) => row.accessibilityLabel}
        emphasis={vm.inProgress ? (row) => (row.isStriker ? { marker: 'striker' } : null) : undefined}
        rowTestID={(row) => `scorecard-batter-${row.key}`}
        emptyText="No batting yet"
        testID={`${testID}-batting`}
      />
      <View style={lineStyle} accessible accessibilityLabel={`${vm.extrasLine}, ${vm.extrasTotal}`}>
        <Text variant="subhead" tone="secondary" style={styles.flex}>
          {vm.extrasLine}
        </Text>
        <Text variant="tableNumeric">{vm.extrasTotal}</Text>
      </View>
      <BoundaryRule />
      <View style={lineStyle} accessible accessibilityLabel={`${vm.totalLine}, ${vm.total}`} testID={`${testID}-total`}>
        <Text variant="bodyStrong" style={styles.flex}>
          {vm.totalLine}
        </Text>
        <Text variant="scoreMedium" tone="score">
          {vm.total}
        </Text>
      </View>
      {vm.didNotBat ? (
        <Inset top="xxs" bottom="xxs">
          <Text variant="footnote" tone="secondary">
            {`${vm.inProgress ? 'Yet to bat' : 'Did not bat'}: ${vm.didNotBat}`}
          </Text>
        </Inset>
      ) : null}
      {vm.absent ? (
        <Inset top="xxs" bottom="xxs">
          <Text variant="footnote" tone="secondary" testID={`${testID}-absent`}>
            {`Absent: ${vm.absent}`}
          </Text>
        </Inset>
      ) : null}
      {vm.fallOfWickets ? (
        <>
          <SectionHeader title="Fall of wickets" />
          <Inset top="xxs" bottom="xxs">
            <Text variant="subhead" testID={`${testID}-fow`}>
              {vm.fallOfWickets}
            </Text>
          </Inset>
        </>
      ) : null}
      <SectionHeader title="Bowling" />
      <Table
        columns={bowlingColumns(density, scale)}
        rows={vm.bowling}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={(row) => row.accessibilityLabel}
        emphasis={vm.inProgress ? (row) => (row.isCurrent ? { marker: 'bowler' } : null) : undefined}
        rowTestID={(row) => `scorecard-bowler-${row.key}`}
        emptyText="No bowling yet"
        testID={`${testID}-bowling`}
      />
      {vm.partnerships.length > 0 ? (
        <>
          <SectionHeader title="Partnerships" />
          {vm.partnerships.map((partnership) => (
            <View key={partnership.key} style={lineStyle} accessible accessibilityLabel={partnership.accessibilityLabel}>
              <Text variant="subhead" tone="secondary" style={styles.wicketLabel}>
                {partnership.wicketLabel}
              </Text>
              <Text variant="body" style={styles.flex}>
                {partnership.batters}
              </Text>
              <Text variant="tableNumeric">{partnership.text}</Text>
            </View>
          ))}
        </>
      ) : null}
      {overs.length > 0 ? (
        <>
          <SectionHeader title="Overs" />
          {overs.map((over) => (
            <OverLine key={over.key} over={over} onPress={onOverPress ? () => onOverPress(over) : undefined} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingVertical: space.xxs },
  flex: { flex: 1, minWidth: 0 },
  wicketLabel: { minWidth: 64 },
  overNumber: { minWidth: 28 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs },
  overRuns: { minWidth: 32 },
  overScore: { minWidth: 56 },
});

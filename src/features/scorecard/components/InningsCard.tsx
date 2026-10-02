import { Pressable, StyleSheet, View } from 'react-native';
import { BallChip, BoundaryRule, COLUMN_WIDTH, SectionHeader, Table, Text, space, useTheme, type TableColumn } from '@/ui';
import type { BattingRowVM, BowlingRowVM, InningsCardVM, OverRowVM } from '../selectors/innings';

const BATTING_FULL: readonly TableColumn<BattingRowVM>[] = [
  { key: 'name', header: 'Batter', kind: 'name', value: (row) => row.name, subtext: (row) => row.dismissal || null },
  { key: 'runs', header: 'R', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.runs },
  { key: 'balls', header: 'B', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.balls },
  { key: 'fours', header: '4s', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.fours },
  { key: 'sixes', header: '6s', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.sixes },
  { key: 'sr', header: 'SR', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.strikeRate },
];

const BATTING_COMPACT = BATTING_FULL.filter((column) => column.key !== 'fours' && column.key !== 'sixes');

const BOWLING_FULL: readonly TableColumn<BowlingRowVM>[] = [
  { key: 'name', header: 'Bowler', kind: 'name', value: (row) => row.name },
  { key: 'overs', header: 'O', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.overs },
  { key: 'maidens', header: 'M', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.maidens },
  { key: 'runs', header: 'R', kind: 'numeric', width: COLUMN_WIDTH.digits3, value: (row) => row.runs },
  { key: 'wickets', header: 'W', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.wickets },
  { key: 'econ', header: 'Econ', kind: 'numeric', width: COLUMN_WIDTH.decimal, value: (row) => row.economy },
  { key: 'wd', header: 'WD', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.wides },
  { key: 'nb', header: 'NB', kind: 'numeric', width: COLUMN_WIDTH.digits2, value: (row) => row.noBalls },
];

const BOWLING_COMPACT = BOWLING_FULL.filter((column) => column.key !== 'wd' && column.key !== 'nb');

export interface InningsCardProps {
  readonly vm: InningsCardVM;
  readonly compact?: boolean;
  readonly maxOvers?: number;
  readonly onOverPress?: (over: OverRowVM) => void;
  readonly testID?: string;
}

function OverLine({ over, onPress }: { readonly over: OverRowVM; readonly onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`scorecard-over-${over.overNumber}`}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={over.accessibilityLabel}
      accessibilityHint={onPress ? 'Opens this over in the ball by ball log' : undefined}
      disabled={onPress === undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.overLine,
        { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border },
        pressed ? { backgroundColor: theme.color.surfaceSunken } : null,
      ]}
    >
      <Text variant="tableNumeric" tone="secondary" style={styles.overNumber}>
        {over.overNumber}
      </Text>
      <View style={styles.chips}>
        {over.chips.map((chip, index) => (
          <BallChip key={`${over.key}-${index}`} text={chip.text} kind={chip.kind} isFreeHit={chip.isFreeHit} accessibilityLabel={chip.accessibilityLabel} size="sm" />
        ))}
      </View>
      <Text variant="tableNumeric" style={styles.overRuns}>
        {over.runs}
      </Text>
      <Text variant="tableNumeric" tone="secondary" style={styles.overScore}>
        {over.scoreAtEnd}
      </Text>
    </Pressable>
  );
}

export function InningsCard({ vm, compact = false, maxOvers, onOverPress, testID = 'scorecard-innings' }: InningsCardProps) {
  const overs = maxOvers === undefined ? vm.overs : vm.overs.slice(0, maxOvers);
  return (
    <View testID={testID}>
      <SectionHeader title={vm.title} />
      <Table
        columns={compact ? BATTING_COMPACT : BATTING_FULL}
        rows={vm.batting}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={(row) => row.accessibilityLabel}
        emphasis={(row) => (row.isStriker ? { marker: 'striker' } : null)}
        rowTestID={(row) => `scorecard-batter-${row.key}`}
        emptyText="No batting yet"
        testID={`${testID}-batting`}
      />
      <View style={styles.line} accessible accessibilityLabel={`${vm.extrasLine}, ${vm.extrasTotal}`}>
        <Text variant="subhead" tone="secondary" style={styles.flex}>
          {vm.extrasLine}
        </Text>
        <Text variant="tableNumeric">{vm.extrasTotal}</Text>
      </View>
      <BoundaryRule />
      <View style={styles.line} accessible accessibilityLabel={`${vm.totalLine}, ${vm.total}`} testID={`${testID}-total`}>
        <Text variant="bodyStrong" style={styles.flex}>
          {vm.totalLine}
        </Text>
        <Text variant="scoreMedium" tone="score">
          {vm.total}
        </Text>
      </View>
      {vm.didNotBat ? (
        <Text variant="footnote" tone="secondary" style={styles.note}>
          {`${vm.inProgress ? 'Yet to bat' : 'Did not bat'}: ${vm.didNotBat}`}
        </Text>
      ) : null}
      {vm.absent ? (
        <Text variant="footnote" tone="secondary" style={styles.note} testID={`${testID}-absent`}>
          {`Absent: ${vm.absent}`}
        </Text>
      ) : null}
      {vm.fallOfWickets ? (
        <>
          <SectionHeader title="Fall of wickets" />
          <Text variant="subhead" style={styles.note} testID={`${testID}-fow`}>
            {vm.fallOfWickets}
          </Text>
        </>
      ) : null}
      <SectionHeader title="Bowling" />
      <Table
        columns={compact ? BOWLING_COMPACT : BOWLING_FULL}
        rows={vm.bowling}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={(row) => row.accessibilityLabel}
        emphasis={(row) => (row.isCurrent ? { marker: 'bowler' } : null)}
        rowTestID={(row) => `scorecard-bowler-${row.key}`}
        emptyText="No bowling yet"
        testID={`${testID}-bowling`}
      />
      {vm.partnerships.length > 0 ? (
        <>
          <SectionHeader title="Partnerships" />
          {vm.partnerships.map((partnership) => (
            <View key={partnership.key} style={styles.line} accessible accessibilityLabel={partnership.accessibilityLabel}>
              <Text variant="subhead" tone="secondary" style={styles.wicketLabel}>
                {partnership.wicketLabel}
              </Text>
              <Text variant="body" style={styles.flex} numberOfLines={1}>
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
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  flex: { flex: 1 },
  note: { paddingHorizontal: space.md, paddingVertical: space.xxs },
  wicketLabel: { width: 64 },
  overLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, minHeight: 48 },
  overNumber: { width: 28 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs },
  overRuns: { width: 32, textAlign: 'right' },
  overScore: { width: 56, textAlign: 'right' },
});

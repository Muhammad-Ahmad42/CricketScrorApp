import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeader } from '../layout/SectionHeader';
import { space, useTheme, type ColorToken } from '../theme';
import { Text } from '../typography';

export interface LegendItem {
  readonly label: string;
  readonly color: ColorToken;
  readonly dashed: boolean;
}

export interface ChartFrameProps {
  readonly title: string;
  readonly accessibilityLabel: string;
  readonly legend?: readonly LegendItem[];
  readonly chart: ReactNode;
  readonly table: ReactNode;
  readonly testID?: string;
}

export function Legend({ items }: { readonly items: readonly LegendItem[] }) {
  const theme = useTheme();
  return (
    <View style={styles.legend} accessible={false} importantForAccessibility="no-hide-descendants">
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={styles.swatch}>
            {item.dashed ? (
              <>
                <View style={[styles.dash, { backgroundColor: theme.color[item.color] }]} />
                <View style={[styles.dash, { backgroundColor: theme.color[item.color] }]} />
              </>
            ) : (
              <View style={[styles.solid, { backgroundColor: theme.color[item.color] }]} />
            )}
          </View>
          <Text variant="footnote" tone="secondary">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ChartFrame({ title, accessibilityLabel, legend, chart, table, testID }: ChartFrameProps) {
  const theme = useTheme();
  const [asTable, setAsTable] = useState(false);
  return (
    <View testID={testID} style={{ backgroundColor: theme.color.surface }}>
      <SectionHeader
        title={title}
        action={{
          label: asTable ? 'Show as chart' : 'Show as table',
          onPress: () => setAsTable((value) => !value),
          testID: testID ? `${testID}-btn-toggle` : undefined,
        }}
      />
      {asTable ? (
        table
      ) : (
        <View style={styles.chartArea}>
          <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
            {chart}
          </View>
          {legend && legend.length > 0 ? <Legend items={legend} /> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 20, flexDirection: 'row', justifyContent: 'space-between' },
  solid: { width: 20, height: 2 },
  dash: { width: 8, height: 2 },
});

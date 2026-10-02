import { StyleSheet, View } from 'react-native';
import { Button, Icon, SectionHeader, Text, space, useTheme } from '@/ui';
import type { CheckResultVM } from '../selectors/diagnostics';

export interface IntegrityCheckPanelProps {
  readonly result: CheckResultVM | null;
  readonly running: boolean;
  readonly onRun: () => void;
}

export function IntegrityCheckPanel({ result, running, onRun }: IntegrityCheckPanelProps) {
  const theme = useTheme();
  return (
    <>
      <SectionHeader title="Checks" />
      <View style={[styles.body, { backgroundColor: theme.color.surface }]}>
        <Text variant="footnote" tone="secondary">
          Checks that every match, team and tournament still points to the right records, and replays every match. It changes nothing.
        </Text>
        <Button
          label="Check data links"
          variant="secondary"
          icon="search"
          onPress={onRun}
          loading={running}
          disabled={running}
          testID="diag-btn-fk-check"
        />
        {result ? (
          <View style={styles.result} accessible accessibilityLabel={`${result.message} ${result.checkedAt}`}>
            <Icon name={result.healthy ? 'circle-check' : 'triangle-alert'} size={20} color={result.healthy ? 'success' : 'warning'} />
            <View style={styles.resultText}>
              <Text variant="body" testID="diag-text-fk-result">
                {result.message}
              </Text>
              <Text variant="footnote" tone="secondary" testID="diag-text-last-check">
                {result.checkedAt}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm, alignItems: 'flex-start' },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, alignSelf: 'stretch' },
  resultText: { flex: 1, gap: space.xxs },
});

import { StyleSheet, View } from 'react-native';
import { Button, Icon, SectionHeader, Text, space } from '@/ui';
import { COPY } from '../copy';
import type { CheckResultVM } from '../selectors/diagnostics';
import { Block } from './Block';

export interface IntegrityCheckPanelProps {
  readonly result: CheckResultVM | null;
  readonly running: boolean;
  readonly onRun: () => void;
}

function spoken(result: CheckResultVM): string {
  return [result.headline, result.supporting, result.checkedAt]
    .filter((part): part is string => part !== null)
    .map((part) => (part.endsWith('.') ? part : `${part}.`))
    .join(' ');
}

export function IntegrityCheckPanel({ result, running, onRun }: IntegrityCheckPanelProps) {
  return (
    <>
      <SectionHeader title="Checks" />
      <Block gap="sm" align="start">
        <Button
          label="Check data"
          variant="secondary"
          icon="search"
          onPress={onRun}
          loading={running}
          disabled={running}
          accessibilityHint={COPY.checkHint}
          testID="diag-btn-fk-check"
        />
        {result ? (
          <View style={styles.result} accessible accessibilityLabel={spoken(result)}>
            <Icon name={result.healthy ? 'circle-check' : 'triangle-alert'} size={20} color={result.healthy ? 'success' : 'warning'} />
            <View style={styles.resultText}>
              <Text variant="bodyStrong" testID="diag-text-fk-result">
                {result.headline}
              </Text>
              {result.supporting ? (
                <Text variant="footnote" tone="secondary" testID="diag-text-fk-detail">
                  {result.supporting}
                </Text>
              ) : null}
              <Text variant="footnote" tone="secondary" testID="diag-text-last-check">
                {result.checkedAt}
              </Text>
            </View>
          </View>
        ) : null}
      </Block>
    </>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, alignSelf: 'stretch' },
  resultText: { flex: 1, minWidth: 0, gap: space.xxs },
});

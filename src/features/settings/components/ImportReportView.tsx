import { StyleSheet, View } from 'react-native';
import { Button, Icon, SectionHeader, Text, space } from '@/ui';
import type { ImportReportLines } from '../selectors/importReport';
import { Block } from './Block';

export interface ImportReportViewProps {
  readonly lines: ImportReportLines;
}

export function ImportReportView({ lines }: ImportReportViewProps) {
  const label = lines.supporting ? `${lines.headline}. ${lines.supporting}.` : `${lines.headline}.`;
  return (
    <View testID="import-group-report">
      <SectionHeader title="Import finished" />
      <Block direction="row" align="start" gap="xs" accessible accessibilityRole="summary" accessibilityLabel={label}>
        <Icon name="circle-check" size={20} color="success" />
        <View style={styles.text}>
          <Text variant="bodyStrong" testID="import-text-report">
            {lines.headline}
          </Text>
          {lines.supporting ? (
            <Text variant="footnote" tone="secondary" testID="import-text-report-skipped">
              {lines.supporting}
            </Text>
          ) : null}
        </View>
      </Block>
    </View>
  );
}

export interface ImportReportActionProps {
  readonly onDone: () => void;
}

export function ImportReportAction({ onDone }: ImportReportActionProps) {
  return <Button label="Done" variant="secondary" onPress={onDone} fullWidth testID="import-btn-done" />;
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: space.xxs },
});

import { StyleSheet, View } from 'react-native';
import { Button, Icon, SectionHeader, Text, space, useTheme } from '@/ui';

export interface ImportReportViewProps {
  readonly text: string;
}

export function ImportReportView({ text }: ImportReportViewProps) {
  const theme = useTheme();
  return (
    <View testID="import-group-report">
      <SectionHeader title="Import finished" />
      <View style={[styles.body, { backgroundColor: theme.color.surface }]} accessible accessibilityRole="summary" accessibilityLabel={text}>
        <Icon name="circle-check" size={20} color="success" />
        <Text variant="body" style={styles.text} testID="import-text-report">
          {text}
        </Text>
      </View>
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
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
  text: { flex: 1 },
});

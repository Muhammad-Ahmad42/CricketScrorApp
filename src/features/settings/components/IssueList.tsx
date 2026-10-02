import { StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';
import type { IssueVM } from '../selectors/importPreview';

export interface IssueListProps {
  readonly issues: readonly IssueVM[];
}

export function IssueList({ issues }: IssueListProps) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.color.surface }}>
      {issues.map((issue, index) => (
        <View key={issue.key}>
          <View style={styles.row} accessible accessibilityLabel={`${issue.severityLabel}: ${issue.message}`} testID={`import-row-issue-${index + 1}`}>
            <Icon name={issue.severity === 'error' ? 'circle-alert' : 'triangle-alert'} size={20} color={issue.severity === 'error' ? 'danger' : 'warning'} />
            <View style={styles.text}>
              <Text variant="label" tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                {issue.severityLabel}
              </Text>
              <Text variant="body">{issue.message}</Text>
            </View>
          </View>
          <Separator inset={space.md} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  text: { flex: 1, gap: space.xxs },
});

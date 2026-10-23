import { StyleSheet, View } from 'react-native';
import { Icon, Text, space } from '@/ui';
import type { IssueVM } from '../selectors/importPreview';
import { Block } from './Block';

export interface IssueListProps {
  readonly issues: readonly IssueVM[];
  readonly offset?: number;
}

export function IssueList({ issues, offset = 0 }: IssueListProps) {
  return (
    <>
      {issues.map((issue, index) => (
        <Block
          key={issue.key}
          direction="row"
          align="start"
          gap="sm"
          compact
          separator={index < issues.length - 1}
          accessible
          accessibilityLabel={`${issue.severityLabel}: ${issue.message}`}
          testID={`import-row-issue-${offset + index + 1}`}
        >
          <Icon name={issue.severity === 'error' ? 'circle-alert' : 'triangle-alert'} size={20} color={issue.severity === 'error' ? 'danger' : 'warning'} />
          <View style={styles.text}>
            <Text variant="body">{issue.headline}</Text>
            {issue.supporting ? (
              <Text variant="footnote" tone="secondary">
                {issue.supporting}
              </Text>
            ) : null}
          </View>
        </Block>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: space.xxs },
});

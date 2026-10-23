import { StyleSheet, View } from 'react-native';
import { Icon, Text, space } from '@/ui';
import type { ConflictVM } from '../selectors/importPreview';
import { Block } from './Block';

export interface ConflictListProps {
  readonly conflicts: readonly ConflictVM[];
}

export function ConflictList({ conflicts }: ConflictListProps) {
  return (
    <>
      {conflicts.map((conflict, index) => (
        <Block
          key={conflict.key}
          direction="row"
          align={conflict.detail ? 'start' : 'center'}
          gap="sm"
          compact
          separator={index < conflicts.length - 1}
          accessible
          accessibilityLabel={conflict.detail ? `${conflict.title}, ${conflict.detail}` : conflict.title}
          testID={`import-row-conflict-${index + 1}`}
        >
          <Icon name={conflict.losesLocalData ? 'triangle-alert' : 'info'} size={20} color={conflict.losesLocalData ? 'warning' : 'textSecondary'} />
          <View style={styles.text}>
            <Text variant="body">{conflict.title}</Text>
            {conflict.detail ? (
              <Text variant="footnote" tone="secondary">
                {conflict.detail}
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

import { ActivityIndicator, StyleSheet } from 'react-native';
import { Text, useTheme } from '@/ui';
import { Block } from './Block';

export interface BusyLineProps {
  readonly text: string;
  readonly testID?: string;
}

export function BusyLine({ text, testID }: BusyLineProps) {
  const theme = useTheme();
  return (
    <Block direction="row" align="center" gap="sm" compact accessible accessibilityRole="progressbar" accessibilityLabel={text} busy>
      <ActivityIndicator size="small" color={theme.color.accent} />
      <Text variant="subhead" tone="secondary" style={styles.text} testID={testID}>
        {text}
      </Text>
    </Block>
  );
}

const styles = StyleSheet.create({
  text: { flexShrink: 1 },
});

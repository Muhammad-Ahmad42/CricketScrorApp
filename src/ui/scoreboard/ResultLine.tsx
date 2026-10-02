import { StyleSheet, View } from 'react-native';
import { DrawnRule } from '../motion/DrawnRule';
import { Reveal } from '../motion/Reveal';
import { space } from '../theme';
import { Text } from '../typography';

export const RESULT_DELAY_MS = 120;

export interface ResultLineProps {
  readonly text: string;
  readonly testID?: string;
}

export function ResultLine({ text, testID = 'result-text' }: ResultLineProps) {
  return (
    <View style={styles.root}>
      <Reveal enter="slow" translateY={8} delay={RESULT_DELAY_MS} replayKey={text}>
        <Text variant="headline" testID={testID} accessibilityRole="header">
          {text}
        </Text>
      </Reveal>
      <DrawnRule trigger={text} color="textPrimary" mode="persist" delay={RESULT_DELAY_MS} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs, alignSelf: 'stretch' },
});

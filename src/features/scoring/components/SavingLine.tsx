import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/ui';

export const SAVING_DELAY_MS = 300;

export interface SavingLineProps {
  readonly saving: boolean;
}

export function SavingLine({ saving }: SavingLineProps) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!saving) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), SAVING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [saving]);
  return (
    <View
      testID="score-saving"
      accessible={shown}
      accessibilityLabel={shown ? 'Saving' : undefined}
      style={[styles.line, { backgroundColor: shown ? theme.color.accent : 'transparent' }]}
    />
  );
}

const styles = StyleSheet.create({
  line: { height: 2, alignSelf: 'stretch' },
});

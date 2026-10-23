import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SCREEN_END_SPACE, space, useScreenList, useToastAnchor } from '@/ui';

export const SCORE_TOAST_GAP = space.xs;

export interface ScoringMiddleProps {
  readonly children: ReactNode;
}

export function ScoringMiddle({ children }: ScoringMiddleProps) {
  const list = useScreenList();
  const top = list.contentInset.paddingTop;
  const bottom = Math.max(space.sm, list.contentInset.paddingBottom - SCREEN_END_SPACE + space.sm);
  useToastAnchor({ edge: 'top', offset: top + SCORE_TOAST_GAP });
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.upper, { paddingTop: top + space.xxs, paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        testID="score-middle"
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  upper: { flexGrow: 1, justifyContent: 'flex-start' },
});

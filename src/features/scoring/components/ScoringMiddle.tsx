import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SCREEN_END_SPACE, space, useScreenList, useToastAnchor } from '@/ui';

export const SCORE_TOAST_GAP = space.xs;

export interface ScoringMiddleProps {
  readonly children: ReactNode;
  readonly panel?: ReactNode;
}

export function ScoringMiddle({ children, panel }: ScoringMiddleProps) {
  const list = useScreenList();
  const top = list.contentInset.paddingTop;
  const hasPanel = panel !== undefined && panel !== null;
  const bottom = hasPanel ? space.sm : Math.max(space.sm, list.contentInset.paddingBottom - SCREEN_END_SPACE + space.sm);
  useToastAnchor({ edge: 'top', offset: top + SCORE_TOAST_GAP });
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.upper, { paddingTop: top, paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        scrollIndicatorInsets={{ top: list.scrollIndicatorInsets.top, bottom: hasPanel ? 0 : list.scrollIndicatorInsets.bottom }}
        testID="score-middle"
      >
        {children}
      </ScrollView>
      {panel}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  upper: { flexGrow: 1, justifyContent: 'flex-end' },
});

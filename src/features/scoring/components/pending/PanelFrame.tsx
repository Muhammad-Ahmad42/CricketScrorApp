import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Reveal, Text, space, useGutter, useTheme } from '@/ui';

export type PanelTone = 'neutral' | 'danger';

export interface PanelFrameProps {
  readonly heading: string;
  readonly subheading?: string | null;
  readonly children: ReactNode;
  readonly onUndo?: () => void;
  readonly undoLabel?: string;
  readonly tone?: PanelTone;
  readonly testID: string;
}

export function PanelFrame({ heading, subheading, children, onUndo, undoLabel = 'Undo last ball', tone = 'neutral', testID }: PanelFrameProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const danger = tone === 'danger';
  return (
    <Reveal enter="base" translateY={24} replayKey={testID} style={styles.fill}>
      <View testID={testID} style={[styles.panel, danger ? { backgroundColor: theme.color.dangerSubtle, borderTopLeftRadius: theme.glass.radius.dock, borderTopRightRadius: theme.glass.radius.dock } : null]}>
        {danger ? <View testID={`${testID}-bar`} style={[styles.bar, { width: theme.borderWidth.bar, backgroundColor: theme.color.danger }]} /> : null}
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]} keyboardShouldPersistTaps="handled" testID={`${testID}-scroll`}>
          <View style={styles.headingLine}>
            {danger ? <Icon name="circle-alert" size={20} color="danger" /> : null}
            <Text variant="label" tone={danger ? 'danger' : 'secondary'} accessibilityRole="header" style={styles.heading}>
              {heading}
            </Text>
          </View>
          {subheading ? (
            <Text variant="callout" tone="secondary">
              {subheading}
            </Text>
          ) : null}
          {children}
          {onUndo ? (
            <View style={styles.undo}>
              <Button label={undoLabel} icon="undo-2" variant="tertiary" size="sm" onPress={onUndo} testID={`${testID}-undo`} />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  fill: { flexShrink: 1 },
  panel: { flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  bar: { position: 'absolute', left: 0, top: space.md, bottom: 0 },
  headingLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  heading: { flexShrink: 1 },
  undo: { alignItems: 'flex-start', marginLeft: -space.sm },
  content: { paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
});

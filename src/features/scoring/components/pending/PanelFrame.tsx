import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Reveal, Text, space, useInsets, useTheme } from '@/ui';

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
  const insets = useInsets();
  const danger = tone === 'danger';
  return (
    <Reveal enter="base" translateY={24} replayKey={testID} style={styles.fill}>
      <View
        testID={testID}
        style={[
          styles.panel,
          {
            backgroundColor: danger ? theme.color.dangerSubtle : theme.color.surface,
            borderTopWidth: theme.borderWidth.hairline,
            borderTopColor: theme.color.border,
            paddingBottom: space.sm + insets.bottom,
          },
        ]}
      >
        {danger ? <View testID={`${testID}-bar`} style={[styles.bar, { width: theme.borderWidth.bar, backgroundColor: theme.color.danger }]} /> : null}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          {onUndo ? <Button label={undoLabel} variant="tertiary" size="sm" onPress={onUndo} testID={`${testID}-undo`} /> : null}
        </ScrollView>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  panel: { minHeight: 224, flexGrow: 1 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  headingLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  heading: { flexShrink: 1 },
  content: { padding: space.md, gap: space.sm },
});

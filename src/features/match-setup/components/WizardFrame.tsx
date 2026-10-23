import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Screen, Text, space, useGutter, useTheme } from '@/ui';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { STEP_TITLE, STEPS, type WizardStep } from '../selectors/wizard';

export interface WizardFrameProps {
  readonly step: WizardStep;
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly nextLabel?: string;
  readonly nextDisabled?: boolean;
  readonly nextReason?: string | null;
  readonly busy?: boolean;
  readonly onNext: () => void;
  readonly onBack?: () => void;
  readonly onClose: () => void;
}

export function WizardFrame({ step, children, toolbar, nextLabel = 'Next', nextDisabled = false, nextReason = null, busy = false, onNext, onBack, onClose }: WizardFrameProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const position = STEPS.indexOf(step);
  const header = (
    <View>
      <TopBar title={STEP_TITLE[step]} subtitle={`Step ${position + 1} of ${STEPS.length}`} onBack={onClose} backIcon="x" backLabel="Close" />
      <View style={[styles.progress, { paddingHorizontal: gutter }]} accessible={false} importantForAccessibility="no-hide-descendants">
        {STEPS.map((entry, index) => (
          <View key={entry} style={[styles.segment, { backgroundColor: index <= position ? theme.color.accent : theme.color.border, borderRadius: theme.radius.xs }]} />
        ))}
      </View>
      {toolbar}
    </View>
  );
  const reason = nextDisabled && nextReason ? nextReason : null;
  const footer = (
    <View style={styles.dock}>
      {reason !== null ? (
        <View style={styles.reason} accessibilityLiveRegion="polite" accessibilityRole="text" testID="wizard-next-reason">
          <Icon name="info" size={16} color="textSecondary" />
          <Text variant="footnote" tone="secondary" style={styles.flex}>
            {reason}
          </Text>
        </View>
      ) : null}
      <View style={styles.footer} testID="wizard-actions">
        <View style={styles.flex}>
          <Button label={onBack ? 'Back' : 'Cancel'} variant="secondary" fullWidth onPress={onBack ?? onClose} testID="wizard-btn-back" />
        </View>
        <View style={styles.flex}>
          <Button
            label={nextLabel}
            fullWidth
            disabled={nextDisabled}
            loading={busy}
            accessibilityHint={reason ?? undefined}
            onPress={onNext}
            testID="wizard-btn-next"
          />
        </View>
      </View>
    </View>
  );
  return (
    <Screen testID={`wizard-${step}`} header={header} footer={footer}>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { flexDirection: 'row', gap: space.xxs, paddingVertical: space.xs },
  segment: { flex: 1, height: 4 },
  footer: { flexDirection: 'row', gap: space.xs },
  dock: { gap: space.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxs },
});

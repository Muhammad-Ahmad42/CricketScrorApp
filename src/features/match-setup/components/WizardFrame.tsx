import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, space, useTheme } from '@/ui';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { STEP_TITLE, STEPS, type WizardStep } from '../selectors/wizard';

export interface WizardFrameProps {
  readonly step: WizardStep;
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly nextLabel?: string;
  readonly nextDisabled?: boolean;
  readonly busy?: boolean;
  readonly onNext: () => void;
  readonly onBack?: () => void;
  readonly onClose: () => void;
}

export function WizardFrame({ step, children, toolbar, nextLabel = 'Next', nextDisabled = false, busy = false, onNext, onBack, onClose }: WizardFrameProps) {
  const theme = useTheme();
  const position = STEPS.indexOf(step);
  const header = (
    <View>
      <TopBar title={STEP_TITLE[step]} subtitle={`Step ${position + 1} of ${STEPS.length}`} onBack={onClose} backIcon="x" backLabel="Close" />
      <View style={styles.progress} accessible accessibilityLabel={`Step ${position + 1} of ${STEPS.length}`}>
        {STEPS.map((entry, index) => (
          <View key={entry} style={[styles.segment, { backgroundColor: index <= position ? theme.color.accent : theme.color.border, borderRadius: theme.radius.xs }]} />
        ))}
      </View>
      {toolbar}
    </View>
  );
  const footer = (
    <View style={styles.footer} testID="wizard-actions">
      <View style={styles.flex}>
        <Button label={onBack ? 'Back' : 'Cancel'} variant="secondary" fullWidth onPress={onBack ?? onClose} testID="wizard-btn-back" />
      </View>
      <View style={styles.flex}>
        <Button label={nextLabel} fullWidth disabled={nextDisabled} loading={busy} onPress={onNext} testID="wizard-btn-next" />
      </View>
    </View>
  );
  return (
    <Screen testID={`wizard-${step}`} ambient header={header} footer={footer}>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: { flexDirection: 'row', gap: space.xxs, paddingHorizontal: space.md, paddingVertical: space.xs },
  segment: { flex: 1, height: 4 },
  footer: { flexDirection: 'row', gap: space.xs },
});

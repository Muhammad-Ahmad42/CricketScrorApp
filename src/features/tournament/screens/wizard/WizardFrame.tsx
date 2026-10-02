import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { NavHeader } from '@/features/shared';
import { Button, Screen, Text, space, useTheme } from '@/ui';
import { useTournamentWizardStore, type TournamentWizardStep } from '@/stores';
import { showError, showToast } from '../../hooks/toast';
import { routes } from '../../routes';
import { WIZARD_STEPS, nextStep, previousStep, stepNumber, stepTitle } from '../../wizard/steps';

export interface WizardFrameProps {
  readonly step: TournamentWizardStep;
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly validate?: () => boolean;
  readonly onNext?: () => Promise<boolean>;
  readonly nextLabel?: string;
  readonly nextTestID?: string;
  readonly nextDisabled?: boolean;
  readonly nextHint?: string | null;
}

export const DRAFT_SAVED_MESSAGE = 'Your draft is saved. Continue it from Tournaments.';

function StepRule({ current }: { readonly current: number }) {
  const theme = useTheme();
  return (
    <View style={styles.rule} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {WIZARD_STEPS.map((entry, index) => (
        <View key={entry.step} style={[styles.segment, { backgroundColor: index < current ? theme.color.accent : theme.color.borderStrong }]} />
      ))}
    </View>
  );
}

export function useWizardStepSync(step: TournamentWizardStep): void {
  useEffect(() => {
    const wizard = useTournamentWizardStore.getState();
    if (wizard.step !== step) {
      wizard.goTo(step);
    }
  }, [step]);
}

export function WizardFrame({
  step,
  children,
  scroll = true,
  validate,
  onNext,
  nextLabel = 'Next',
  nextTestID = 'twiz-btn-next',
  nextDisabled = false,
  nextHint = null,
}: WizardFrameProps) {
  const router = useRouter();
  const saving = useTournamentWizardStore((state) => state.status === 'saving');
  const hasDraft = useTournamentWizardStore((state) => state.draft.tournamentId !== null);
  const [advancing, setAdvancing] = useState(false);
  useWizardStepSync(step);
  const number = stepNumber(step);
  const previous = previousStep(step);

  const close = () => {
    if (hasDraft) {
      showToast('info', DRAFT_SAVED_MESSAGE);
    }
    router.dismissTo(routes.tournaments());
  };

  const back = () => {
    if (previous === null) {
      close();
      return;
    }
    useTournamentWizardStore.getState().goTo(previous);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(routes.wizardStep(previous));
    }
  };

  const next = async () => {
    if (validate && !validate()) {
      return;
    }
    const wizard = useTournamentWizardStore.getState();
    if (wizard.step !== step) {
      wizard.goTo(step);
    }
    setAdvancing(true);
    const ok = onNext ? await onNext() : await useTournamentWizardStore.getState().saveStep();
    setAdvancing(false);
    if (!ok) {
      if (!onNext) {
        showError(useTournamentWizardStore.getState().error, "Couldn't save this step. Your earlier steps are still saved.");
      }
      return;
    }
    const following = nextStep(step);
    if (following !== null) {
      useTournamentWizardStore.getState().goTo(following);
      router.push(routes.wizardStep(following));
    }
  };

  return (
    <Screen
      testID="screen-tournament-new"
      scroll={scroll}
      fullWidth
      header={
        <View>
          <NavHeader title={stepTitle(step)} onBack={close} backIcon="x" backLabel="Close" />
          <View style={styles.stepLine}>
            <Text variant="footnote" tone="secondary" testID="twiz-text-step">
              {`Step ${number} of ${WIZARD_STEPS.length}`}
            </Text>
            <StepRule current={number} />
          </View>
        </View>
      }
      footer={
        <View style={styles.footer}>
          {nextHint ? (
            <Text variant="footnote" tone="secondary" testID="twiz-text-next-hint">
              {nextHint}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button label={previous === null ? 'Cancel' : 'Back'} variant="secondary" onPress={back} fullWidth testID="twiz-btn-back" />
            </View>
            <View style={styles.flex}>
              <Button
                label={nextLabel}
                onPress={() => void next()}
                loading={advancing || saving}
                disabled={nextDisabled}
                fullWidth
                accessibilityHint={nextHint ?? undefined}
                testID={nextTestID}
              />
            </View>
          </View>
        </View>
      }
    >
      {scroll ? children : <View style={styles.root}>{children}</View>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stepLine: { paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.xxs },
  rule: { flexDirection: 'row', gap: 2 },
  segment: { flex: 1, height: 4 },
  footer: { gap: space.xs },
  buttons: { flexDirection: 'row', gap: space.xs },
  flex: { flex: 1 },
});

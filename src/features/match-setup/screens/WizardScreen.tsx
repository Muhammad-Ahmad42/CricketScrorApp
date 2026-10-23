import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Dialog } from '@/ui';
import { useMatchSetupStore } from '@/stores';
import { WizardFrame } from '../components/WizardFrame';
import { draftIsEmpty, STEP_ROUTE, STEPS, type WizardStep } from '../selectors/wizard';

export interface WizardScreenProps {
  readonly step: WizardStep;
  readonly children: ReactNode;
  readonly toolbar?: ReactNode;
  readonly nextLabel?: string;
  readonly nextDisabled?: boolean;
  readonly nextReason?: string | null;
  readonly busy?: boolean;
  readonly onNext?: () => void;
}

export function exitWizard(): void {
  useMatchSetupStore.getState().reset();
  router.dismissTo('/');
}

export function goToStep(step: WizardStep): void {
  router.push(STEP_ROUTE[step]);
}

export function WizardScreen({ step, children, toolbar, nextLabel, nextDisabled = false, nextReason = null, busy = false, onNext }: WizardScreenProps) {
  const draft = useMatchSetupStore((s) => s.draft);
  const [confirming, setConfirming] = useState(false);
  const index = STEPS.indexOf(step);
  const fromFixture = draft.fixtureId !== null;
  const firstStep = fromFixture ? 'players' : 'index';
  const next = STEPS[index + 1];
  const advance = () => {
    if (next !== undefined) {
      goToStep(next);
    }
  };
  const close = () => {
    if (draftIsEmpty(draft)) {
      exitWizard();
    } else {
      setConfirming(true);
    }
  };
  return (
    <>
      <WizardFrame
        step={step}
        toolbar={toolbar}
        nextLabel={nextLabel}
        nextDisabled={nextDisabled}
        nextReason={nextReason}
        busy={busy}
        onNext={onNext ?? advance}
        onBack={step === firstStep ? undefined : () => router.back()}
        onClose={close}
      >
        {children}
      </WizardFrame>
      <Dialog
        visible={confirming}
        destructive
        title="Discard this setup?"
        message="Nothing has been saved yet."
        confirm={{
          label: 'Discard',
          onPress: () => {
            setConfirming(false);
            exitWizard();
          },
          testID: 'wizard-discard-confirm',
        }}
        cancel={{ label: 'Keep editing', onPress: () => setConfirming(false), testID: 'wizard-discard-cancel' }}
        onRequestClose={() => setConfirming(false)}
      />
    </>
  );
}

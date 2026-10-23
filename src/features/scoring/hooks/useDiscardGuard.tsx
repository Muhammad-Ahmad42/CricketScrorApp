import { useEffect, useState, type ReactElement } from 'react';
import { BackHandler } from 'react-native';
import { Dialog } from '@/ui';

export interface DiscardGuard {
  readonly asking: boolean;
  readonly requestClose: () => void;
  readonly dialog: ReactElement;
}

export const DISCARD_TITLE = 'Discard changes?';

export function useDiscardGuard(dirty: boolean, onClose: () => void, testID = 'dialog-discard'): DiscardGuard {
  const [asking, setAsking] = useState(false);
  const keep = () => setAsking(false);
  const discard = () => {
    setAsking(false);
    onClose();
  };
  return {
    asking,
    requestClose: () => {
      if (dirty) {
        setAsking(true);
        return;
      }
      onClose();
    },
    dialog: (
      <Dialog
        visible={asking}
        destructive
        title={DISCARD_TITLE}
        confirm={{ label: 'Discard', onPress: discard, testID: `${testID}-confirm` }}
        cancel={{ label: 'Keep editing', onPress: keep, testID: `${testID}-cancel` }}
        onRequestClose={keep}
        testID={testID}
      />
    ),
  };
}

export function useLeaveGuard(dirty: boolean, onLeave: () => void, testID = 'dialog-discard'): DiscardGuard {
  const guard = useDiscardGuard(dirty, onLeave, testID);
  const { requestClose } = guard;
  useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [dirty, requestClose]);
  return guard;
}

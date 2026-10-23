import { useState } from 'react';
import { Dialog } from '@/ui';
import { isReasonValid, ReasonField } from './ReasonField';

export interface ReasonDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel: string;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
  readonly testID?: string;
}

export function ReasonDialog({ visible, title, message, confirmLabel, destructive = false, busy = false, onConfirm, onCancel, testID = 'dialog-reason' }: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const valid = isReasonValid(reason);
  const confirm = () => {
    if (!valid || busy) {
      return;
    }
    const text = reason.trim();
    setReason('');
    onConfirm(text);
  };
  return (
    <Dialog
      visible={visible}
      title={title}
      message={message}
      destructive={destructive}
      confirm={{
        label: confirmLabel,
        disabled: !valid,
        loading: busy,
        onPress: confirm,
        testID: `${testID}-confirm`,
      }}
      cancel={{ label: 'Cancel', onPress: onCancel, testID: `${testID}-cancel` }}
      onRequestClose={onCancel}
      testID={testID}
    >
      <ReasonField
        value={reason}
        onChange={setReason}
        required
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        testID={`${testID}-field`}
      />
    </Dialog>
  );
}

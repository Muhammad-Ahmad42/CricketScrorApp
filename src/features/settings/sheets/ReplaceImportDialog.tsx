import { Dialog } from '@/ui';

export interface ReplaceImportDialogProps {
  readonly visible: boolean;
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ReplaceImportDialog({ visible, message, onConfirm, onCancel }: ReplaceImportDialogProps) {
  return (
    <Dialog
      visible={visible}
      title="Replace data on this phone?"
      message={message}
      destructive
      confirm={{ label: 'Replace', onPress: onConfirm, testID: 'import-btn-confirm-replace' }}
      cancel={{ label: 'Cancel', onPress: onCancel, testID: 'import-btn-cancel-replace' }}
      onRequestClose={onCancel}
      testID="dialog-import-replace"
      messageTestID="import-text-replace-message"
    />
  );
}

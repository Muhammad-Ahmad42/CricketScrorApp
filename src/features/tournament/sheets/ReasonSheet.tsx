import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { ReasonField, reasonReady, trimmedOrNull } from '@/features/shared';
import { Button, Sheet, Text, space } from '@/ui';

export interface ReasonSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string | null;
  readonly confirmLabel: string;
  readonly required: boolean;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string | null) => void;
  readonly testID?: string;
}

export function ReasonSheet({
  visible,
  title,
  message,
  confirmLabel,
  required,
  destructive = false,
  busy = false,
  onClose,
  onSubmit,
  testID = 'sheet-reason',
}: ReasonSheetProps) {
  const [reason, setReason] = useState('');
  const guard = useDiscardGuard(reason.trim() !== '', onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={title}
        onClose={guard.requestClose}
        testID={testID}
        footer={
          <Button
            label={confirmLabel}
            variant={destructive ? 'destructiveConfirm' : 'primary'}
            disabled={required && !reasonReady(reason)}
            loading={busy}
            fullWidth
            onPress={() => onSubmit(trimmedOrNull(reason))}
            testID="reason-btn-confirm"
          />
        }
      >
        <View style={styles.body}>
          {message ? (
            <Text variant="callout" tone="secondary">
              {message}
            </Text>
          ) : null}
          <ReasonField required={required} value={reason} onChange={setReason} testID="reason-input" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ReasonField, reasonReady, trimmedOrNull } from '@/features/shared';
import { Button, Sheet, Text, space } from '@/ui';

export interface ReasonSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
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
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
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
        <Text variant="callout" tone="secondary">
          {message}
        </Text>
        <ReasonField required={required} value={reason} onChange={setReason} testID="reason-input" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});

import { TextField, type FormChainField } from '@/ui';
import { MIN_REASON_CHARACTERS } from './text';

export interface ReasonFieldProps {
  readonly required: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly helper?: string;
  readonly chain?: FormChainField;
  readonly testID?: string;
}

export const REASON_PLACEHOLDER = 'Why is this change needed?';

export function reasonHelper(required: boolean): string | undefined {
  return required ? `At least ${MIN_REASON_CHARACTERS} characters` : undefined;
}

export function ReasonField({ required, value, onChange, label, helper, chain, testID = 'input-reason' }: ReasonFieldProps) {
  const shownLabel = label ?? (required ? 'Reason (required)' : 'Reason (optional)');
  return (
    <TextField
      label={shownLabel}
      value={value}
      onChangeText={onChange}
      multiline
      maxLength={500}
      placeholder={required ? REASON_PLACEHOLDER : undefined}
      helper={helper ?? reasonHelper(required)}
      accessibilityHint={required ? `Needs at least ${MIN_REASON_CHARACTERS} characters. Saved in the audit log.` : 'Saved in the audit log.'}
      ref={chain?.ref}
      returnKeyType={chain?.returnKeyType}
      submitBehavior={chain?.submitBehavior}
      onSubmitEditing={chain?.onSubmitEditing}
      testID={testID}
    />
  );
}

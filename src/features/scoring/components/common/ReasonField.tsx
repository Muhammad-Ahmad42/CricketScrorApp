import type { ReturnKeyTypeOptions } from 'react-native';
import { TextField, type FormChainField, type SubmitBehavior } from '@/ui';

export const MIN_REASON_LENGTH = 3;

export function isReasonValid(reason: string): boolean {
  return reason.replace(/\s/g, '').length >= MIN_REASON_LENGTH;
}

export interface ReasonFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required: boolean;
  readonly label?: string;
  readonly placeholder?: string;
  readonly ref?: FormChainField['ref'];
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly submitBehavior?: SubmitBehavior;
  readonly onSubmitEditing?: () => void;
  readonly testID?: string;
}

export function ReasonField({ value, onChange, required, label, placeholder, ref, returnKeyType, submitBehavior, onSubmitEditing, testID = 'field-reason' }: ReasonFieldProps) {
  return (
    <TextField
      ref={ref}
      label={label ?? (required ? 'Reason' : 'Reason (optional)')}
      value={value}
      onChangeText={onChange}
      multiline
      placeholder={placeholder ?? 'Why is this changing?'}
      helper={required ? `At least ${MIN_REASON_LENGTH} characters` : undefined}
      autoCapitalize="sentences"
      returnKeyType={returnKeyType}
      submitBehavior={submitBehavior}
      onSubmitEditing={onSubmitEditing}
      testID={testID}
    />
  );
}

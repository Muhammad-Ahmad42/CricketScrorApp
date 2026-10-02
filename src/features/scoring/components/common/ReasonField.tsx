import { TextField } from '@/ui';

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
  readonly testID?: string;
}

export function ReasonField({ value, onChange, required, label, placeholder, testID = 'field-reason' }: ReasonFieldProps) {
  const shown = label ?? (required ? 'Reason (required)' : 'Reason (optional)');
  return (
    <TextField
      label={shown}
      value={value}
      onChangeText={onChange}
      multiline
      placeholder={placeholder ?? 'Why is this changing?'}
      helper={required ? `At least ${MIN_REASON_LENGTH} characters. Saved in the audit log.` : 'Saved in the audit log.'}
      testID={testID}
    />
  );
}

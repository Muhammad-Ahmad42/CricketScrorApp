import { TextField } from '@/ui';
import { MIN_REASON_CHARACTERS } from './text';

export interface ReasonFieldProps {
  readonly required: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly helper?: string;
  readonly testID?: string;
}

export function ReasonField({ required, value, onChange, label, helper, testID = 'input-reason' }: ReasonFieldProps) {
  const shownLabel = label ?? (required ? 'Reason (required)' : 'Reason (optional)');
  return (
    <TextField
      label={shownLabel}
      value={value}
      onChangeText={onChange}
      multiline
      maxLength={500}
      placeholder={required ? 'Why is this change needed?' : undefined}
      helper={helper ?? (required ? `At least ${MIN_REASON_CHARACTERS} characters. Saved in the audit log with this change.` : undefined)}
      accessibilityHint={required ? `A reason of at least ${MIN_REASON_CHARACTERS} characters is needed before you can continue` : undefined}
      testID={testID}
    />
  );
}

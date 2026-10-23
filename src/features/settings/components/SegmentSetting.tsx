import { SegmentedControl, Text } from '@/ui';
import type { Choice } from '../selectors/settings';
import { Block } from './Block';

export interface SegmentSettingProps<T extends string> {
  readonly title: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly separator?: boolean;
  readonly testID?: string;
}

export function SegmentSetting<T extends string>({ title, choices, value, onChange, disabled = false, separator = true, testID }: SegmentSettingProps<T>) {
  return (
    <Block gap="sm" separator={separator}>
      <Text variant="body" tone={disabled ? 'muted' : 'primary'}>
        {title}
      </Text>
      <SegmentedControl
        options={choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
          accessibilityLabel: choice.accessibilityLabel,
          testID: choice.testID,
        }))}
        value={value}
        onChange={onChange}
        accessibilityLabel={title}
        disabled={disabled}
        testID={testID}
      />
    </Block>
  );
}

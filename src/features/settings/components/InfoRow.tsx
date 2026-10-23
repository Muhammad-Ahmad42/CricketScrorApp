import { StyleSheet, View } from 'react-native';
import { Text, space } from '@/ui';
import { Block } from './Block';

export interface InfoRowProps {
  readonly label: string;
  readonly value: string;
  readonly valueTestID?: string;
  readonly separator?: boolean;
  readonly testID?: string;
}

export const INFO_VALUE_STACK_AT = 18;

export function stacksValue(value: string): boolean {
  return value.length > INFO_VALUE_STACK_AT;
}

function InfoTexts({ label, value, valueTestID, stacked }: { readonly label: string; readonly value: string; readonly valueTestID?: string; readonly stacked: boolean }) {
  return (
    <>
      <Text variant="body" tone="secondary" style={stacked ? null : styles.label}>
        {label}
      </Text>
      <Text variant="body" weight="medium" style={stacked ? null : styles.value} testID={valueTestID}>
        {value}
      </Text>
    </>
  );
}

export function InfoRow({ label, value, valueTestID, separator = true, testID }: InfoRowProps) {
  const stacked = stacksValue(value);
  return (
    <Block
      direction={stacked ? 'column' : 'row'}
      align={stacked ? 'stretch' : 'center'}
      gap={stacked ? 'xxs' : 'sm'}
      padding={stacked ? 'sm' : 'xs'}
      compact
      separator={separator}
      accessible
      accessibilityLabel={`${label}, ${value}`}
      testID={testID}
    >
      <InfoTexts label={label} value={value} valueTestID={valueTestID} stacked={stacked} />
    </Block>
  );
}

export type InfoLineProps = Omit<InfoRowProps, 'separator'>;

export function InfoLine({ label, value, valueTestID, testID }: InfoLineProps) {
  const stacked = stacksValue(value);
  return (
    <View style={stacked ? styles.stacked : styles.row} accessible accessibilityLabel={`${label}, ${value}`} testID={testID}>
      <InfoTexts label={label} value={value} valueTestID={valueTestID} stacked={stacked} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 },
  stacked: { gap: space.xxs, minWidth: 0 },
  label: { flex: 1, minWidth: 0 },
  value: { flexShrink: 1, maxWidth: '60%', textAlign: 'right' },
});

import { Icon, type IconName, type ListRowTrailing } from '@/ui';

export function actionTrailing(icon: IconName, disabled: boolean, testID?: string): ListRowTrailing {
  return { kind: 'custom', node: <Icon name={icon} size={20} color={disabled ? 'textMuted' : 'accent'} testID={testID} /> };
}

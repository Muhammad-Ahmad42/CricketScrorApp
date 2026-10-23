import { Platform, Switch as RNSwitch } from 'react-native';
import { formatRgb, mixColors, useTheme, type Theme } from '../theme';

export interface SwitchProps {
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly hidden?: boolean;
  readonly testID?: string;
}

export interface SwitchColors {
  readonly trackOn: string;
  readonly trackOff: string;
  readonly thumbOn: string;
  readonly thumbOff: string;
  readonly trackDisabled: string;
  readonly thumbDisabled: string;
  readonly trackDisabledOn: string;
  readonly thumbDisabledOn: string;
}

export function switchColors(theme: Theme): SwitchColors {
  const { color } = theme;
  if (theme.scheme === 'dark') {
    return {
      trackOn: color.accentDeep,
      trackOff: color.borderStrong,
      thumbOn: color.inverseSurface,
      thumbOff: color.inverseSurface,
      trackDisabled: color.surfaceElevated,
      thumbDisabled: color.borderStrong,
      trackDisabledOn: formatRgb(mixColors(color.surface, color.accentDeep, 0.5)),
      thumbDisabledOn: color.textSecondary,
    };
  }
  return {
    trackOn: color.accent,
    trackOff: color.borderStrong,
    thumbOn: color.surface,
    thumbOff: color.surface,
    trackDisabled: color.surfaceSunken,
    thumbDisabled: color.borderStrong,
    trackDisabledOn: formatRgb(mixColors(color.surface, color.accent, 0.66)),
    thumbDisabledOn: color.surface,
  };
}

export function Switch({ value, onValueChange, disabled = false, accessibilityLabel, hidden = false, testID }: SwitchProps) {
  const theme = useTheme();
  const colors = switchColors(theme);
  const thumb = disabled ? (value ? colors.thumbDisabledOn : colors.thumbDisabled) : value ? colors.thumbOn : colors.thumbOff;
  const trackOff = disabled ? colors.trackDisabled : colors.trackOff;
  const trackOn = disabled ? colors.trackDisabledOn : colors.trackOn;
  const web = Platform.OS === 'web' ? { activeThumbColor: thumb, activeTrackColor: trackOn } : {};
  return (
    <RNSwitch
      testID={testID}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: trackOn, false: trackOff }}
      thumbColor={thumb}
      ios_backgroundColor={trackOff}
      accessibilityLabel={hidden ? undefined : accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      accessible={!hidden}
      importantForAccessibility={hidden ? 'no' : 'auto'}
      {...web}
    />
  );
}

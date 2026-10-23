import type { ThemePreference } from '@/domain/types';
import { ListRow, SectionHeader } from '@/ui';
import { COPY } from '../copy';
import { THEME_CHOICES } from '../selectors/settings';
import { SegmentSetting } from './SegmentSetting';

export interface AppearanceSectionProps {
  readonly theme: ThemePreference;
  readonly onThemeChange: (theme: ThemePreference) => void;
  readonly reduceTransparency?: boolean;
  readonly systemReduceTransparency?: boolean;
  readonly onReduceTransparencyChange?: (value: boolean) => void;
  readonly disabled?: boolean;
}

export function AppearanceSection({
  theme,
  onThemeChange,
  reduceTransparency = false,
  systemReduceTransparency = false,
  onReduceTransparencyChange,
  disabled = false,
}: AppearanceSectionProps) {
  return (
    <>
      <SectionHeader title="Appearance" />
      <SegmentSetting
        title="Theme"
        choices={THEME_CHOICES}
        value={theme}
        onChange={onThemeChange}
        disabled={disabled}
        separator={onReduceTransparencyChange !== undefined}
        testID="settings-group-theme"
      />
      {onReduceTransparencyChange ? (
        <ListRow
          title="Reduce transparency"
          subtitle={systemReduceTransparency ? COPY.reduceTransparencyBySystem : COPY.reduceTransparencyHelper}
          trailing={{
            kind: 'switch',
            value: systemReduceTransparency || reduceTransparency,
            onValueChange: onReduceTransparencyChange,
            disabled: disabled || systemReduceTransparency,
          }}
          disabled={disabled}
          separator={false}
          testID="settings-toggle-transparency"
        />
      ) : null}
    </>
  );
}

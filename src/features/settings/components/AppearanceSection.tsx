import { StyleSheet, View } from 'react-native';
import type { ThemePreference } from '@/domain/types';
import { ListRow, SectionHeader, Separator, Text, space, useTheme } from '@/ui';
import { COPY } from '../copy';
import { THEME_CHOICES } from '../selectors/settings';
import { SegmentSetting } from './SegmentSetting';

export interface AppearanceSectionProps {
  readonly theme: ThemePreference;
  readonly onThemeChange: (theme: ThemePreference) => void;
  readonly reduceTransparency?: boolean;
  readonly onReduceTransparencyChange?: (value: boolean) => void;
  readonly transparencyNote?: string;
  readonly disabled?: boolean;
}

export function AppearanceSection({
  theme,
  onThemeChange,
  reduceTransparency = false,
  onReduceTransparencyChange,
  transparencyNote,
  disabled = false,
}: AppearanceSectionProps) {
  const tokens = useTheme();
  return (
    <>
      <SectionHeader title="Appearance" />
      <SegmentSetting
        title="Theme"
        helper="System follows your phone's light or dark setting."
        choices={THEME_CHOICES}
        value={theme}
        onChange={onThemeChange}
        disabled={disabled}
        testID="settings-group-theme"
      />
      {onReduceTransparencyChange ? (
        <>
          <ListRow
            title="Reduce transparency"
            subtitle={COPY.reduceTransparencyHelper}
            trailing={{ kind: 'switch', value: reduceTransparency, onValueChange: onReduceTransparencyChange, disabled }}
            disabled={disabled}
            separator={!transparencyNote}
            testID="settings-toggle-transparency"
          />
          {transparencyNote ? (
            <View style={{ backgroundColor: tokens.color.surface }}>
              <Text variant="footnote" tone="secondary" style={styles.note} testID="settings-text-transparency-note">
                {transparencyNote}
              </Text>
              <Separator inset={space.md} />
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: space.md, paddingBottom: space.sm },
});

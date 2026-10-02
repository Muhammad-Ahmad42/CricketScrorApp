import { StyleSheet, View } from 'react-native';
import { ListRow, SectionHeader, Text, space, useTheme } from '@/ui';
import { COPY } from '../copy';

export interface AboutSectionProps {
  readonly version: string;
  readonly onOpenAbout: () => void;
}

export function AboutSection({ version, onOpenAbout }: AboutSectionProps) {
  const theme = useTheme();
  return (
    <>
      <SectionHeader title="About" />
      <View style={[styles.body, { backgroundColor: theme.color.surface }]}>
        <Text variant="body" weight="semibold" testID="settings-text-version">
          {`Scorebook ${version}`}
        </Text>
        <Text variant="footnote" tone="secondary" testID="settings-text-privacy">
          {COPY.privacyLine}
        </Text>
      </View>
      <ListRow title="About & privacy" trailing={{ kind: 'chevron' }} onPress={onOpenAbout} testID="settings-btn-about" />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow, Screen, SectionHeader, Text, space, useTheme } from '@/ui';
import { PRIVACY_POINTS, PrivacyList } from '../components/PrivacyList';
import { StackHeader } from '../components/StackHeader';
import { SETTINGS_ROUTES } from '../constants';
import { COPY } from '../copy';
import { readAppInfo } from '../platform/appInfo';

export function AboutScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [app] = useState(readAppInfo);
  return (
    <Screen testID="screen-about" ambient header={<StackHeader title="About & privacy" onBack={() => router.back()} />}>
      <View style={[styles.block, { backgroundColor: theme.color.surface }]}>
        <Text variant="title2" accessibilityRole="header">
          Scorebook
        </Text>
        <Text variant="body" tone="secondary" testID="about-text-version">
          {`Version ${app.version}`}
        </Text>
        <Text variant="body">An offline cricket scorebook and tournament manager.</Text>
        <Text variant="footnote" tone="secondary" testID="about-text-privacy">
          {COPY.privacyLine}
        </Text>
      </View>
      <SectionHeader title="Your privacy" />
      <PrivacyList points={PRIVACY_POINTS} />
      <SectionHeader title="Your data" />
      <View style={[styles.block, { backgroundColor: theme.color.surface }]}>
        <Text variant="body">
          Everything you record is kept in a database on this phone. Uninstalling the app deletes it, so export a backup to keep a copy or to move to another phone.
        </Text>
      </View>
      <ListRow title="Backup & import" trailing={{ kind: 'chevron' }} onPress={() => router.push(SETTINGS_ROUTES.backup)} testID="about-btn-backup" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs },
});

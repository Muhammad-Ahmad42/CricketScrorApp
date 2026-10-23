import { useState } from 'react';
import { useRouter } from 'expo-router';
import { NavHeader } from '@/features/shared';
import { ExplainedText, ListRow, Screen, SectionHeader, Text } from '@/ui';
import { Block } from '../components/Block';
import { PRIVACY_POINTS, PrivacyList } from '../components/PrivacyList';
import { SETTINGS_ROUTES } from '../constants';
import { COPY } from '../copy';
import { readAppInfo } from '../platform/appInfo';

export function AboutScreen() {
  const router = useRouter();
  const [app] = useState(readAppInfo);
  return (
    <Screen testID="screen-about" header={<NavHeader title="About & privacy" onBack={() => router.back()} />}>
      <Block>
        <Text variant="title2" accessibilityRole="header">
          Scorebook
        </Text>
        <Text variant="body" tone="secondary" testID="about-text-version">
          {`Version ${app.version}`}
        </Text>
        <Text variant="body" testID="about-text-tagline">
          {COPY.appTagline}
        </Text>
      </Block>
      <SectionHeader title="Your privacy" />
      <PrivacyList points={PRIVACY_POINTS} />
      <SectionHeader title="Your data" />
      <Block separator>
        <ExplainedText headline={COPY.uninstallWarning} supporting={COPY.uninstallAction} testID="about-text-your-data" />
      </Block>
      <ListRow title="Backup & import" trailing={{ kind: 'chevron' }} onPress={() => router.push(SETTINGS_ROUTES.backup)} separator={false} testID="about-btn-backup" />
    </Screen>
  );
}

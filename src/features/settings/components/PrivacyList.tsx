import { StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';

export interface PrivacyPoint {
  readonly key: string;
  readonly title: string;
  readonly body: string;
}

export const PRIVACY_POINTS: readonly PrivacyPoint[] = [
  { key: 'account', title: 'No account', body: 'There is no sign-up and no login. Open the app and score.' },
  { key: 'offline', title: 'Works without internet', body: 'Scoring, tournaments, PDFs and backups all work offline.' },
  { key: 'tracking', title: 'No tracking or ads', body: 'Scorebook has no analytics, no advertising and no tracking of any kind.' },
  { key: 'cloud', title: 'No cloud sync', body: 'Your matches, teams and tournaments are stored only on this phone.' },
  {
    key: 'sharing',
    title: 'You decide what leaves the phone',
    body: 'Data leaves this phone only when you export a backup or share a PDF or technical details for support, and only to the place you choose.',
  },
];

export interface PrivacyListProps {
  readonly points: readonly PrivacyPoint[];
}

export function PrivacyList({ points }: PrivacyListProps) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.color.surface }}>
      {points.map((point, index) => (
        <View key={point.key}>
          <View style={styles.row} accessible accessibilityLabel={`${point.title}. ${point.body}`} testID={`about-row-${point.key}`}>
            <Icon name="check" size={20} color="success" />
            <View style={styles.text}>
              <Text variant="bodyStrong">{point.title}</Text>
              <Text variant="footnote" tone="secondary">
                {point.body}
              </Text>
            </View>
          </View>
          {index < points.length - 1 ? <Separator inset={space.md} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  text: { flex: 1, gap: space.xxs },
});

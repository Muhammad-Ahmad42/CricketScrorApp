import { StyleSheet, View } from 'react-native';
import { Icon, Text, space } from '@/ui';
import { Block } from './Block';

export interface PrivacyPoint {
  readonly key: string;
  readonly title: string;
  readonly body?: string;
}

export const PRIVACY_POINTS: readonly PrivacyPoint[] = [
  { key: 'account', title: 'No account or login' },
  { key: 'offline', title: 'Works without internet' },
  { key: 'tracking', title: 'No tracking or ads' },
  { key: 'cloud', title: 'No cloud sync' },
  { key: 'sharing', title: "You choose what's shared", body: 'Only backups, PDFs and technical details you export.' },
];

export interface PrivacyListProps {
  readonly points: readonly PrivacyPoint[];
}

export function PrivacyList({ points }: PrivacyListProps) {
  return (
    <>
      {points.map((point, index) => (
        <Block
          key={point.key}
          direction="row"
          align="start"
          gap="sm"
          compact
          separator={index < points.length - 1}
          accessible
          accessibilityLabel={point.body ? `${point.title}. ${point.body}` : point.title}
          testID={`about-row-${point.key}`}
        >
          <Icon name="check" size={20} color="success" />
          <View style={styles.text}>
            <Text variant="bodyStrong">{point.title}</Text>
            {point.body ? (
              <Text variant="footnote" tone="secondary">
                {point.body}
              </Text>
            ) : null}
          </View>
        </Block>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: space.xxs },
});

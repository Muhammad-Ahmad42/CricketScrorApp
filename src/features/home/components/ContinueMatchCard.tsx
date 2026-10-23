import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Badge, Icon, PressableRow, Text, space, useTheme } from '@/ui';
import type { ContinueVM } from '@/features/history/selectors/matchCard';

export const SHORT_NAME_WIDTH = 360;

export interface ContinueMatchCardProps {
  readonly vm: ContinueVM;
  readonly primary?: boolean;
  readonly onResume: () => void;
}

export function ContinueMatchCard({ vm, primary = false, onResume }: ContinueMatchCardProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const narrow = window.width < SHORT_NAME_WIDTH;
  return (
    <PressableRow
      testID={`home-continue-${vm.id}`}
      accessibilityLabel={vm.accessibilityLabel}
      accessibilityHint="Resumes live scoring"
      onPress={onResume}
      direction="column"
      align="stretch"
      gap="xxs"
    >
      <View style={styles.line}>
        <Text variant="headline" style={styles.flex}>
          {vm.matchTitle}
        </Text>
        <Badge label={vm.badge} tone={vm.paused ? 'paused' : 'live'} />
      </View>
      <View style={styles.line}>
        <Text variant="bodyStrong" style={styles.flex}>
          {narrow ? vm.battingShort : vm.battingTeam}
        </Text>
        <View style={styles.figures}>
          <Text variant="scoreMedium" tone="score">
            {vm.score}
          </Text>
          <Text variant="subhead" tone="secondary" align="right" style={styles.overs}>
            {vm.overs}
          </Text>
        </View>
      </View>
      <View style={styles.line}>
        <Text variant="footnote" tone="secondary" style={styles.flex} testID={`home-continue-${vm.id}-detail`}>
          {vm.requirement !== null ? (
            <Text variant="footnote" weight="semibold" tone="primary">
              {vm.requirement}
            </Text>
          ) : null}
          {vm.requirement !== null ? ' · ' : ''}
          {vm.other}
        </Text>
        <View
          testID={`home-continue-${vm.id}-resume`}
          style={[
            styles.pill,
            {
              borderRadius: theme.radius.md,
              backgroundColor: primary ? theme.color.accent : theme.color.surface,
              borderWidth: primary ? 0 : theme.borderWidth.control,
              borderColor: theme.color.borderStrong,
            },
          ]}
        >
          <Icon name="play" size={16} color={primary ? 'onAccent' : 'textPrimary'} />
          <Text variant="subhead" weight="semibold" tone={primary ? 'onAccent' : 'primary'} numberOfLines={1}>
            Resume
          </Text>
        </View>
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  figures: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs, flexShrink: 0 },
  overs: { minWidth: 44 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, minHeight: 36, paddingHorizontal: space.sm, flexShrink: 0 },
});

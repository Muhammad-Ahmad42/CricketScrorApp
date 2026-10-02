import { StyleSheet, View } from 'react-native';
import { Badge, BoundaryRule, Button, Text, space } from '@/ui';
import type { ScorecardHeaderVM } from '../selectors/header';

export interface ResultBannerProps {
  readonly vm: ScorecardHeaderVM;
  readonly onTournament?: () => void;
}

export function ResultBanner({ vm, onTournament }: ResultBannerProps) {
  return (
    <View style={styles.root} testID="scorecard-header">
      {vm.isLive ? <Badge label={vm.statusLabel} tone={vm.statusLabel === 'Paused' ? 'paused' : 'live'} /> : null}
      <Text variant="title2" accessibilityRole="header" testID="scorecard-result">
        {vm.resultLine}
      </Text>
      <Text variant="footnote" tone="secondary" testID="scorecard-toss">
        {vm.tossLine}
      </Text>
      {vm.metaLine ? (
        <Text variant="footnote" tone="secondary">
          {vm.metaLine}
        </Text>
      ) : null}
      {vm.tournamentId !== null && onTournament ? (
        <View style={styles.link}>
          <Button label="Open tournament" icon="trophy" variant="tertiary" size="sm" onPress={onTournament} testID="scorecard-btn-tournament" />
        </View>
      ) : null}
      <BoundaryRule style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.xxs },
  link: { alignItems: 'flex-start' },
  rule: { marginTop: space.sm },
});

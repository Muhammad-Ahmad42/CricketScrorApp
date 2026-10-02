import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen, Tabs, Text, space } from '@/ui';
import { useLiveMatchStore, useSettingsStore } from '@/stores';
import { InningsCard } from '../components/InningsCard';
import { selectInningsCards } from '../selectors/innings';

export const LIVE_PANE_OVERS = 3;

export function LiveScorecardPane({ compact }: { readonly compact: boolean }) {
  const live = useLiveMatchStore((s) => s.live);
  const dotStyle = useSettingsStore((s) => s.settings.scoring.dotStyle);
  const [chosen, setChosen] = useState<string | null>(null);
  if (live === null) {
    return null;
  }
  const cards = selectInningsCards(live.setup, live.state, dotStyle);
  if (cards.length === 0) {
    return (
      <Screen testID="score-scorecard-pane-empty" fullWidth>
        <View style={styles.empty}>
          <Text variant="body" tone="secondary">
            The scorecard fills in as the match is scored.
          </Text>
        </View>
      </Screen>
    );
  }
  const latest = cards[cards.length - 1];
  const selected = cards.find((card) => `${card.index}` === chosen) ?? latest;
  return (
    <Screen
      testID="score-scorecard-pane"
      fullWidth
      header={
        <Tabs
          tabs={cards.map((card) => ({ key: `${card.index}`, label: card.tabLabel, testID: `score-pane-tab-${card.index}` }))}
          selectedKey={`${selected.index}`}
          onSelect={setChosen}
          accessibilityLabel="Innings"
        />
      }
    >
      <InningsCard vm={selected} compact={compact} maxOvers={LIVE_PANE_OVERS} testID="score-pane-innings" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { padding: space.md },
});

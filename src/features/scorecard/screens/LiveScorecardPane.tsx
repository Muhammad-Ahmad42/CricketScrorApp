import { useState } from 'react';
import { Inset, Screen, Tabs, Text } from '@/ui';
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
        <Inset top="md">
          <Text variant="body" tone="secondary">
            No balls scored yet
          </Text>
        </Inset>
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
          tabs={cards.map((card) => ({ key: `${card.index}`, label: card.tabLabel, accessibilityLabel: card.tabAccessibilityLabel, testID: `score-pane-tab-${card.index}` }))}
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

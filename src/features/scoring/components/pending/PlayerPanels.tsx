import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, OptionTile, Text, space } from '@/ui';
import type { NextBatterVM, NextBowlerVM } from '../../selectors/options';
import { PanelFrame } from './PanelFrame';

const TOP_BATTERS = 3;

export interface NextBatterPanelProps {
  readonly vm: NextBatterVM;
  readonly onPick: (playerId: string) => void;
  readonly onEndInnings: () => void;
  readonly onAddPlayer: () => void;
  readonly onUndo: () => void;
}

export function NextBatterPanel({ vm, onPick, onEndInnings, onAddPlayer, onUndo }: NextBatterPanelProps) {
  const [all, setAll] = useState(false);
  const shown = all ? vm.options : vm.options.slice(0, TOP_BATTERS);
  return (
    <PanelFrame heading={vm.heading} subheading={vm.lastOut} onUndo={onUndo} testID="prompt-next-batter">
      {shown.map((option) => (
        <OptionTile
          key={option.id}
          kind="action"
          title={option.label}
          description={option.detail}
          tag={option.tag}
          onPress={() => onPick(option.id)}
          testID={`prompt-batter-${option.id}`}
        />
      ))}
      {vm.options.length === 0 ? (
        <Text variant="body" tone="secondary">
          No batters left
        </Text>
      ) : null}
      <View style={styles.links}>
        {!all && vm.options.length > TOP_BATTERS ? (
          <Button label="All batters" variant="tertiary" size="sm" onPress={() => setAll(true)} testID="prompt-batter-all" />
        ) : null}
        <Button label="Add player" icon="plus" variant="tertiary" size="sm" onPress={onAddPlayer} testID="prompt-batter-add" />
      </View>
      {vm.canEndInnings ? (
        <Button label="End innings" variant="secondary" accessibilityHint="No batters available" onPress={onEndInnings} testID="prompt-batter-end-innings" />
      ) : null}
    </PanelFrame>
  );
}

export interface NextBowlerPanelProps {
  readonly vm: NextBowlerVM;
  readonly collapsed: boolean;
  readonly onExpand: () => void;
  readonly onPick: (playerId: string) => void;
  readonly onAddPlayer: () => void;
  readonly onUndo: () => void;
}

export function NextBowlerPanel({ vm, collapsed, onExpand, onPick, onAddPlayer, onUndo }: NextBowlerPanelProps) {
  if (collapsed) {
    return (
      <PanelFrame heading={vm.overTitle} onUndo={onUndo} testID="prompt-next-bowler-collapsed">
        <Button label="Choose bowler" accessibilityLabel={`Choose bowler for ${vm.overLabel}`} size="lg" fullWidth onPress={onExpand} testID="prompt-bowler-open" />
      </PanelFrame>
    );
  }
  return (
    <PanelFrame heading={vm.heading} onUndo={onUndo} testID="prompt-next-bowler">
      {vm.eligible.map((option) => (
        <OptionTile
          key={option.id}
          kind="action"
          title={option.label}
          description={option.quota}
          value={option.figures}
          onPress={() => onPick(option.id)}
          testID={`prompt-bowler-${option.id}`}
        />
      ))}
      {vm.eligible.length === 0 ? (
        <View style={styles.none} testID="prompt-bowler-none">
          <Text variant="bodyStrong">No one can bowl this over</Text>
          <Text variant="footnote" tone="secondary">
            Add a player or change the bowler limit
          </Text>
        </View>
      ) : null}
      {vm.ineligible.length > 0 ? (
        <View style={styles.ineligible} testID="prompt-bowler-ineligible">
          <Text variant="label" tone="secondary">
            {"Can't bowl this over"}
          </Text>
          {vm.ineligible.map((entry) => (
            <View key={entry.id} style={styles.ineligibleRow} accessible accessibilityLabel={`${entry.label}, can't bowl: ${entry.reason}`}>
              <Text variant="body" tone="muted" style={styles.name}>
                {entry.label}
              </Text>
              <Text variant="footnote" tone="muted" style={styles.reason}>
                {entry.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.start}>
        <Button label="Add player" icon="plus" variant="tertiary" size="sm" onPress={onAddPlayer} testID="prompt-bowler-add" />
      </View>
    </PanelFrame>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  none: { gap: space.xxs },
  ineligible: { gap: space.xxs, paddingTop: space.xs },
  ineligibleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: space.xxs, minHeight: 32 },
  name: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  reason: { flexShrink: 1 },
  start: { alignItems: 'flex-start' },
});

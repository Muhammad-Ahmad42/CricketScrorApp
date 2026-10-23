import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { DrawnRule, Icon, PressableArea, ScoreFigure, Text, space, useGutter, useTheme, type HeroSize } from '@/ui';
import type { ScoreHeaderVM } from '../selectors/scoreboard';

export type ScoreShortcut = 'dot' | 'one' | 'two' | 'three' | 'four' | 'six' | 'extras' | 'wicket' | 'undo';

export const SHORTCUT_LABEL: { readonly [K in ScoreShortcut]: string } = {
  dot: 'Score a dot ball',
  one: 'Score one run',
  two: 'Score two runs',
  three: 'Score three runs',
  four: 'Score four',
  six: 'Score six',
  extras: 'Extras…',
  wicket: 'Wicket…',
  undo: 'Undo',
};

const SHORTCUTS: readonly ScoreShortcut[] = ['dot', 'one', 'two', 'three', 'four', 'six', 'extras', 'wicket', 'undo'];

function isShortcut(name: string): name is ScoreShortcut {
  return (SHORTCUTS as readonly string[]).includes(name);
}

export interface ScoreHeaderProps {
  readonly vm: ScoreHeaderVM;
  readonly flashSix?: boolean;
  readonly wicketTrigger?: number | null;
  readonly heroSize?: HeroSize;
  readonly compact?: boolean;
  readonly lean?: boolean;
  readonly onPressScore?: () => void;
  readonly shortcuts?: readonly ScoreShortcut[];
  readonly onShortcut?: (shortcut: ScoreShortcut) => void;
}

interface RateProps {
  readonly label: string;
  readonly spoken: string;
  readonly value: string;
  readonly testID: string;
}

function Rate({ label, spoken, value, testID }: RateProps) {
  return (
    <View style={styles.rate} testID={testID} accessible accessibilityLabel={`${spoken} ${value}`}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="tableNumeric">{value}</Text>
    </View>
  );
}

export function ScoreHeader({ vm, flashSix = false, wicketTrigger = null, heroSize, compact = false, lean = false, onPressScore, shortcuts = [], onShortcut }: ScoreHeaderProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const actions = onShortcut === undefined ? [] : shortcuts.map((name) => ({ name, label: SHORTCUT_LABEL[name] }));
  const onAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (onShortcut !== undefined && isShortcut(name) && shortcuts.includes(name)) {
      onShortcut(name);
    }
  };
  const rrr = vm.rrr !== null ? <Rate label="RRR" spoken="Required run rate" value={vm.rrr} testID="score-text-rrr" /> : null;
  const inlineRequirement = lean && vm.requirement !== null && vm.requirementShort !== null;
  return (
    <View style={[styles.root, lean ? styles.leanRoot : null, { paddingHorizontal: gutter }]} testID="score-header">
      <View style={styles.labelLine}>
        <Text variant="label" tone="secondary" style={styles.flex} testID="score-text-innings">
          {vm.inningsLabel}
        </Text>
        {vm.freeHit ? (
          <View
            testID="score-free-hit"
            accessible
            accessibilityLabel="Free hit next ball"
            style={[styles.freeHit, { backgroundColor: theme.color.warningSubtle, borderRadius: theme.radius.xs }]}
          >
            <Icon name="triangle-alert" size={16} color="warning" />
            <Text variant="label" tone="warning">
              Free hit
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.scoreLine}>
        <PressableArea
          onPress={onPressScore}
          accessibilityLabel={vm.summaryLabel}
          accessibilityHint="Opens the scorecard"
          accessibilityActions={actions.length > 0 ? actions : undefined}
          onAccessibilityAction={actions.length > 0 ? onAction : undefined}
          align="start"
          testID="score-btn-scorecard"
        >
          <ScoreFigure value={vm.score} accessibilityLabel={vm.scoreLabel} size={heroSize} flashAccent={flashSix} testID="score-text-score" />
        </PressableArea>
        <View style={styles.overs} accessible accessibilityLabel={`${vm.oversLabel}${vm.oversOf ? `, ${vm.oversOf}` : ''}`}>
          <View style={styles.oversLine}>
            <Text variant={compact ? 'scoreMedium' : 'scoreLarge'} tone="score" testID="score-text-overs">
              {vm.overs}
            </Text>
            <Text variant="subhead" tone="secondary">
              ov
            </Text>
          </View>
          {vm.oversOf ? (
            <Text variant="footnote" tone="secondary" testID="score-text-overs-of">
              {vm.oversOf}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rates}>
        {inlineRequirement ? (
          <Text variant="bodyStrong" accessibilityLabel={vm.requirement ?? undefined} testID="score-text-requirement">
            {vm.requirementShort}
          </Text>
        ) : (
          <Rate label="CRR" spoken="Current run rate" value={vm.crr} testID="score-text-crr" />
        )}
        {rrr}
        {vm.target !== null ? <Rate label="Target" spoken="Target" value={vm.target} testID="score-text-target" /> : null}
      </View>
      {vm.requirement !== null && !inlineRequirement ? (
        <Text variant={compact ? 'bodyStrong' : 'headline'} testID="score-text-requirement" accessibilityRole="text">
          {vm.requirement}
        </Text>
      ) : vm.powerplay !== null && !lean ? (
        <Text variant="callout" tone="secondary" testID="score-text-powerplay">
          {vm.powerplay}
        </Text>
      ) : null}
      {vm.context !== null && !lean ? (
        <Text variant="footnote" tone="secondary" numberOfLines={compact ? 1 : 2} testID="score-text-context">
          {vm.context}
        </Text>
      ) : null}
      <DrawnRule trigger={wicketTrigger} color="danger" mode="flash" testID="score-wicket-rule" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xs, paddingBottom: space.xs, gap: space.xxs },
  leanRoot: { paddingTop: 0 },
  labelLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 24 },
  flex: { flex: 1 },
  freeHit: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xs, height: 24 },
  scoreLine: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  overs: { alignItems: 'flex-end' },
  oversLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  rates: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.md, rowGap: space.xxs, marginTop: space.xxs },
  rate: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
});

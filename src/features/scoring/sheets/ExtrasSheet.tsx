import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MatchRules, RunsTo } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { Button, SegmentedControl, Sheet, Stepper, Tabs, Text, space } from '@/ui';
import { ChipButton } from '../components/common/ChipButton';
import {
  allowsSix,
  customIntent,
  EXTRAS_TABS,
  extrasChips,
  extrasRuleNote,
  type CustomExtras,
  type ExtrasTab,
} from '../selectors/extras';

export interface ExtrasSheetProps {
  readonly visible: boolean;
  readonly rules: MatchRules;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
  readonly onPenalty?: () => void;
  readonly initialTab?: ExtrasTab;
  readonly overKey?: string | null;
  readonly title?: string;
}

interface TabMemory {
  readonly tab: ExtrasTab;
  readonly overKey: string | null;
}

const RUNS_TO_OPTIONS: readonly { readonly value: RunsTo; readonly label: string; readonly testID: string }[] = [
  { value: 'bat', label: 'Bat', testID: 'extras-runs-to-bat' },
  { value: 'bye', label: 'Byes', testID: 'extras-runs-to-bye' },
  { value: 'leg_bye', label: 'Leg byes', testID: 'extras-runs-to-leg-bye' },
];

const START: CustomExtras = { runsRun: 1, boundary: 0, shortRuns: 0 };

export function ExtrasSheet({ visible, rules, onSubmit, onClose, onPenalty, initialTab = 'wide', overKey = null, title = 'Extras' }: ExtrasSheetProps) {
  const [memory, setMemory] = useState<TabMemory>({ tab: initialTab, overKey });
  const [runsTo, setRunsTo] = useState<RunsTo>('bat');
  const [custom, setCustom] = useState<CustomExtras | null>(null);
  const [showShort, setShowShort] = useState(false);
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    setShown(visible);
    if (visible) {
      setRunsTo('bat');
      setCustom(null);
      setShowShort(false);
    }
  }
  const tab = memory.overKey === overKey ? memory.tab : initialTab;

  const chooseTab = (next: ExtrasTab) => {
    setMemory({ tab: next, overKey });
    setCustom(null);
    setShowShort(false);
  };
  const close = () => {
    setCustom(null);
    setShowShort(false);
    onClose();
  };
  const submit = (intent: ScoringIntent) => {
    setCustom(null);
    setShowShort(false);
    onSubmit(intent);
  };
  const openCustom = (withShort: boolean) => {
    setCustom({ ...START, runsRun: tab === 'other' ? 2 : 1 });
    setShowShort(withShort);
  };
  const note = extrasRuleNote(tab, rules);
  const boundaryOptions = allowsSix(tab, runsTo)
    ? [
        { value: '0', label: 'None', testID: 'extras-custom-boundary-0' },
        { value: '4', label: '4', testID: 'extras-custom-boundary-4' },
        { value: '6', label: '6', testID: 'extras-custom-boundary-6' },
      ]
    : [
        { value: '0', label: 'None', testID: 'extras-custom-boundary-0' },
        { value: '4', label: '4', testID: 'extras-custom-boundary-4' },
      ];

  return (
    <Sheet visible={visible} title={title} onClose={close} testID="sheet-extras">
      <View style={styles.body}>
        <Tabs
          tabs={EXTRAS_TABS.map((entry) => ({ key: entry.key, label: entry.label, testID: `extras-tab-${entry.key}` }))}
          selectedKey={tab}
          onSelect={chooseTab}
          accessibilityLabel="Kind of extra"
        />
        {tab === 'no_ball' ? (
          <View style={styles.runsTo}>
            <Text variant="subhead" tone="secondary">
              Runs off
            </Text>
            <SegmentedControl options={RUNS_TO_OPTIONS} value={runsTo} onChange={setRunsTo} accessibilityLabel="No-ball runs off" />
          </View>
        ) : null}
        {custom === null ? (
          <>
            <View style={styles.grid}>
              {extrasChips(tab, runsTo).map((entry) => (
                <ChipButton
                  key={entry.key}
                  label={entry.label}
                  caption={entry.caption}
                  accessibilityLabel={entry.accessibilityLabel}
                  wide={tab === 'other'}
                  onPress={() => submit(entry.intent)}
                  testID={`extras-chip-${entry.key}`}
                />
              ))}
            </View>
            <View style={styles.links}>
              {tab === 'other' ? (
                <>
                  <Button label="Short run…" variant="tertiary" size="sm" onPress={() => openCustom(true)} testID="extras-btn-short" />
                  {onPenalty ? <Button label="Penalty runs…" variant="tertiary" size="sm" onPress={onPenalty} testID="extras-btn-penalty" /> : null}
                </>
              ) : (
                <Button label="Custom…" variant="tertiary" size="sm" onPress={() => openCustom(false)} testID="extras-btn-custom" />
              )}
            </View>
          </>
        ) : (
          <View style={styles.custom} testID="extras-custom">
            <Stepper
              label="Runs run"
              value={custom.runsRun}
              min={0}
              max={9}
              onChange={(runsRun) => setCustom({ ...custom, runsRun, shortRuns: Math.min(custom.shortRuns, runsRun) })}
              testID="extras-custom-runs"
            />
            <Text variant="subhead" tone="secondary">
              Boundary
            </Text>
            <SegmentedControl
              options={boundaryOptions}
              value={String(custom.boundary)}
              onChange={(value) => setCustom({ ...custom, boundary: value === '6' ? 6 : value === '4' ? 4 : 0 })}
              accessibilityLabel="Boundary"
            />
            {showShort ? (
              <Stepper
                label="Short runs"
                value={custom.shortRuns}
                min={0}
                max={custom.runsRun}
                onChange={(shortRuns) => setCustom({ ...custom, shortRuns })}
                testID="extras-custom-short"
              />
            ) : (
              <Button label="More" variant="tertiary" size="sm" onPress={() => setShowShort(true)} testID="extras-custom-more" />
            )}
            <Button label="Record" size="lg" fullWidth onPress={() => submit(customIntent(tab, runsTo, custom))} testID="extras-custom-record" />
            <Button label="Back to choices" variant="tertiary" size="sm" onPress={() => setCustom(null)} testID="extras-custom-back" />
          </View>
        )}
        {note ? (
          <Text variant="footnote" tone="secondary" testID="extras-text-note">
            {note}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  runsTo: { gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  custom: { gap: space.sm },
});

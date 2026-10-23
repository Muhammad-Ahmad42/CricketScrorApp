import { StyleSheet, View } from 'react-native';
import { Inset, ScoreKey, space, type PadRuns, type ScoreKeyKind } from '@/ui';

export type EditKey = PadRuns | 'extras' | 'wicket';

export interface EditKeypadProps {
  readonly selected: EditKey | null;
  readonly recorded: EditKey | null;
  readonly dotStyle: 'zero' | 'dot';
  readonly onRuns: (runs: PadRuns) => void;
  readonly onExtras: () => void;
  readonly onWicket: () => void;
  readonly testIDPrefix?: string;
}

const RUN_WORDS: { readonly [K in PadRuns]: string } = {
  0: 'Zero runs',
  1: 'One run',
  2: 'Two runs',
  3: 'Three runs',
  4: 'Four runs, boundary',
  6: 'Six runs, boundary',
};

const KEY_HEIGHT = 68;
const RECORDED_TAG = 'Now';

interface KeyProps {
  readonly kind: ScoreKeyKind;
  readonly label: string;
  readonly caption: string | null;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
  readonly recorded: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function EditKeyButton({ kind, label, caption, accessibilityLabel, selected, recorded, onPress, testID }: KeyProps) {
  const spoken = [accessibilityLabel, recorded ? 'recorded' : null, selected ? 'chosen' : null].filter((part): part is string => part !== null).join(', ');
  return (
    <ScoreKey
      kind={kind}
      label={label}
      caption={caption}
      accessibilityLabel={spoken}
      selected={selected}
      tag={recorded ? RECORDED_TAG : null}
      height={KEY_HEIGHT}
      onPress={onPress}
      testID={testID}
    />
  );
}

export function recordedKeyOf(event: {
  readonly call: string;
  readonly runsTo?: string;
  readonly runsRun: number;
  readonly boundary: number;
  readonly wicket: unknown;
}): EditKey | null {
  if (event.wicket !== null) {
    return 'wicket';
  }
  if (event.call !== 'fair' || event.runsTo !== 'bat') {
    return 'extras';
  }
  const runs = event.boundary === 4 || event.boundary === 6 ? event.boundary + event.runsRun : event.runsRun;
  return runs === 0 || runs === 1 || runs === 2 || runs === 3 || runs === 4 || runs === 6 ? runs : 'extras';
}

export function EditKeypad({ selected, recorded, dotStyle, onRuns, onExtras, onWicket, testIDPrefix = 'edit-btn' }: EditKeypadProps) {
  const runKey = (runs: PadRuns) => (
    <EditKeyButton
      key={runs}
      kind="runs"
      label={runs === 0 && dotStyle === 'dot' ? '•' : `${runs}`}
      caption={runs === 4 ? 'FOUR' : runs === 6 ? 'SIX' : null}
      accessibilityLabel={runs === 0 && dotStyle === 'dot' ? 'Dot ball' : RUN_WORDS[runs]}
      selected={selected === runs}
      recorded={recorded === runs}
      onPress={() => onRuns(runs)}
      testID={`${testIDPrefix}-${runs}`}
    />
  );
  return (
    <Inset top="xs" gap="xs" testID={`${testIDPrefix}-pad`}>
      <View style={styles.row}>{([0, 1, 2, 3] as const).map(runKey)}</View>
      <View style={styles.row}>
        {runKey(4)}
        {runKey(6)}
        <EditKeyButton
          kind="extras"
          label="Extras"
          caption={null}
          accessibilityLabel="Extras"
          selected={selected === 'extras'}
          recorded={recorded === 'extras'}
          onPress={onExtras}
          testID={`${testIDPrefix}-extras`}
        />
        <EditKeyButton
          kind="wicket"
          label="Wicket"
          caption={null}
          accessibilityLabel="Wicket"
          selected={selected === 'wicket'}
          recorded={recorded === 'wicket'}
          onPress={onWicket}
          testID={`${testIDPrefix}-wicket`}
        />
      </View>
    </Inset>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
});

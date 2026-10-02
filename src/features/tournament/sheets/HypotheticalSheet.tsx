import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HypotheticalOutcome, HypotheticalResult } from '@/domain/types';
import { ChoiceList, type Choice } from '@/features/shared';
import { Button, ListRow, SegmentedControl, Sheet, Text, TextField, space } from '@/ui';
import type { FixtureRowVM } from '../selectors/fixtures';
import { OUTCOME_KEYS, hypothetical, outcomeLabel, scoreFromInput, type ScoreInput } from '../selectors/whatIf';

export interface HypotheticalSheetProps {
  readonly visible: boolean;
  readonly row: FixtureRowVM;
  readonly ballsPerOver: number;
  readonly current: HypotheticalResult | null;
  readonly onClose: () => void;
  readonly onDone: (result: HypotheticalResult | null) => void;
}

const OUTCOMES: readonly HypotheticalOutcome[] = ['side_a_win', 'side_b_win', 'tie', 'no_result', 'abandoned', 'side_a_walkover', 'side_b_walkover'];

const EMPTY_SCORE: ScoreInput = { battingFirst: 'side_a', firstRuns: '', firstOvers: '', secondRuns: '', secondOvers: '' };

export function HypotheticalSheet({ visible, row, ballsPerOver, current, onClose, onDone }: HypotheticalSheetProps) {
  const [outcome, setOutcome] = useState<HypotheticalOutcome | null>(current?.outcome ?? null);
  const [tieWinner, setTieWinner] = useState<'none' | 'side_a' | 'side_b'>(current?.tieWinner ?? 'none');
  const [withScore, setWithScore] = useState(false);
  const [score, setScore] = useState<ScoreInput>(EMPTY_SCORE);
  const parsedScore = withScore ? scoreFromInput(score, ballsPerOver) : null;
  const scoreInvalid = withScore && parsedScore === null;
  const played = outcome === 'side_a_win' || outcome === 'side_b_win' || outcome === 'tie';
  const choices: readonly Choice<HypotheticalOutcome>[] = OUTCOMES.map((value) => ({
    value,
    label: outcomeLabel(value, row),
    testID: `whatif-chip-${row.matchNumber}-${OUTCOME_KEYS[value]}`,
  }));
  return (
    <Sheet
      visible={visible}
      title={`${row.label} · ${row.teamsText}`}
      subtitle="Hypothetical result"
      onClose={onClose}
      testID="sheet-hypothetical"
      footer={
        <View style={styles.footer}>
          <View style={styles.flex}>
            <Button label="Clear" variant="secondary" onPress={() => onDone(null)} fullWidth testID="whatif-btn-clear-one" />
          </View>
          <View style={styles.flex}>
            <Button
              label="Done"
              disabled={outcome === null || scoreInvalid}
              onPress={() => {
                if (outcome !== null) {
                  onDone(hypothetical(row.fixtureId, outcome, played ? parsedScore : null, tieWinner === 'none' ? null : tieWinner));
                }
              }}
              fullWidth
              testID="whatif-btn-done"
            />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <ChoiceList choices={choices} value={outcome} onChange={setOutcome} accessibilityLabel="Result" />
        {outcome === 'tie' ? (
          <SegmentedControl
            options={[
              { value: 'none', label: 'Tie stands' },
              { value: 'side_a', label: `${row.a.text} win tie-break` },
              { value: 'side_b', label: `${row.b.text} win tie-break` },
            ]}
            value={tieWinner}
            onChange={setTieWinner}
            accessibilityLabel="Tie-break winner"
          />
        ) : null}
        {played ? (
          <ListRow
            title="Add a score (for net run rate)"
            trailing={{ kind: 'switch', value: withScore, onValueChange: setWithScore }}
            separator={false}
            testID="whatif-toggle-score"
          />
        ) : null}
        {played && withScore ? (
          <View style={styles.score}>
            <SegmentedControl
              options={[
                { value: 'side_a', label: `${row.a.text} bat first` },
                { value: 'side_b', label: `${row.b.text} bat first` },
              ]}
              value={score.battingFirst}
              onChange={(battingFirst) => setScore({ ...score, battingFirst })}
              accessibilityLabel="Batting first"
            />
            <View style={styles.pair}>
              <View style={styles.flex}>
                <TextField label="1st innings runs" value={score.firstRuns} onChangeText={(firstRuns) => setScore({ ...score, firstRuns })} numeric testID="whatif-input-first-runs" />
              </View>
              <View style={styles.flex}>
                <TextField label="Overs" value={score.firstOvers} onChangeText={(firstOvers) => setScore({ ...score, firstOvers })} keyboardType="decimal-pad" placeholder="20" testID="whatif-input-first-overs" />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <TextField label="2nd innings runs" value={score.secondRuns} onChangeText={(secondRuns) => setScore({ ...score, secondRuns })} numeric testID="whatif-input-second-runs" />
              </View>
              <View style={styles.flex}>
                <TextField label="Overs" value={score.secondOvers} onChangeText={(secondOvers) => setScore({ ...score, secondOvers })} keyboardType="decimal-pad" placeholder="18.4" testID="whatif-input-second-overs" />
              </View>
            </View>
            {scoreInvalid ? (
              <Text variant="footnote" tone="danger">
                Enter runs and overs for both innings, for example 165 in 20 and 166 in 18.4.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  footer: { flexDirection: 'row', gap: space.xs },
  flex: { flex: 1 },
  score: { gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HypotheticalOutcome, HypotheticalResult } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { Button, ListRow, RadioList, SegmentedControl, Sheet, Text, TextField, space, useFormChain, type ChoiceOption } from '@/ui';
import type { FixtureRowVM } from '../selectors/fixtures';
import { OUTCOME_KEYS, hypothetical, marginFromInput, outcomeLabel, scoreFromInput, type MarginInput, type MarginKind, type ScoreInput } from '../selectors/whatIf';

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

type MarginField = 'wickets' | 'balls';
type ScoreField = 'firstRuns' | 'firstOvers' | 'secondRuns' | 'secondOvers';

const MARGIN_FIELDS: readonly MarginField[] = ['wickets', 'balls'];
const SCORE_FIELDS: readonly ScoreField[] = ['firstRuns', 'firstOvers', 'secondRuns', 'secondOvers'];

function initialMargin(current: HypotheticalResult | null): MarginInput {
  const margin = current?.margin ?? null;
  if (margin === null) {
    return { kind: 'none', runs: '', wickets: '', ballsLeft: '' };
  }
  if (margin.kind === 'runs') {
    return { kind: 'runs', runs: String(margin.runs), wickets: '', ballsLeft: '' };
  }
  return { kind: 'wickets', runs: '', wickets: String(margin.wickets), ballsLeft: String(margin.ballsRemaining) };
}

export function HypotheticalSheet({ visible, row, ballsPerOver, current, onClose, onDone }: HypotheticalSheetProps) {
  const [outcome, setOutcome] = useState<HypotheticalOutcome | null>(current?.outcome ?? null);
  const [tieWinner, setTieWinner] = useState<'none' | 'side_a' | 'side_b'>(current?.tieWinner ?? 'none');
  const [withScore, setWithScore] = useState(false);
  const [score, setScore] = useState<ScoreInput>(EMPTY_SCORE);
  const [margin, setMargin] = useState<MarginInput>(initialMargin(current));
  const dirty =
    outcome !== (current?.outcome ?? null) ||
    tieWinner !== (current?.tieWinner ?? 'none') ||
    withScore ||
    JSON.stringify(margin) !== JSON.stringify(initialMargin(current));
  const guard = useDiscardGuard(dirty, onClose);
  const marginChain = useFormChain(MARGIN_FIELDS);
  const scoreChain = useFormChain(SCORE_FIELDS);
  const parsedScore = withScore ? scoreFromInput(score, ballsPerOver) : null;
  const scoreInvalid = withScore && parsedScore === null;
  const played = outcome === 'side_a_win' || outcome === 'side_b_win' || outcome === 'tie';
  const decided = outcome === 'side_a_win' || outcome === 'side_b_win';
  const parsedMargin = decided && !withScore ? marginFromInput(margin) : null;
  const marginInvalid = parsedMargin === 'invalid';
  const choices: readonly ChoiceOption<HypotheticalOutcome>[] = OUTCOMES.map((value) => ({
    value,
    label: outcomeLabel(value, row),
    testID: `whatif-chip-${row.matchNumber}-${OUTCOME_KEYS[value]}`,
  }));
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Pick result"
        subtitle={`${row.label} · ${row.teamsText}`}
        onClose={guard.requestClose}
        testID="sheet-hypothetical"
        footer={
          <View style={styles.footer}>
            <View style={styles.flex}>
              <Button label="Clear" variant="secondary" onPress={() => onDone(null)} fullWidth testID="whatif-btn-clear-one" />
            </View>
            <View style={styles.flex}>
              <Button
                label="Done"
                disabled={outcome === null || scoreInvalid || marginInvalid}
                onPress={() => {
                  if (outcome !== null) {
                    onDone(
                      hypothetical(
                        row.fixtureId,
                        outcome,
                        played ? parsedScore : null,
                        tieWinner === 'none' ? null : tieWinner,
                        parsedMargin === 'invalid' ? null : parsedMargin,
                      ),
                    );
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
          <RadioList choices={choices} value={outcome} onChange={setOutcome} accessibilityLabel="Result" />
          {outcome === 'tie' ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Tie-break
              </Text>
              <RadioList
                choices={[
                  { value: 'none', label: 'Tie stands', testID: 'whatif-chip-tie-none' },
                  { value: 'side_a', label: `${row.a.text} win`, testID: 'whatif-chip-tie-a' },
                  { value: 'side_b', label: `${row.b.text} win`, testID: 'whatif-chip-tie-b' },
                ]}
                value={tieWinner}
                onChange={setTieWinner}
                accessibilityLabel="Tie-break winner"
              />
            </View>
          ) : null}
          {decided && !withScore ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Winning margin
              </Text>
              <SegmentedControl
                options={[
                  { value: 'none', label: 'None', testID: 'whatif-chip-margin-none' },
                  { value: 'runs', label: 'By runs', testID: 'whatif-chip-margin-runs' },
                  { value: 'wickets', label: 'By wickets', testID: 'whatif-chip-margin-wickets' },
                ]}
                value={margin.kind}
                onChange={(kind: MarginKind) => setMargin({ ...margin, kind })}
                accessibilityLabel="Winning margin"
              />
              {margin.kind === 'runs' ? (
                <TextField label="Won by (runs)" value={margin.runs} onChangeText={(runs) => setMargin({ ...margin, runs })} numeric returnKeyType="done" testID="whatif-input-margin-runs" />
              ) : null}
              {margin.kind === 'wickets' ? (
                <View style={styles.pair}>
                  <View style={styles.flex}>
                    <TextField
                      label="Won by (wickets)"
                      value={margin.wickets}
                      onChangeText={(wickets) => setMargin({ ...margin, wickets })}
                      numeric
                      {...marginChain.field('wickets')}
                      testID="whatif-input-margin-wickets"
                    />
                  </View>
                  <View style={styles.flex}>
                    <TextField
                      label="Balls left"
                      value={margin.ballsLeft}
                      onChangeText={(ballsLeft) => setMargin({ ...margin, ballsLeft })}
                      numeric
                      placeholder="0"
                      {...marginChain.field('balls')}
                      testID="whatif-input-margin-balls"
                    />
                  </View>
                </View>
              ) : null}
              <Text variant="footnote" tone={marginInvalid ? 'danger' : 'secondary'}>
                {marginInvalid ? 'Enter at least 1 run, or 1 to 10 wickets.' : 'Moves net run rate too.'}
              </Text>
            </View>
          ) : null}
          {played ? (
            <ListRow title="Add exact score" trailing={{ kind: 'switch', value: withScore, onValueChange: setWithScore }} separator={false} testID="whatif-toggle-score" />
          ) : null}
          {played && withScore ? (
            <View style={styles.group}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Batting first
              </Text>
              <RadioList
                choices={[
                  { value: 'side_a', label: row.a.text, testID: 'whatif-chip-bat-a' },
                  { value: 'side_b', label: row.b.text, testID: 'whatif-chip-bat-b' },
                ]}
                value={score.battingFirst}
                onChange={(battingFirst) => setScore({ ...score, battingFirst })}
                accessibilityLabel="Batting first"
              />
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <TextField
                    label="1st innings runs"
                    value={score.firstRuns}
                    onChangeText={(firstRuns) => setScore({ ...score, firstRuns })}
                    numeric
                    {...scoreChain.field('firstRuns')}
                    testID="whatif-input-first-runs"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label="Overs"
                    value={score.firstOvers}
                    onChangeText={(firstOvers) => setScore({ ...score, firstOvers })}
                    numeric="decimal"
                    placeholder="20"
                    {...scoreChain.field('firstOvers')}
                    testID="whatif-input-first-overs"
                  />
                </View>
              </View>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <TextField
                    label="2nd innings runs"
                    value={score.secondRuns}
                    onChangeText={(secondRuns) => setScore({ ...score, secondRuns })}
                    numeric
                    {...scoreChain.field('secondRuns')}
                    testID="whatif-input-second-runs"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label="Overs"
                    value={score.secondOvers}
                    onChangeText={(secondOvers) => setScore({ ...score, secondOvers })}
                    numeric="decimal"
                    placeholder="18.4"
                    {...scoreChain.field('secondOvers')}
                    testID="whatif-input-second-overs"
                  />
                </View>
              </View>
              {scoreInvalid ? (
                <Text variant="footnote" tone="danger">
                  Enter runs and overs for both innings.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  footer: { flexDirection: 'row', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  group: { gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
});

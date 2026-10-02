import { StyleSheet, View } from 'react-native';
import { Button, ResultLine, Text, space } from '@/ui';
import type { SuspensionVM } from '../../selectors/options';
import { PanelFrame } from './PanelFrame';

export interface ResumePlayPanelProps {
  readonly vm: SuspensionVM;
  readonly onResume: () => void;
  readonly onReviseOvers: () => void;
  readonly onEndMatch: () => void;
  readonly onPenalty: () => void;
  readonly onUndo: () => void;
}

export function ResumePlayPanel({ vm, onResume, onReviseOvers, onEndMatch, onPenalty, onUndo }: ResumePlayPanelProps) {
  return (
    <PanelFrame heading={vm.heading} subheading={vm.since} onUndo={onUndo} undoLabel="Undo last action" testID="prompt-resume-play">
      <Button label="Resume play" size="lg" fullWidth onPress={onResume} testID="prompt-resume-btn" />
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Button label="Revise overs" variant="secondary" fullWidth onPress={onReviseOvers} testID="prompt-resume-revise" />
        </View>
        <View style={styles.flex}>
          <Button label="End match…" variant="secondary" fullWidth onPress={onEndMatch} testID="prompt-resume-end" />
        </View>
      </View>
      <Button label="Penalty runs" variant="tertiary" size="sm" onPress={onPenalty} testID="prompt-resume-penalty" />
    </PanelFrame>
  );
}

export interface ConfirmResultPanelProps {
  readonly text: string;
  readonly inTournament: boolean;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onUndo: () => void;
}

export function ConfirmResultPanel({ text, inTournament, busy, onConfirm, onUndo }: ConfirmResultPanelProps) {
  return (
    <PanelFrame heading="Match result" onUndo={onUndo} testID="prompt-confirm-result">
      <Text variant="title2" testID="prompt-result-text">
        {text}
      </Text>
      <Text variant="callout" tone="secondary">
        {inTournament ? 'Confirm to finish the match and update the tournament standings.' : 'Confirm to finish the match.'}
      </Text>
      <Button label="Confirm result" size="lg" fullWidth loading={busy} onPress={onConfirm} testID="prompt-confirm-btn" />
    </PanelFrame>
  );
}

export interface ResolveTiePanelProps {
  readonly heading: string;
  readonly options: readonly ('super_over' | 'accept_tie' | 'decide_other')[];
  readonly nextRound: number | null;
  readonly onSuperOver: () => void;
  readonly onAcceptTie: () => void;
  readonly onDecideOther: () => void;
  readonly onUndo: () => void;
}

export function ResolveTiePanel({ heading, options, nextRound, onSuperOver, onAcceptTie, onDecideOther, onUndo }: ResolveTiePanelProps) {
  return (
    <PanelFrame heading={heading} onUndo={onUndo} testID="prompt-resolve-tie">
      {options.includes('super_over') ? (
        <Button
          label={nextRound !== null && nextRound > 1 ? `Play super over ${nextRound}` : 'Play a super over'}
          size="lg"
          fullWidth
          onPress={onSuperOver}
          testID="prompt-tie-super-over"
        />
      ) : null}
      <View style={styles.pair}>
        {options.includes('accept_tie') ? (
          <View style={styles.flex}>
            <Button label="Accept the tie" variant="secondary" fullWidth onPress={onAcceptTie} testID="prompt-tie-accept" />
          </View>
        ) : null}
        {options.includes('decide_other') ? (
          <View style={styles.flex}>
            <Button label="Decide another way" variant="secondary" fullWidth onPress={onDecideOther} testID="prompt-tie-other" />
          </View>
        ) : null}
      </View>
    </PanelFrame>
  );
}

export interface MatchOverPanelProps {
  readonly resultText: string;
  readonly onScorecard: () => void;
  readonly onAnalytics: () => void;
}

export function MatchOverPanel({ resultText, onScorecard, onAnalytics }: MatchOverPanelProps) {
  return (
    <PanelFrame heading="Match complete" testID="prompt-match-over">
      <ResultLine text={resultText} />
      <Button label="View scorecard" size="lg" fullWidth onPress={onScorecard} testID="prompt-over-scorecard" />
      <Button label="Analytics" variant="secondary" fullWidth onPress={onAnalytics} testID="prompt-over-analytics" />
    </PanelFrame>
  );
}

export interface RepairPanelProps {
  readonly message: string;
  readonly canReview: boolean;
  readonly onReview: () => void;
  readonly onUndo: () => void;
}

export function RepairPanel({ message, canReview, onReview, onUndo }: RepairPanelProps) {
  return (
    <PanelFrame heading="This match needs repair" tone="danger" testID="prompt-repair">
      <Text variant="body" testID="prompt-repair-text">
        {`One recorded event can't be applied: ${message}`}
      </Text>
      <Text variant="footnote" tone="secondary">
        Scoring is paused until the log is repaired. Every ball is still saved.
      </Text>
      <View style={styles.pair}>
        {canReview ? (
          <View style={styles.flex}>
            <Button label="Review ball" fullWidth onPress={onReview} testID="prompt-repair-review" />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button label="Undo last action" variant="secondary" fullWidth onPress={onUndo} testID="prompt-repair-undo" />
        </View>
      </View>
    </PanelFrame>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.xs },
  flex: { flex: 1 },
});

import { StyleSheet, View } from 'react-native';
import type { QualificationState } from '@/domain/types';
import { Badge, Text, space } from '@/ui';
import { CERTAINTY_LABEL, QUALIFICATION_STATE_LABEL, qualificationBadge, qualificationSummary, type QualificationCertainty } from './qualification';

export interface QualificationTextProps {
  readonly state: QualificationState;
  readonly certainty: QualificationCertainty;
  readonly explanation: string;
  readonly manual: boolean;
  readonly detail?: string | null;
  readonly compact?: boolean;
  readonly testID?: string;
  readonly explanationTestID?: string;
  readonly badgeTestID?: string;
}

export function QualificationText({
  state,
  certainty,
  explanation,
  manual,
  detail,
  compact = false,
  testID,
  explanationTestID,
  badgeTestID,
}: QualificationTextProps) {
  const badge = qualificationBadge(state, manual);
  const certaintyText = !manual && state !== 'in_contention' ? CERTAINTY_LABEL[certainty] : null;
  const summary = qualificationSummary(state, certainty, manual);
  const label = [summary, detail, explanation].filter((part): part is string => Boolean(part)).join('. ');
  return (
    <View testID={testID} style={styles.root} accessible accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.line}>
        <Badge label={badge.label} tone={badge.tone} testID={badgeTestID} />
        {manual ? (
          <Text variant="footnote" tone="secondary">
            {QUALIFICATION_STATE_LABEL[state]}
          </Text>
        ) : null}
        {certaintyText ? (
          <Text variant="footnote" tone="secondary">
            {certaintyText}
          </Text>
        ) : null}
        {detail ? (
          <Text variant="footnote" tone="secondary">
            {`· ${detail}`}
          </Text>
        ) : null}
      </View>
      {explanation.length > 0 ? (
        <Text variant="footnote" tone="primary" numberOfLines={compact ? 2 : undefined} testID={explanationTestID}>
          {explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xxs },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
});

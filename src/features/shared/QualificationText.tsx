import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { QualificationState } from '@/domain/types';
import { Badge, Button, SUPPORTING_MAX, Sheet, Text, WHY_LABEL, space } from '@/ui';
import { CERTAINTY_LABEL, QUALIFICATION_STATE_LABEL, qualificationBadge, qualificationSummary, type QualificationCertainty } from './qualification';

export interface QualificationTextProps {
  readonly state: QualificationState;
  readonly certainty: QualificationCertainty;
  readonly explanation: string;
  readonly manual: boolean;
  readonly detail?: string | null;
  readonly concise?: boolean;
  readonly showBadge?: boolean;
  readonly spokenExplanation?: string;
  readonly whyTitle?: string;
  readonly why?: string | null;
  readonly testID?: string;
  readonly explanationTestID?: string;
  readonly badgeTestID?: string;
}

export function fitsInline(text: string): boolean {
  return text.trim().length <= SUPPORTING_MAX;
}

export function QualificationText({
  state,
  certainty,
  explanation,
  manual,
  detail,
  concise = false,
  showBadge,
  spokenExplanation,
  whyTitle,
  why,
  testID,
  explanationTestID,
  badgeTestID,
}: QualificationTextProps) {
  const [open, setOpen] = useState(false);
  const badge = qualificationBadge(state, manual);
  const badgeShown = showBadge ?? (!concise || manual || state !== 'in_contention');
  const certaintyText = !manual && state !== 'in_contention' ? CERTAINTY_LABEL[certainty] : null;
  const summary = qualificationSummary(state, certainty, manual);
  const label = [summary, detail, spokenExplanation ?? explanation].filter((part): part is string => Boolean(part)).join('. ');
  const leading = [manual && badgeShown ? QUALIFICATION_STATE_LABEL[state] : null, certaintyText].filter((part): part is string => part !== null);
  const detailText = detail ? (badgeShown || leading.length > 0 ? `· ${detail}` : detail) : null;
  const hasMeta = badgeShown || leading.length > 0 || detailText !== null;
  const hasExplanation = explanation.trim().length > 0;
  const inline = hasExplanation && fitsInline(explanation);
  const whyText = why && why.trim().length > 0 ? why.trim() : null;
  const disclosed = whyText !== null || (hasExplanation && !inline);
  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.line}>
        <View style={styles.text} accessible accessibilityRole="text" accessibilityLabel={label}>
          {hasMeta ? (
            <View style={styles.meta}>
              {badgeShown ? <Badge label={badge.label} tone={badge.tone} testID={badgeTestID} /> : null}
              {leading.map((part) => (
                <Text key={part} variant="footnote" tone="secondary">
                  {part}
                </Text>
              ))}
              {detailText ? (
                <Text variant="footnote" tone="secondary">
                  {detailText}
                </Text>
              ) : null}
            </View>
          ) : null}
          {inline ? (
            <Text variant="footnote" tone={concise ? 'secondary' : 'primary'} testID={explanationTestID}>
              {explanation}
            </Text>
          ) : null}
        </View>
        {disclosed ? (
          <Button
            label={WHY_LABEL}
            variant="tertiary"
            size="sm"
            accessibilityLabel={`Why: ${summary}`}
            onPress={() => setOpen(true)}
            testID={explanationTestID ? `${explanationTestID}-why` : undefined}
          />
        ) : null}
      </View>
      {disclosed ? (
        <Sheet visible={open} title={whyTitle ?? summary} onClose={() => setOpen(false)} testID={explanationTestID ? `${explanationTestID}-sheet` : undefined}>
          <View style={styles.sheetBody}>
            {inline || !hasExplanation ? null : (
              <Text variant="callout" testID={explanationTestID}>
                {explanation}
              </Text>
            )}
            {whyText ? (
              <Text variant="callout" tone={!inline && hasExplanation ? 'secondary' : 'primary'} testID={explanationTestID ? `${explanationTestID}-detail` : undefined}>
                {whyText}
              </Text>
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xxs },
  sheetBody: { gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
});

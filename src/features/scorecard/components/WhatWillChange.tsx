import { StyleSheet, View } from 'react-native';
import type { ImpactSummary } from '@/domain/types';
import { Banner, BoundaryRule, Disclosure, ExplainedText, InlineNotice, Inset, SectionHeader, Text, space, useGutter, useTheme } from '@/ui';
import { hasImpactSections, ImpactSections, impactDetailsLabel, impactViewModel } from '@/features/shared';
import type { ChangeRowVM, EditPreviewVM } from '../selectors/historyEdit';

function ChangeRow({ row }: { readonly row: ChangeRowVM }) {
  const theme = useTheme();
  const gutter = useGutter();
  return (
    <View
      style={[styles.row, { paddingHorizontal: gutter, borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
      accessible
      accessibilityLabel={row.changed ? `${row.label}: ${row.before} changes to ${row.after}` : `${row.label}: ${row.after}`}
      testID={`change-${row.key}`}
    >
      <Text variant="subhead" tone="secondary" style={styles.label}>
        {row.label}
      </Text>
      <Text variant={row.changed ? 'bodyStrong' : 'body'} style={styles.value}>
        {row.changed ? `${row.before} → ${row.after}` : row.after}
      </Text>
    </View>
  );
}

export interface ImpactBlockProps {
  readonly impact: ImpactSummary;
  readonly teamName: (teamId: string) => string;
}

export function ImpactBlock({ impact, teamName }: ImpactBlockProps) {
  const vm = impactViewModel(impact, { team: teamName, pool: () => null, stage: () => 'Stage' });
  return (
    <View testID="edit-impact">
      <SectionHeader title="Tournament" />
      <Inset gap="xs">
        <Text variant="headline" testID="edit-impact-headline">
          {vm.headline}
        </Text>
        {vm.keyItems.map((item, index) => (
          <ExplainedText
            key={item.key}
            headline={item.headline}
            supporting={item.detail}
            headlineVariant="callout"
            tone="secondary"
            testID={`edit-impact-line-${index + 1}`}
          />
        ))}
        {vm.severityNotice !== null ? (
          <Text variant="footnote" tone="secondary" testID="edit-impact-notice">
            {vm.severityNotice}
          </Text>
        ) : null}
        {vm.shortfalls.map((line) => (
          <InlineNotice key={line.key} tone="warning" headline={line.text} detail={line.detail ?? null} testID={`edit-impact-shortfall-${line.key}`} />
        ))}
        {vm.blockedReason !== null ? <InlineNotice tone="danger" headline={vm.blockedReason} testID="edit-impact-blocked" /> : null}
        {hasImpactSections(vm) ? (
          <Disclosure label={impactDetailsLabel(vm)} testID="edit-impact-details">
            <ImpactSections vm={vm} showShortfalls={false} />
          </Disclosure>
        ) : null}
      </Inset>
    </View>
  );
}

export interface WhatWillChangeProps {
  readonly vm: EditPreviewVM;
  readonly impact: ImpactSummary | null;
  readonly notes: readonly string[];
  readonly teamName: (teamId: string) => string;
}

export function WhatWillChange({ vm, impact, notes, teamName }: WhatWillChangeProps) {
  return (
    <View testID="edit-preview">
      <BoundaryRule />
      <SectionHeader title="What will change" />
      {vm.warning !== null ? (
        <Banner
          tone="warning"
          message={vm.warning.headline}
          supporting={vm.warning.detail ?? null}
          testID={vm.reopensMatch ? 'edit-reopens' : vm.resultChanged ? 'edit-result-change' : 'edit-warning'}
        />
      ) : null}
      {vm.consequences.length > 0 ? (
        <Inset top="xs" gap="xs" testID="edit-consequences">
          {vm.consequences.map((item) => (
            <ExplainedText key={`line:${item.headline}`} headline={item.headline} supporting={item.detail ?? null} headlineVariant="callout" />
          ))}
        </Inset>
      ) : null}
      {vm.rows.map((row) => (
        <ChangeRow key={row.key} row={row} />
      ))}
      {vm.rows.length === 0 ? (
        <Inset top="xs">
          <Text variant="callout" tone="secondary" testID="edit-no-score-change">
            No totals or figures change
          </Text>
        </Inset>
      ) : null}
      {vm.resultLine !== null ? (
        <Inset top="xs">
          <Text variant="callout" testID="edit-result-unchanged">
            {vm.resultLine}
          </Text>
        </Inset>
      ) : null}
      {notes.length > 0 ? (
        <Inset top="xs" gap="xxs">
          {notes.map((note) => (
            <Text key={note} variant="footnote" tone="secondary">
              {note}
            </Text>
          ))}
        </Inset>
      ) : null}
      {impact !== null ? <ImpactBlock impact={impact} teamName={teamName} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: space.xxs, minHeight: 44, paddingVertical: space.xxs },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: '30%', minWidth: 0 },
  value: { flexGrow: 2, flexShrink: 1, flexBasis: '55%', minWidth: 0, fontVariant: ['tabular-nums'] },
});

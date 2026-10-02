import { StyleSheet, View } from 'react-native';
import type { ImpactSummary } from '@/domain/types';
import { Banner, BoundaryRule, SectionHeader, Text, space, useTheme } from '@/ui';
import { ImpactSections, impactViewModel } from '@/features/shared';
import type { ChangeRowVM, EditPreviewVM } from '../selectors/historyEdit';

function ChangeRow({ row }: { readonly row: ChangeRowVM }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.row, { borderBottomWidth: theme.borderWidth.hairline, borderBottomColor: theme.color.border }]}
      accessible
      accessibilityLabel={row.changed ? `${row.label}: ${row.before} changes to ${row.after}` : `${row.label}: ${row.after}`}
      testID={`change-${row.key}`}
    >
      <Text variant="subhead" tone="secondary" style={styles.label} numberOfLines={1}>
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
      <View style={styles.impact}>
        <ImpactSections vm={vm} />
        {impact.completedMatchesAffected > 0 ? (
          <Text variant="footnote" tone="secondary">{`Completed matches affected: ${impact.completedMatchesAffected}`}</Text>
        ) : null}
        {vm.blockedReason !== null ? <Banner tone="danger" message={vm.blockedReason} testID="edit-impact-blocked" /> : null}
      </View>
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
      {vm.rows.map((row) => (
        <ChangeRow key={row.key} row={row} />
      ))}
      {vm.resultChanged ? (
        <Banner tone="warning" message={`Result changes: ${vm.result.before} → ${vm.result.after}`} testID="edit-result-change" />
      ) : (
        <ChangeRow row={vm.result} />
      )}
      {notes.map((note) => (
        <Text key={note} variant="footnote" tone="secondary" style={styles.note}>
          {note}
        </Text>
      ))}
      {impact !== null ? <ImpactBlock impact={impact} teamName={teamName} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 44, paddingVertical: space.xxs },
  label: { width: 120 },
  value: { flex: 1, fontVariant: ['tabular-nums'] },
  impact: { paddingHorizontal: space.md, gap: space.xs },
  note: { paddingHorizontal: space.md, paddingTop: space.xs },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PoolId, StageId, TeamId, TournamentId } from '@/domain/types';
import { ImpactSheet, ManualOverrideBadge, QualificationText } from '@/features/shared';
import { Banner, Button, EmptyState, IconButton, Inset, SectionHeader, SegmentedControl, Separator, Text, space, useGutter } from '@/ui';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { newId, nowIso } from '../ids';
import type { TournamentIndex } from '../selectors/names';
import { teamOverride, tieResolutionOverride } from '../selectors/overrides';
import { editPolicy } from '../selectors/policy';
import { qualificationVM, type QualificationRowVM } from '../selectors/qualification';
import { stagesWithTables } from '../selectors/standings';
import { OverrideSheet } from '../sheets/OverrideSheet';
import { TieResolutionSheet } from '../sheets/TieResolutionSheet';
import { TournamentContainer } from './TournamentContainer';

export interface QualificationScreenProps {
  readonly tournamentId: TournamentId;
}

interface TieGroup {
  readonly key: string;
  readonly poolId: PoolId | null;
  readonly teamIds: readonly TeamId[];
  readonly text: string;
}

function tieGroups(index: TournamentIndex, stageId: StageId): readonly TieGroup[] {
  const stage = index.evaluation?.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage) {
    return [];
  }
  return stage.tables.flatMap((table) =>
    table.unresolvedTies.map((teamIds, position) => ({
      key: `${table.poolId ?? 'table'}-${position}`,
      poolId: table.poolId,
      teamIds,
      text: `${teamIds.map((teamId) => index.teamName(teamId)).join(' and ')} can't be separated${table.poolId ? ` in ${index.poolName(table.poolId)}` : ''}.`,
    })),
  );
}

function qualificationStage(index: TournamentIndex, selected: StageId | null) {
  const stages = stagesWithTables(index);
  return stages.find((candidate) => candidate.stageId === selected) ?? stages.find((candidate) => candidate.stageId === index.evaluation?.currentStageId) ?? stages[0];
}

function QualificationStagePicker({ index, selected, onChange }: { readonly index: TournamentIndex; readonly selected: StageId | null; readonly onChange: (stageId: StageId) => void }) {
  const stages = stagesWithTables(index);
  const stage = qualificationStage(index, selected);
  if (!stage || stages.length <= 1) {
    return null;
  }
  return (
    <Inset bottom="xs">
      <SegmentedControl
        options={stages.map((candidate) => ({ value: candidate.stageId, label: index.stageName(candidate.stageId) }))}
        value={stage.stageId}
        onChange={onChange}
        accessibilityLabel="Stage"
      />
    </Inset>
  );
}

function QualificationBody({ index, selected }: { readonly index: TournamentIndex; readonly selected: StageId | null }) {
  const flow = useChangeFlow();
  const gutter = useGutter();
  const [overrideFor, setOverrideFor] = useState<QualificationRowVM | null>(null);
  const [tie, setTie] = useState<TieGroup | null>(null);
  const stage = qualificationStage(index, selected);
  if (!stage) {
    return <EmptyState icon="trophy" title="No qualification yet" body="It appears once a stage has a table." testID="qualification-empty" />;
  }
  const vm = qualificationVM(index, stage);
  const canOverride = editPolicy(index).overrides !== 'forbidden';
  const ties = tieGroups(index, stage.stageId);
  const tournamentId = index.snapshot.tournament.id;
  const offsets = vm.sections.map((_, position) => vm.sections.slice(0, position).reduce((sum, section) => sum + section.rows.length, 0));

  return (
    <View>
      <Inset top="sm" bottom="sm">
        <Text variant="callout" testID="qual-text-rule">
          {vm.rulesText}
        </Text>
      </Inset>
      {ties.map((group, position) => (
        <Banner
          key={group.key}
          tone="warning"
          message={group.text}
          action={canOverride ? { label: 'Decide order', onPress: () => setTie(group), testID: `qual-btn-tie-${position + 1}` } : undefined}
          testID={`qual-text-tie-${position + 1}`}
        />
      ))}
      {vm.sections.map((section, sectionPosition) => (
        <View key={section.state}>
          <Separator />
          <SectionHeader title={section.title} />
          {section.rows.map((row, rowPosition) => {
            const n = offsets[sectionPosition] + rowPosition + 1;
            const meta = [row.where, row.slots, row.record].filter((part): part is string => part !== null).join(' · ');
            return (
              <View key={row.key} style={[styles.row, { paddingLeft: gutter, paddingRight: canOverride ? Math.max(space.xxs, gutter - space.sm) : gutter }]} testID={`qual-row-${n}`}>
                <View style={styles.rowHead}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{row.team}</Text>
                    {meta.length > 0 ? (
                      <Text variant="footnote" tone="secondary">
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                  {canOverride ? (
                    <IconButton
                      icon="ellipsis"
                      accessibilityLabel={`Override for ${row.team}`}
                      onPress={() => setOverrideFor(row)}
                      testID={`qual-btn-override-${n}`}
                    />
                  ) : null}
                </View>
                <QualificationText
                  state={row.state}
                  certainty={row.certainty}
                  explanation={row.headline ?? row.condition ?? ''}
                  spokenExplanation={row.explanation}
                  manual={row.manual}
                  whyTitle={row.team}
                  why={row.detail}
                  concise
                  showBadge={row.manual}
                  explanationTestID={`qual-text-explanation-${n}`}
                  badgeTestID={row.manual ? `qual-badge-manual-${n}` : `qual-badge-${n}`}
                />
                {row.manual && row.reason ? (
                  <Text variant="footnote" tone="secondary">
                    {`Reason: “${row.reason}”`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      {vm.overrides.length > 0 ? (
        <View>
          <Separator />
          <SectionHeader title="Manual overrides" />
          {vm.overrides.map((override, position) => (
            <View key={override.id} style={[styles.row, { paddingHorizontal: gutter }]} testID={`qual-row-override-${position + 1}`}>
              <ManualOverrideBadge reason={override.reason} showReason={false} testID={`qual-badge-override-${position + 1}`} />
              <Text variant="body">{override.text}</Text>
              <Text variant="footnote" tone="secondary">
                {override.date ? `“${override.reason}” · ${override.date}` : `“${override.reason}”`}
              </Text>
              {canOverride ? (
                <View style={styles.revoke}>
                  <Button
                    label="Revoke"
                    variant="tertiary"
                    size="sm"
                    onPress={() =>
                      void flow.start({ kind: 'override_revoke', overrideId: override.id }, { reasonRequired: true, successMessage: 'Override revoked' })
                    }
                    testID={`qual-btn-revoke-${position + 1}`}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {overrideFor ? (
        <OverrideSheet
          visible
          teamName={overrideFor.team}
          targets={vm.targets}
          onClose={() => setOverrideFor(null)}
          onSubmit={(value) => {
            const row = overrideFor;
            setOverrideFor(null);
            const override = teamOverride({
              tournamentId,
              reason: value.reason,
              ids: newId,
              now: nowIso(),
              sourceStageId: stage.stageId,
              targetStageId: value.targetStageId,
              teamId: row.teamId,
              poolId: row.poolId,
              action: value.action,
              slotId: value.slotId,
              points: value.points,
            });
            if (override !== null) {
              void flow.start({ kind: 'override_apply', override }, { reason: value.reason, reasonRequired: true, successMessage: 'Manual Override applied' });
            }
          }}
        />
      ) : null}
      {tie ? (
        <TieResolutionSheet
          visible
          title="Decide the order"
          teams={tie.teamIds.map((teamId) => ({ teamId, name: index.teamName(teamId) }))}
          onClose={() => setTie(null)}
          onSubmit={(value) => {
            const group = tie;
            setTie(null);
            const override = tieResolutionOverride({
              tournamentId,
              reason: value.reason,
              ids: newId,
              now: nowIso(),
              stageId: stage.stageId,
              poolId: group.poolId,
              orderedTeamIds: value.orderedTeamIds,
              method: value.method,
              seed: value.seed,
            });
            void flow.start({ kind: 'override_apply', override }, { reason: value.reason, reasonRequired: true, successMessage: 'Tie resolved' });
          }}
        />
      ) : null}
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function QualificationScreen({ tournamentId }: QualificationScreenProps) {
  const [selected, setSelected] = useState<StageId | null>(null);
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-qualification"
      title="Qualification"
      controls={(index) => <QualificationStagePicker index={index} selected={selected} onChange={setSelected} />}
    >
      {(index) => <QualificationBody index={index} selected={selected} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm, gap: space.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  revoke: { alignItems: 'flex-start' },
});

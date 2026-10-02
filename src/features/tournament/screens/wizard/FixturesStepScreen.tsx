import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FixtureDraft, FixtureSide, StageId } from '@/domain/types';
import type { FixturePlan } from '@/services/contracts';
import { Notice, plural } from '@/features/shared';
import { Button, Dialog, IconButton, ListRow, SectionHeader, Separator, Text, TextField, space } from '@/ui';
import { useTeamLibraryStore, useTournamentStore, useTournamentWizardStore } from '@/stores';
import { showError, showToast } from '../../hooks/toast';
import { useLibraryLoaded, useVenues } from '../../hooks/useLibrary';
import { legsLabel } from '../../labels';
import { parseSeed } from '../../selectors/poolDraw';
import { planIssues, planSections, schedulePlan, sideNamer, updatePlanFixture } from '../../selectors/planPreview';
import { ScheduleDatesSheet } from '../../sheets/ScheduleDatesSheet';
import { ScheduleSheet } from '../../sheets/ScheduleSheet';
import { WizardFrame } from './WizardFrame';

interface LaterPlan {
  readonly stageId: StageId;
  readonly name: string;
  readonly plan: FixturePlan | null;
  readonly note: string | null;
}

async function ensureOpen(tournamentId: string): Promise<boolean> {
  const store = useTournamentStore.getState();
  if (store.tournamentId === tournamentId && store.snapshot !== null) {
    return true;
  }
  return store.open(tournamentId);
}

export function FixturesStepScreen() {
  useLibraryLoaded();
  const library = useTeamLibraryStore((state) => state.teams);
  const venues = useVenues();
  const draft = useTournamentWizardStore((state) => state.draft);
  const storeSnapshot = useTournamentStore((state) => state.snapshot);
  const [seedText, setSeedText] = useState('');
  const [later, setLater] = useState<readonly LaterPlan[]>([]);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [askRegenerate, setAskRegenerate] = useState(false);
  const [editing, setEditing] = useState<FixtureDraft | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const stages = [...draft.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const first = stages[0];
  const plan = draft.fixturePlan;
  const persisted =
    first !== undefined &&
    storeSnapshot !== null &&
    storeSnapshot.tournament.id === draft.tournamentId &&
    storeSnapshot.fixtures.some((fixture) => fixture.stageId === first.id);
  const isConfirmed = confirmed || (plan === null && persisted);
  const names = sideNamer(new Map(library.map((team) => [team.id, team.name])), [...draft.slots, ...(plan?.slots ?? [])]);
  const entrants: readonly FixtureSide[] = draft.teams.map((team) => ({ kind: 'team', teamId: team.teamId }));
  const issues =
    plan && first
      ? planIssues(plan, { stage: first, pools: draft.pools, assignment: draft.poolAssignment, entrants, startDate: draft.info.startDate, endDate: draft.info.endDate })
      : [];
  const errors = issues.filter((issue) => issue.severity === 'error');
  const sections = plan ? planSections(plan, draft.pools, names) : [];
  const manualFirst = first?.config.fixtureGeneration.method === 'manual';

  const setPlan = (next: FixturePlan | null) => {
    useTournamentWizardStore.getState().update({ fixturePlan: next });
    setConfirmed(false);
  };

  const generate = async () => {
    const tournamentId = draft.tournamentId;
    if (!tournamentId || !first) {
      return;
    }
    setGenerating(true);
    const opened = await ensureOpen(tournamentId);
    if (!opened) {
      setGenerating(false);
      showError(useTournamentStore.getState().error, "Couldn't open the tournament to generate fixtures.");
      return;
    }
    const store = useTournamentStore.getState();
    const seed = parseSeed(seedText);
    const firstPlan = await store.generateFixtures(first.id, seed === null ? undefined : { seed });
    if (firstPlan === null) {
      setGenerating(false);
      showError(useTournamentStore.getState().error, "Couldn't generate fixtures. Check the pools and try again.");
      return;
    }
    const others: LaterPlan[] = [];
    for (const stage of stages.slice(1)) {
      if (stage.config.fixtureGeneration.method === 'manual') {
        others.push({ stageId: stage.id, name: stage.name, plan: null, note: 'Matches for this stage are added by hand.' });
        continue;
      }
      const stagePlan = await useTournamentStore.getState().generateFixtures(stage.id);
      others.push({
        stageId: stage.id,
        name: stage.name,
        plan: stagePlan,
        note: stagePlan ? null : 'Fixtures for this stage are created once its teams are known.',
      });
    }
    setLater(others);
    setPlan(firstPlan);
    setGenerating(false);
  };

  const confirm = async () => {
    setConfirming(true);
    useTournamentWizardStore.getState().goTo('fixtures');
    const saved = await useTournamentWizardStore.getState().saveStep();
    if (!saved) {
      setConfirming(false);
      showError(useTournamentWizardStore.getState().error, "Couldn't save the fixtures. Nothing was changed.");
      return;
    }
    await useTournamentStore.getState().refresh();
    setConfirming(false);
    setConfirmed(true);
    showToast('success', 'Fixtures confirmed');
  };

  return (
    <WizardFrame
      step="fixtures"
      onNext={async () => isConfirmed || manualFirst}
      nextDisabled={!isConfirmed && !manualFirst}
      nextHint={!isConfirmed && !manualFirst ? 'Generate and confirm the fixtures first.' : null}
    >
      {first ? (
        <View>
          <SectionHeader title={first.name} />
          <View style={styles.padded}>
            <Text variant="callout" tone="secondary">
              {manualFirst ? 'Matches for this stage are added by hand from the tournament after setup.' : `Each pool plays a ${legsLabel(first.config.fixtureGeneration.legs)}. Change this in Format.`}
            </Text>
            {!manualFirst ? (
              <>
                <TextField label="Draw seed (optional)" value={seedText} onChangeText={setSeedText} numeric testID="twiz-input-fixture-seed" />
                <View style={styles.buttons}>
                  <Button
                    label={plan ? 'Regenerate' : 'Generate'}
                    loading={generating}
                    onPress={() => (plan ? setAskRegenerate(true) : void generate())}
                    testID="twiz-btn-generate"
                  />
                  {plan ? <Button label="Schedule dates" variant="secondary" onPress={() => setScheduling(true)} testID="twiz-btn-schedule" /> : null}
                </View>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
      {plan ? (
        <View>
          <Separator />
          <View style={styles.previewLine}>
            <Text variant="label" tone="secondary" accessibilityRole="header">
              Preview
            </Text>
            <Text variant="label" tone="secondary" testID="twiz-text-fixture-count">
              {plural(plan.fixtures.length, 'match', 'matches')}
            </Text>
            <Text variant="label" tone={isConfirmed ? 'success' : 'warning'}>
              {isConfirmed ? 'Saved' : 'Not saved yet'}
            </Text>
          </View>
          {plan.seed !== null ? (
            <Text variant="footnote" tone="secondary" style={styles.padded} testID="twiz-text-fixture-seed">
              {`Draw seed ${plan.seed}`}
            </Text>
          ) : null}
          {issues.map((issue, index) => (
            <Notice
              key={`${issue.code}-${issue.fixtureId}-${index}`}
              tone={issue.severity === 'error' ? 'danger' : 'warning'}
              message={issue.message}
              testID={`twiz-text-fixture-issue-${index + 1}`}
            />
          ))}
          {sections.map((section) => (
            <View key={section.key}>
              <SectionHeader title={section.title} />
              {section.rows.map((row) => (
                <View key={row.key} style={styles.row} testID={`twiz-row-fixture-${row.matchNumber}`}>
                  <Text variant="tableNumeric" tone="secondary" style={styles.label}>
                    {row.label}
                  </Text>
                  <View style={styles.flex}>
                    <Text variant="body">{row.teams}</Text>
                    <Text variant="footnote" tone="secondary">
                      {row.when ?? 'Date to be set'}
                    </Text>
                  </View>
                  <IconButton
                    icon="pencil-line"
                    accessibilityLabel={`Edit ${row.label}, ${row.teams}`}
                    onPress={() => setEditing(plan.fixtures.find((fixture) => fixture.id === row.fixtureId) ?? null)}
                    testID={`twiz-btn-edit-fixture-${row.matchNumber}`}
                  />
                </View>
              ))}
            </View>
          ))}
          {later.map((entry) => (
            <View key={entry.stageId}>
              <SectionHeader title={`${entry.name} (between qualifiers)`} />
              {entry.plan ? (
                planSections(entry.plan, draft.pools, sideNamer(new Map(library.map((team) => [team.id, team.name])), [...draft.slots, ...entry.plan.slots])).flatMap((section) =>
                  section.rows.map((row) => <ListRow key={row.key} title={`${row.label}  ${row.teams}`} compact testID={`twiz-row-later-${row.matchNumber}`} />),
                )
              ) : (
                <Text variant="footnote" tone="secondary" style={styles.padded}>
                  {entry.note}
                </Text>
              )}
            </View>
          ))}
          <View style={styles.confirm}>
            <Button
              label={isConfirmed ? 'Fixtures confirmed' : 'Confirm fixtures'}
              icon={isConfirmed ? 'check' : undefined}
              disabled={errors.length > 0 || isConfirmed}
              loading={confirming}
              onPress={() => void confirm()}
              fullWidth
              testID="twiz-btn-confirm-fixtures"
            />
          </View>
        </View>
      ) : isConfirmed ? (
        <Notice tone="success" message="Fixtures are confirmed. Continue to review." testID="twiz-text-fixtures-saved" />
      ) : null}
      <Dialog
        visible={askRegenerate}
        title="Regenerate fixtures?"
        message="Your edits to this preview will be lost."
        cancel={{ label: 'Cancel', onPress: () => setAskRegenerate(false) }}
        confirm={{
          label: 'Regenerate',
          onPress: () => {
            setAskRegenerate(false);
            void generate();
          },
        }}
        onRequestClose={() => setAskRegenerate(false)}
        testID="dialog-regenerate"
      />
      {editing && plan ? (
        <ScheduleSheet
          visible
          title={`Edit ${editing.label ?? `M${editing.matchNumber}`}`}
          initial={{ scheduledDate: editing.scheduledDate, scheduledTime: editing.scheduledTime, venueId: editing.venueId, notes: editing.notes, label: editing.label }}
          venues={venues}
          confirmLabel="Save"
          extra={
            <Button
              label="Swap sides"
              icon="arrow-left-right"
              variant="secondary"
              onPress={() => {
                setPlan(updatePlanFixture(plan, editing.id, { sideA: editing.sideB, sideB: editing.sideA }));
                setEditing(null);
              }}
              testID="twiz-btn-swap-sides"
            />
          }
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            setPlan(updatePlanFixture(plan, editing.id, values));
            setEditing(null);
          }}
        />
      ) : null}
      {scheduling && plan ? (
        <ScheduleDatesSheet
          visible
          initialStart={draft.info.startDate}
          onClose={() => setScheduling(false)}
          onSubmit={({ startDate, matchesPerDay, times }) => {
            setPlan(schedulePlan(plan, startDate, matchesPerDay, times));
            setScheduling(false);
          }}
        />
      ) : null}
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: space.md, gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.xxs, minHeight: 56 },
  label: { width: 44 },
  flex: { flex: 1 },
  confirm: { paddingHorizontal: space.md, paddingTop: space.lg },
});

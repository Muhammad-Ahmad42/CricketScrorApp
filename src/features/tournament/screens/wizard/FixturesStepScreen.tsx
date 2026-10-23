import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FixtureDraft, FixtureSide, Pool, Stage, StageId } from '@/domain/types';
import type { FixturePlan } from '@/services/contracts';
import { plural } from '@/features/shared';
import { Banner, Button, Dialog, Disclosure, Icon, IconButton, Inset, SectionHeader, Separator, Text, TextField, space, useGutter } from '@/ui';
import { useTeamLibraryStore, useTournamentStore, useTournamentWizardStore } from '@/stores';
import { showError } from '../../hooks/toast';
import { tournamentVenues, useLibraryLoaded, useVenues } from '../../hooks/useLibrary';
import { REPEAT_DRAW_LABEL, legsLabel } from '../../labels';
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

export function fixtureFormatLine(stage: Stage, pools: readonly Pool[]): string {
  const legs = legsLabel(stage.config.fixtureGeneration.legs);
  const line = `${legs.charAt(0).toUpperCase()}${legs.slice(1)}`;
  const count = pools.filter((pool) => pool.stageId === stage.id).length;
  return count > 1 ? `${line} · ${plural(count, 'pool')}` : line;
}

async function ensureOpen(tournamentId: string): Promise<boolean> {
  const store = useTournamentStore.getState();
  if (store.tournamentId === tournamentId && store.snapshot !== null) {
    return true;
  }
  return store.open(tournamentId);
}

function PlanRow({ label, teams, when, testID, trailing }: { readonly label: string; readonly teams: string; readonly when: string | null; readonly testID: string; readonly trailing?: ReactNode }) {
  const gutter = useGutter();
  return (
    <View style={[styles.row, { paddingLeft: gutter, paddingRight: trailing ? Math.max(space.xxs, gutter - space.sm) : gutter }]} testID={testID}>
      <Text variant="tableNumeric" tone="secondary" style={styles.label}>
        {label}
      </Text>
      <View style={styles.flex}>
        <Text variant="body">{teams}</Text>
        <Text variant="footnote" tone="secondary">
          {when ?? 'Date to be set'}
        </Text>
      </View>
      {trailing}
    </View>
  );
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
      showError(useTournamentStore.getState().error, "Couldn't generate fixtures.");
      return;
    }
    const store = useTournamentStore.getState();
    const seed = parseSeed(seedText);
    const firstPlan = await store.generateFixtures(first.id, seed === null ? undefined : { seed });
    if (firstPlan === null) {
      setGenerating(false);
      showError(useTournamentStore.getState().error, "Couldn't generate fixtures.");
      return;
    }
    const others: LaterPlan[] = [];
    for (const stage of stages.slice(1)) {
      if (stage.config.fixtureGeneration.method === 'manual') {
        others.push({ stageId: stage.id, name: stage.name, plan: null, note: 'Added by hand' });
        continue;
      }
      const stagePlan = await useTournamentStore.getState().generateFixtures(stage.id);
      others.push({
        stageId: stage.id,
        name: stage.name,
        plan: stagePlan,
        note: stagePlan ? null : 'Created once its teams are known',
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
      showError(useTournamentWizardStore.getState().error, "Couldn't save the fixtures.");
      return;
    }
    await useTournamentStore.getState().refresh();
    setConfirming(false);
    setConfirmed(true);
  };

  const confirmMode = plan !== null && !isConfirmed;
  const total = plan ? plan.fixtures.length + later.reduce((sum, entry) => sum + (entry.plan?.fixtures.length ?? 0), 0) : 0;
  const dockHint = (() => {
    if (manualFirst || isConfirmed) {
      return null;
    }
    if (plan === null) {
      return 'Generate the fixtures first.';
    }
    if (errors.length > 0) {
      return 'Fix the problems above first.';
    }
    return `Review the ${plural(total, 'fixture')}, then confirm.`;
  })();

  return (
    <WizardFrame
      step="fixtures"
      onNext={
        confirmMode
          ? async () => {
              await confirm();
              return false;
            }
          : async () => isConfirmed || manualFirst
      }
      nextLabel={confirmMode ? 'Confirm fixtures' : 'Next'}
      nextTestID={confirmMode ? 'twiz-btn-confirm-fixtures' : 'twiz-btn-next'}
      nextDisabled={confirmMode ? errors.length > 0 || confirming : !isConfirmed && !manualFirst}
      nextHint={dockHint}
    >
      {first ? (
        <View>
          <SectionHeader title={first.name} />
          <Inset gap="sm">
            <Text variant="callout" tone="secondary" testID="twiz-text-fixture-format">
              {manualFirst ? 'Matches are added by hand after setup.' : fixtureFormatLine(first, draft.pools)}
            </Text>
            {!manualFirst ? (
              <>
                <View style={styles.buttons}>
                  <Button
                    label={plan ? 'Regenerate' : 'Generate'}
                    loading={generating}
                    onPress={() => (plan ? setAskRegenerate(true) : void generate())}
                    testID="twiz-btn-generate"
                  />
                  {plan ? <Button label="Schedule dates" variant="secondary" onPress={() => setScheduling(true)} testID="twiz-btn-schedule" /> : null}
                </View>
                <Disclosure label={REPEAT_DRAW_LABEL} defaultExpanded={seedText !== ''} testID="twiz-btn-fixture-repeat-draw">
                  <TextField
                    label="Draw number"
                    value={seedText}
                    onChangeText={setSeedText}
                    numeric
                    returnKeyType="done"
                    onSubmitEditing={() => (plan ? setAskRegenerate(true) : void generate())}
                    testID="twiz-input-fixture-seed"
                  />
                </Disclosure>
              </>
            ) : null}
          </Inset>
        </View>
      ) : null}
      {plan ? (
        <View>
          <Separator />
          <Inset top="lg">
            <View style={styles.previewLine}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Preview
              </Text>
              <Text variant="label" tone="secondary" testID="twiz-text-fixture-count">
                {plural(plan.fixtures.length, 'match', 'matches')}
              </Text>
              <View style={styles.saved}>
                <Icon name={isConfirmed ? 'circle-check' : 'circle-alert'} size={16} color={isConfirmed ? 'success' : 'warning'} />
                <Text variant="label" tone={isConfirmed ? 'success' : 'warning'} testID="twiz-text-fixtures-state">
                  {isConfirmed ? 'Saved' : 'Not saved yet'}
                </Text>
              </View>
            </View>
          </Inset>
          {plan.seed !== null ? (
            <Inset top="xs">
              <Text variant="footnote" tone="secondary" testID="twiz-text-fixture-seed">
                {`Draw no. ${plan.seed}`}
              </Text>
            </Inset>
          ) : null}
          {issues.map((issue, index) => (
            <Banner
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
                <PlanRow
                  key={row.key}
                  label={row.label}
                  teams={row.teams}
                  when={row.when}
                  testID={`twiz-row-fixture-${row.matchNumber}`}
                  trailing={
                    <IconButton
                      icon="pencil-line"
                      accessibilityLabel={`Edit ${row.label}, ${row.teams}`}
                      onPress={() => setEditing(plan.fixtures.find((fixture) => fixture.id === row.fixtureId) ?? null)}
                      testID={`twiz-btn-edit-fixture-${row.matchNumber}`}
                    />
                  }
                />
              ))}
            </View>
          ))}
          {later.map((entry) => (
            <View key={entry.stageId}>
              <SectionHeader title={entry.name} />
              {entry.plan ? (
                planSections(entry.plan, draft.pools, sideNamer(new Map(library.map((team) => [team.id, team.name])), [...draft.slots, ...entry.plan.slots])).flatMap((section) =>
                  section.rows.map((row) => <PlanRow key={row.key} label={row.label} teams={row.teams} when={row.when} testID={`twiz-row-later-${row.matchNumber}`} />),
                )
              ) : (
                <Inset>
                  <Text variant="footnote" tone="secondary">
                    {entry.note}
                  </Text>
                </Inset>
              )}
            </View>
          ))}
        </View>
      ) : isConfirmed ? (
        <Banner tone="success" message="Fixtures confirmed" testID="twiz-text-fixtures-saved" />
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
          title="Edit match"
          subtitle={`${editing.label ?? `M${editing.matchNumber}`} · ${names(editing.sideA)} v ${names(editing.sideB)}`}
          initial={{ scheduledDate: editing.scheduledDate, scheduledTime: editing.scheduledTime, venueId: editing.venueId, notes: editing.notes, label: editing.label }}
          venues={tournamentVenues(venues, draft.info.venueIds, editing.venueId)}
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
            setPlan(schedulePlan(plan, startDate, matchesPerDay, times, draft.info.venueIds));
            setScheduling(false);
          }}
        />
      ) : null}
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  previewLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.xs },
  label: { minWidth: space['3xl'] },
  flex: { flex: 1, minWidth: 0 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});

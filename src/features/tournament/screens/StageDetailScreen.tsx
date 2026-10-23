import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { knockoutGenerationGuard } from '@/domain/tournament/knockout';
import { explainEntryRules } from '@/domain/tournament/slots';
import type { KnockoutConfig, SeedingMethod, Stage, StageId, TournamentId } from '@/domain/types';
import type { FixturePlan } from '@/services/contracts';
import { ImpactSheet, ManualOverrideBadge, plural } from '@/features/shared';
import { Button, EmptyState, Inset, ListRow, RadioList, SectionHeader, SegmentedControl, Separator, Sheet, Stepper, Text, TextField, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { showError, showToast } from '../hooks/toast';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { newId } from '../ids';
import { NO_RESULT_LABEL, SEEDING_LABEL, TIED_MATCH_LABEL, isSetupStatus } from '../labels';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { planSections, sideNamer } from '../selectors/planPreview';
import { stageNameMap } from '../selectors/stages';
import { reexpandSlots, topPerPoolCount, withStageConfig, withTopPerPool } from '../wizard/structure';
import { TournamentContainer } from './TournamentContainer';

export interface StageDetailScreenProps {
  readonly tournamentId: TournamentId;
  readonly stageId: StageId;
}

interface SlotStatus {
  readonly text: string;
  readonly manual: boolean;
  readonly reason: string | null;
}

function slotStatusText(index: TournamentIndex, slotId: string): SlotStatus {
  const resolution = index.slotResolution(slotId);
  if (!resolution || resolution.teamId === null) {
    return { text: 'To be decided', manual: false, reason: null };
  }
  const name = index.teamName(resolution.teamId);
  const text = resolution.status === 'provisional' ? `${name} (provisional)` : name;
  return { text, manual: resolution.viaOverride, reason: resolution.viaOverride ? slotOverrideReason(index, slotId, resolution.teamId) : null };
}

function slotOverrideReason(index: TournamentIndex, slotId: string, teamId: string): string | null {
  const override = index.snapshot.overrides.find(
    (candidate) =>
      candidate.revokedAt === null &&
      (candidate.kind === 'slot_assignment' || candidate.kind === 'qualification') &&
      candidate.slotId === slotId &&
      candidate.teamId === teamId,
  );
  return override?.reason ?? null;
}

function StageBody({ index, stage }: { readonly index: TournamentIndex; readonly stage: Stage }) {
  const flow = useChangeFlow();
  const [draft, setDraft] = useState<Stage>(stage);
  const [plan, setPlan] = useState<FixturePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = index.snapshot;
  const policy = editPolicy(index);
  const editable = policy.stages !== 'forbidden';
  const dirty = JSON.stringify(draft) !== JSON.stringify(stage);
  const pools = index.poolsOf(stage.id);
  const slots = snapshot.slots.filter((slot) => slot.stageId === stage.id).sort((a, b) => a.index - b.index);
  const entrySlots = slots.filter((slot) => slot.role === 'entry');
  const knockout = draft.config.knockout;
  const perPool = topPerPoolCount(draft);
  const roundRobin = draft.config.fixtureGeneration.method === 'round_robin';
  const fixtureCount = snapshot.fixtures.filter((fixture) => fixture.stageId === stage.id).length;
  const resolutions = entrySlots.map((slot) => index.slotResolution(slot.id)).filter((resolution) => resolution !== undefined);
  const guard = stage.type === 'knockout' ? knockoutGenerationGuard(stage.config.seeding, resolutions) : { ok: true as const, warnings: [] };
  const manualStage = stage.config.fixtureGeneration.method === 'manual';

  const review = () => {
    const activeTeams = snapshot.teams.filter((view) => view.membership.status === 'active').length;
    const structure = { stages: snapshot.stages.map((candidate) => (candidate.id === draft.id ? draft : candidate)), pools: snapshot.pools, slots: snapshot.slots };
    const entry = reexpandSlots(structure, activeTeams, newId).filter((slot) => slot.stageId === draft.id);
    const progression = slots.filter((slot) => slot.role === 'progression');
    void flow.start({ kind: 'stage_upsert', stage: draft, pools, slots: [...entry, ...progression] }, { successMessage: 'Stage saved' });
  };

  const generate = async () => {
    setBusy(true);
    const generated = await useTournamentStore.getState().generateFixtures(stage.id);
    setBusy(false);
    if (generated === null) {
      showError(useTournamentStore.getState().error, "Couldn't generate fixtures for this stage.");
      return;
    }
    setPlan(generated);
  };

  const confirmPlan = async () => {
    if (plan === null) {
      return;
    }
    const current = plan;
    if (isSetupStatus(snapshot.tournament.status) || fixtureCount === 0) {
      setBusy(true);
      const ok = await useTournamentStore.getState().confirmFixtures(stage.id, current);
      setBusy(false);
      if (ok) {
        setPlan(null);
        showToast('success', 'Fixtures confirmed');
      } else {
        showError(useTournamentStore.getState().error, "Couldn't save the fixtures.");
      }
      return;
    }
    setPlan(null);
    void flow.start(
      { kind: 'fixtures_replace', stageId: stage.id, poolId: null, fixtures: current.fixtures, slots: current.slots, seed: current.seed },
      { successMessage: 'Fixtures replaced' },
    );
  };

  const names = sideNamer(new Map(snapshot.teams.map((view) => [view.team.id, view.team.name])), [...snapshot.slots, ...(plan?.slots ?? [])]);

  return (
    <View>
      <Inset top="md" bottom="xs">
        <TextField label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} editable={editable} returnKeyType="done" testID="stage-input-name" />
      </Inset>
      <ListRow
        title="Decides the champion"
        trailing={{ kind: 'switch', value: draft.config.decidesChampion, disabled: !editable, onValueChange: (decidesChampion) => setDraft(withStageConfig(draft, { decidesChampion })) }}
        separator={false}
        testID="stage-toggle-champion"
      />
      {roundRobin ? (
        <Inset bottom="md" gap="sm">
          <Text variant="label" tone="secondary">
            Matches against each opponent
          </Text>
          <SegmentedControl
            options={[
              { value: '1', label: 'Once' },
              { value: '2', label: 'Twice' },
              { value: '3', label: '3 times' },
            ]}
            value={String(Math.min(3, draft.config.fixtureGeneration.legs)) as '1' | '2' | '3'}
            onChange={(legs) => setDraft(withStageConfig(draft, { fixtureGeneration: { ...draft.config.fixtureGeneration, legs: Number(legs) } }))}
            disabled={!editable}
            accessibilityLabel="Matches against each opponent"
          />
        </Inset>
      ) : null}
      <Separator />
      <SectionHeader title="Who enters" />
      <Inset gap="sm" bottom="md">
        <Text variant="callout" testID="stage-text-entry">
          {explainEntryRules(draft.config.entryRules, stageNameMap(index.stages))}
        </Text>
        {perPool !== null ? (
          <Stepper label="Qualifiers from each pool" value={perPool} min={1} max={8} disabled={!editable} onChange={(count) => setDraft(withTopPerPool(draft, count))} testID="stage-input-qualifiers" />
        ) : null}
      </Inset>
      {slots.length > 0 ? (
        <View>
          <Separator />
          <SectionHeader title="Slots" />
          {slots.map((slot, position) => {
            const status = slotStatusText(index, slot.id);
            return (
              <View key={slot.id}>
                <ListRow title={slot.label} subtitle={status.text} compact testID={`stage-row-slot-${position + 1}`} />
                {status.manual ? (
                  <Inset top="xs" bottom="sm">
                    <ManualOverrideBadge reason={status.reason ?? ''} showReason={status.reason !== null} testID={`stage-badge-slot-${position + 1}`} />
                  </Inset>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {knockout ? (
        <View>
          <Separator />
          <SectionHeader title="Bracket draw" />
          <Inset gap="sm">
            <SegmentedControl
              options={(['fixed', 'random', 'ranking'] as const).map((value) => ({ value, label: SEEDING_LABEL[value], testID: `stage-chip-seeding-${value}` }))}
              value={draft.config.seeding}
              onChange={(seeding: SeedingMethod) => setDraft(withStageConfig(draft, { seeding }))}
              disabled={!editable}
              accessibilityLabel="Bracket draw"
            />
            <Text variant="footnote" tone="secondary" testID="stage-text-seeding">
              {SEEDING_CAPTION[draft.config.seeding]}
            </Text>
          </Inset>
          <ListRow
            title="Third-place play-off"
            trailing={{ kind: 'switch', value: knockout.thirdPlacePlayoff, disabled: !editable, onValueChange: (thirdPlacePlayoff) => setDraft(withStageConfig(draft, { knockout: { ...knockout, thirdPlacePlayoff } })) }}
            separator={false}
            testID="stage-toggle-third-place"
          />
          <SectionHeader title="Tied match" />
          <RadioList
            choices={(Object.keys(TIED_MATCH_LABEL) as KnockoutConfig['tiedMatch'][]).map((value) => ({ value, label: TIED_MATCH_LABEL[value], disabled: !editable }))}
            value={knockout.tiedMatch}
            onChange={(tiedMatch) => setDraft(withStageConfig(draft, { knockout: { ...knockout, tiedMatch } }))}
            accessibilityLabel="Tied match"
          />
          <SectionHeader title="No result" />
          <RadioList
            choices={(Object.keys(NO_RESULT_LABEL) as KnockoutConfig['noResult'][]).map((value) => ({ value, label: NO_RESULT_LABEL[value], disabled: !editable }))}
            value={knockout.noResult}
            onChange={(noResult) => setDraft(withStageConfig(draft, { knockout: { ...knockout, noResult } }))}
            accessibilityLabel="No result"
          />
        </View>
      ) : null}
      <Separator />
      <Inset top="md" bottom="md" gap="sm">
        {editable ? (
          <Button label="Review changes" disabled={!dirty || draft.name.trim().length === 0} loading={flow.previewing} onPress={review} fullWidth testID="stage-btn-review" />
        ) : null}
        {!manualStage && policy.generateFixtures !== 'forbidden' ? (
          <View style={styles.gap}>
            <Button
              label={stage.type === 'knockout' ? 'Generate bracket' : fixtureCount > 0 ? 'Regenerate fixtures' : 'Generate fixtures'}
              variant="secondary"
              disabled={!guard.ok || dirty}
              loading={busy}
              onPress={() => void generate()}
              fullWidth
              testID="stage-btn-generate"
            />
            {!guard.ok ? (
              <Text variant="footnote" tone="secondary" testID="stage-text-generate-blocked">
                {guard.reason}
              </Text>
            ) : dirty ? (
              <Text variant="footnote" tone="secondary">
                Save the stage changes first.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Inset>
      {plan ? (
        <Sheet
          visible
          title="Fixture preview"
          subtitle={`${plural(plan.fixtures.length, 'match', 'matches')} · not saved yet`}
          onClose={() => setPlan(null)}
          testID="sheet-stage-plan"
          footer={<Button label="Confirm fixtures" loading={busy} onPress={() => void confirmPlan()} fullWidth testID="stage-btn-confirm-plan" />}
        >
          <View>
            {planSections(plan, snapshot.pools, names).map((section) => (
              <View key={section.key}>
                <Text variant="label" tone="secondary">
                  {section.title}
                </Text>
                {section.rows.map((row) => (
                  <ListRow key={row.key} title={`${row.label}  ${row.teams}`} subtitle={row.when ?? undefined} compact testID={`stage-row-plan-${row.matchNumber}`} />
                ))}
              </View>
            ))}
          </View>
        </Sheet>
      ) : null}
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

const SEEDING_CAPTION: { readonly [K in SeedingMethod]: string } = {
  fixed: 'By qualifying slot, e.g. A1 v B2',
  random: 'Drawn at random',
  ranking: 'Best qualifier meets the lowest',
};

export function StageDetailScreen({ tournamentId, stageId }: StageDetailScreenProps) {
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-stage"
      width="column"
      title={(index) => index.stage(stageId)?.name ?? 'Stage'}
    >
      {(index) => {
        const stage = index.stage(stageId);
        if (!stage) {
          return <EmptyState title="Stage not found" body="It may have been deleted." testID="stage-missing" />;
        }
        return <StageBody key={`${stage.id}:${index.snapshot.version}`} index={index} stage={stage} />;
      }}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.xs },
});

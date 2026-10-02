import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { ChoiceList, ImpactSheet } from '@/features/shared';
import { Button, ListRow, SectionHeader, SegmentedControl, Text, TextField, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { showError, showToast } from '../hooks/toast';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { useVenues } from '../hooks/useLibrary';
import { newId } from '../ids';
import { isSetupStatus } from '../labels';
import { routes } from '../routes';
import { draftFromForm, emptyForm, hasErrors, slotOptions, teamOptions, validateAddFixture, type AddFixtureForm, type SideOption } from '../selectors/addFixture';
import type { TournamentIndex } from '../selectors/names';
import { guardContext } from '../selectors/policy';
import { PickerSheet } from '../sheets/PickerSheet';
import { TournamentContainer, useBack } from './TournamentContainer';

export interface AddFixtureScreenProps {
  readonly tournamentId: TournamentId;
}

type Picking = { readonly side: 'a' | 'b'; readonly kind: 'team' | 'slot' } | null;

function sideTitle(options: readonly SideOption[], form: AddFixtureForm, which: 'a' | 'b'): string {
  const side = which === 'a' ? form.sideA : form.sideB;
  if (side === null) {
    return 'Choose team or slot';
  }
  const key = side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
  return options.find((option) => option.key === key)?.title ?? 'Chosen';
}

function AddFixtureBody({ tournamentId, index }: { readonly tournamentId: TournamentId; readonly index: TournamentIndex }) {
  const router = useRouter();
  const back = useBack(routes.fixtures(tournamentId));
  const venues = useVenues();
  const flow = useChangeFlow();
  const [form, setForm] = useState<AddFixtureForm>(emptyForm(index.evaluation?.currentStageId ?? index.stages[0]?.id ?? null));
  const [picking, setPicking] = useState<Picking>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = validateAddFixture(form);
  const stage = form.stageId ? index.stage(form.stageId) : undefined;
  const pools = form.stageId ? index.poolsOf(form.stageId) : [];
  const teams = teamOptions(index);
  const slots = slotOptions(index, form.stageId);
  const all = [...teams, ...slots];
  const update = (patch: Partial<AddFixtureForm>) => setForm({ ...form, ...patch });
  const needsPreview = !isSetupStatus(index.snapshot.tournament.status) && guardContext(index).matchesStarted > 0;

  const submit = async () => {
    setSubmitted(true);
    const draft = draftFromForm(index, form, newId);
    if (draft === null) {
      return;
    }
    if (needsPreview) {
      await flow.start({ kind: 'fixture_add', fixture: draft }, { successMessage: 'Match added', onApplied: () => router.replace(routes.fixtures(tournamentId)) });
      return;
    }
    setBusy(true);
    const ok = await useTournamentStore.getState().addFixture(draft);
    setBusy(false);
    if (ok) {
      showToast('success', 'Match added');
      back();
    } else {
      showError(useTournamentStore.getState().error, "Couldn't add this match.");
    }
  };

  return (
    <View style={styles.root}>
      <SectionHeader title="Stage" />
      <View style={styles.padded}>
        <ChoiceList
          choices={index.stages.map((candidate) => ({ value: candidate.id, label: candidate.name, testID: `addfix-chip-stage-${candidate.orderIndex + 1}` }))}
          value={form.stageId}
          onChange={(stageId) => update({ stageId, poolId: null, sideA: null, sideB: null })}
          accessibilityLabel="Stage"
        />
      </View>
      {pools.length > 0 ? (
        <View>
          <SectionHeader title="Pool" />
          <View style={styles.padded}>
            <ChoiceList
              choices={[{ value: 'none', label: 'No pool' }, ...pools.map((pool) => ({ value: pool.id, label: pool.name }))]}
              value={form.poolId ?? 'none'}
              onChange={(value) => update({ poolId: value === 'none' ? null : value })}
              accessibilityLabel="Pool"
            />
          </View>
        </View>
      ) : null}
      <SectionHeader title="Teams" />
      {(['a', 'b'] as const).map((which) => (
        <View key={which} style={styles.sideBlock}>
          <ListRow
            title={which === 'a' ? 'Team A' : 'Team B'}
            trailing={{ kind: 'value', text: sideTitle(all, form, which), chevron: true }}
            onPress={() => setPicking({ side: which, kind: 'team' })}
            testID={`addfix-btn-side-${which}`}
          />
          {slots.length > 0 ? (
            <Button
              label="Choose a slot instead"
              variant="tertiary"
              size="sm"
              onPress={() => setPicking({ side: which, kind: 'slot' })}
              testID={`addfix-btn-slot-${which}`}
            />
          ) : null}
        </View>
      ))}
      {submitted && errors.sides ? (
        <Text variant="footnote" tone="danger" style={styles.padded} testID="addfix-text-error-sides">
          {errors.sides}
        </Text>
      ) : null}
      <SectionHeader title="When and where" />
      <View style={[styles.padded, styles.fields]}>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Date" value={form.date} onChangeText={(date) => update({ date })} placeholder="YYYY-MM-DD" error={errors.date} autoCapitalize="none" testID="addfix-input-date" />
          </View>
          <View style={styles.flex}>
            <TextField label="Time" value={form.time} onChangeText={(time) => update({ time })} placeholder="HH:MM" error={errors.time} autoCapitalize="none" testID="addfix-input-time" />
          </View>
        </View>
        {venues.length > 0 ? (
          <ChoiceList
            choices={[{ value: 'none', label: 'No venue' }, ...venues.map((venue) => ({ value: venue.id, label: venue.name }))]}
            value={form.venueId ?? 'none'}
            onChange={(value) => update({ venueId: value === 'none' ? null : value })}
            accessibilityLabel="Venue"
          />
        ) : null}
        <TextField
          label="Overs (optional)"
          value={form.overs}
          onChangeText={(overs) => update({ overs })}
          numeric
          helper={`Leave empty for the stage default (${(stage?.config.matchRules ?? index.snapshot.rules.defaultMatchRules).oversPerInnings} overs).`}
          error={errors.overs}
          testID="addfix-input-overs"
        />
        <TextField label="Label (optional)" value={form.label} onChangeText={(label) => update({ label })} placeholder="e.g. Eliminator" testID="addfix-input-label" />
        <TextField label="Notes (optional)" value={form.notes} onChangeText={(notes) => update({ notes })} multiline testID="addfix-input-notes" />
        {stage?.type === 'custom' ? (
          <SegmentedControl
            options={[
              { value: 'no', label: 'Regular match' },
              { value: 'yes', label: 'Final of this stage' },
            ]}
            value={form.isFinal ? 'yes' : 'no'}
            onChange={(value) => update({ isFinal: value === 'yes' })}
            accessibilityLabel="Is this the final of this stage"
          />
        ) : null}
        <Button
          label="Add match"
          onPress={() => void submit()}
          loading={busy || flow.previewing}
          disabled={submitted && hasErrors(errors)}
          fullWidth
          testID="addfix-btn-submit"
        />
      </View>
      <PickerSheet
        visible={picking !== null}
        title={picking?.kind === 'slot' ? 'Choose a slot' : 'Choose a team'}
        options={(picking?.kind === 'slot' ? slots : teams).map((option) => ({ key: option.key, title: option.title, subtitle: option.subtitle }))}
        searchable={picking?.kind === 'team'}
        onClose={() => setPicking(null)}
        onPick={(key) => {
          const option = all.find((candidate) => candidate.key === key);
          if (option && picking) {
            update(picking.side === 'a' ? { sideA: option.side } : { sideB: option.side });
          }
          setPicking(null);
        }}
      />
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function AddFixtureScreen({ tournamentId }: AddFixtureScreenProps) {
  return (
    <TournamentContainer tournamentId={tournamentId} testID="screen-add-fixture" title="Add match" backTo={routes.fixtures(tournamentId)}>
      {(index) => <AddFixtureBody tournamentId={tournamentId} index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: space.xl },
  padded: { paddingHorizontal: space.md },
  fields: { gap: space.md },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  sideBlock: { gap: 0 },
});

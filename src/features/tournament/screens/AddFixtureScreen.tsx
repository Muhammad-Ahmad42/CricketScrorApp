import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { ImpactSheet } from '@/features/shared';
import { Button, DateField, Inset, ListRow, RadioList, SectionHeader, SegmentedControl, Text, TextField, TimeField, space, useFormChain } from '@/ui';
import { useTournamentStore } from '@/stores';
import { showError, showToast } from '../hooks/toast';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { tournamentVenues, useVenues } from '../hooks/useLibrary';
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

type AddFixtureField = 'overs' | 'label' | 'notes';

const FIELDS: readonly AddFixtureField[] = ['overs', 'label', 'notes'];

const NO_POOL = '__none__';
const NO_VENUE = '__none__';

function sideTitle(options: readonly SideOption[], form: AddFixtureForm, which: 'a' | 'b'): string {
  const side = which === 'a' ? form.sideA : form.sideB;
  if (side === null) {
    return 'Choose…';
  }
  const key = side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
  return options.find((option) => option.key === key)?.title ?? 'Chosen';
}

export function initialAddFixtureForm(index: TournamentIndex): AddFixtureForm {
  const stageId = index.evaluation?.currentStageId ?? index.stages[0]?.id ?? null;
  return { ...emptyForm(stageId), poolId: stageId ? index.poolsOf(stageId)[0]?.id ?? null : null };
}

interface AddFixtureBodyProps {
  readonly index: TournamentIndex;
  readonly form: AddFixtureForm;
  readonly submitted: boolean;
  readonly update: (patch: Partial<AddFixtureForm>) => void;
  readonly onSubmit: () => void;
}

function AddFixtureBody({ index, form, submitted, update, onSubmit }: AddFixtureBodyProps) {
  const venues = tournamentVenues(useVenues(), index.snapshot.tournament.venueIds);
  const chain = useFormChain(FIELDS, { onSubmit });
  const [picking, setPicking] = useState<Picking>(null);
  const errors = validateAddFixture(form);
  const stage = form.stageId ? index.stage(form.stageId) : undefined;
  const pools = form.stageId ? index.poolsOf(form.stageId) : [];
  const teams = teamOptions(index);
  const slots = slotOptions(index, form.stageId);
  const all = [...teams, ...slots];
  const defaultOvers = (stage?.config.matchRules ?? index.snapshot.rules.defaultMatchRules).oversPerInnings;
  return (
    <View style={styles.root}>
      <SectionHeader title="Stage" />
      <RadioList
        choices={index.stages.map((candidate) => ({ value: candidate.id, label: candidate.name, testID: `addfix-chip-stage-${candidate.orderIndex + 1}` }))}
        value={form.stageId}
        onChange={(stageId) => update({ stageId, poolId: index.poolsOf(stageId)[0]?.id ?? null, sideA: null, sideB: null })}
        accessibilityLabel="Stage"
      />
      {pools.length > 0 ? (
        <View>
          <SectionHeader title="Pool" />
          <RadioList
            choices={[...pools.map((pool) => ({ value: pool.id, label: pool.name })), { value: NO_POOL, label: 'No pool', description: "Doesn't count in a pool table" }]}
            value={form.poolId ?? NO_POOL}
            onChange={(value) => update({ poolId: value === NO_POOL ? null : value })}
            accessibilityLabel="Pool"
          />
        </View>
      ) : null}
      <SectionHeader title="Teams" />
      {(['a', 'b'] as const).map((which) => (
        <View key={which}>
          <ListRow
            title={which === 'a' ? 'Team A' : 'Team B'}
            trailing={{ kind: 'value', text: sideTitle(all, form, which), chevron: true }}
            onPress={() => setPicking({ side: which, kind: 'team' })}
            testID={`addfix-btn-side-${which}`}
          />
          {slots.length > 0 ? (
            <Inset>
              <View style={styles.start}>
                <Button label="Use a slot" variant="tertiary" size="sm" onPress={() => setPicking({ side: which, kind: 'slot' })} testID={`addfix-btn-slot-${which}`} />
              </View>
            </Inset>
          ) : null}
        </View>
      ))}
      {submitted && errors.sides ? (
        <Inset top="xs">
          <Text variant="footnote" tone="danger" testID="addfix-text-error-sides">
            {errors.sides}
          </Text>
        </Inset>
      ) : null}
      <SectionHeader title="When and where" />
      <Inset gap="md">
        <DateField label="Date" value={form.date || null} onChange={(date) => update({ date: date ?? '' })} optional error={errors.date} testID="addfix-input-date" />
        <TimeField label="Time" value={form.time || null} onChange={(time) => update({ time: time ?? '' })} optional minuteInterval={5} error={errors.time} testID="addfix-input-time" />
      </Inset>
      {venues.length > 0 ? (
        <View style={styles.venues}>
          <Inset bottom="xs">
            <Text variant="subhead" tone="secondary">
              Venue
            </Text>
          </Inset>
          <RadioList
            choices={[{ value: NO_VENUE, label: 'No venue' }, ...venues.map((venue) => ({ value: venue.id, label: venue.name }))]}
            value={form.venueId ?? NO_VENUE}
            onChange={(value) => update({ venueId: value === NO_VENUE ? null : value })}
            accessibilityLabel="Venue"
          />
        </View>
      ) : null}
      <SectionHeader title="Match" />
      <Inset gap="md">
        <TextField
          label="Overs (optional)"
          value={form.overs}
          onChangeText={(overs) => update({ overs })}
          numeric
          placeholder={String(defaultOvers)}
          error={errors.overs}
          {...chain.field('overs')}
          testID="addfix-input-overs"
        />
        <TextField label="Label (optional)" value={form.label} onChangeText={(label) => update({ label })} placeholder="e.g. Eliminator" {...chain.field('label')} testID="addfix-input-label" />
        <TextField label="Notes (optional)" value={form.notes} onChangeText={(notes) => update({ notes })} multiline ref={chain.field('notes').ref} testID="addfix-input-notes" />
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
      </Inset>
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
    </View>
  );
}

export function AddFixtureScreen({ tournamentId }: AddFixtureScreenProps) {
  const router = useRouter();
  const back = useBack(routes.fixtures(tournamentId));
  const flow = useChangeFlow();
  const [form, setForm] = useState<AddFixtureForm | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (index: TournamentIndex, current: AddFixtureForm) => {
    setSubmitted(true);
    const draft = draftFromForm(index, current, newId);
    if (draft === null) {
      return;
    }
    const needsPreview = !isSetupStatus(index.snapshot.tournament.status) && guardContext(index).matchesStarted > 0;
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
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-add-fixture"
      title="Add match"
      width="column"
      backTo={routes.fixtures(tournamentId)}
      footer={(index) => {
        const current = form ?? initialAddFixtureForm(index);
        return (
          <Button
            label="Add match"
            onPress={() => void submit(index, current)}
            loading={busy || flow.previewing}
            disabled={submitted && hasErrors(validateAddFixture(current))}
            fullWidth
            testID="addfix-btn-submit"
          />
        );
      }}
    >
      {(index) => {
        const current = form ?? initialAddFixtureForm(index);
        return (
          <View>
            <AddFixtureBody
              index={index}
              form={current}
              submitted={submitted}
              update={(patch) => setForm({ ...current, ...patch })}
              onSubmit={() => void submit(index, current)}
            />
            <ImpactSheet {...flow.sheet} names={index.impactNames} />
          </View>
        );
      }}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: space.md },
  start: { alignSelf: 'flex-start' },
  venues: { paddingTop: space.md },
});

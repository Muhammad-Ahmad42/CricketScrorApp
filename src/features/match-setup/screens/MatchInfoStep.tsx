import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { getBuiltinPreset, rulesForOvers } from '@/domain/scoring/presets';
import { ChipGroup, ChoiceSheet, DateField, ErrorState, Inset, SectionHeader, Skeleton, TextField, TimeField, space, useFormChain, useLayoutClass } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, type MatchSetupDraft } from '@/stores';
import { PickerRow } from '@/features/scoring/components/common/PickerRow';
import { RulesEditor } from '../components/RulesEditor';
import { rulesIssues } from '../selectors/rules';
import { canLeaveInfo, choiceColumns, FORMAT_CHIPS, formatEdited, oversError, QUICK_OVERS } from '../selectors/wizard';
import { VenueSheet } from '../sheets/VenueSheet';
import { goToStep, WizardScreen } from './WizardScreen';
import { errorHeadline } from '@/features/scoring/selectors/scannable';
import { plural } from '@/features/shared';

export interface MatchInfoStepProps {
  readonly tournamentId?: string | null;
  readonly fixtureId?: string | null;
}

const FIELDS = ['title', 'overs'] as const;

function FixtureGate({ tournamentId, fixtureId }: { readonly tournamentId: string; readonly fixtureId: string }) {
  const draftFixture = useMatchSetupStore((s) => s.draft.fixtureId);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (draftFixture === fixtureId) {
      router.replace('/match/new/players');
      return;
    }
    void useMatchSetupStore
      .getState()
      .startFromFixture(tournamentId, fixtureId)
      .then((ok) => {
        if (ok) {
          router.replace('/match/new/players');
        } else {
          setFailed(errorHeadline(useMatchSetupStore.getState().error, "Couldn't prepare this fixture."));
        }
      });
  }, [draftFixture, fixtureId, tournamentId]);
  if (failed !== null) {
    return <ErrorState title="Couldn't start this fixture" body={failed} onRetry={() => setFailed(null)} testID="setup-fixture-error" />;
  }
  return <Skeleton rows={3} testID="setup-fixture-loading" />;
}

export function MatchInfoStep({ tournamentId = null, fixtureId = null }: MatchInfoStepProps) {
  const draft = useMatchSetupStore((s) => s.draft);
  const venues = useTeamLibraryStore((s) => s.venues);
  const teams = useTeamLibraryStore((s) => s.teams);
  const [customOvers, setCustomOvers] = useState(QUICK_OVERS.includes(draft.rules.oversPerInnings) ? '' : `${draft.rules.oversPerInnings}`);
  const [picker, setPicker] = useState<'venue' | 'new_venue' | null>(null);
  const chain = useFormChain(FIELDS, { onSubmit: () => submitInfo() });
  const layout = useLayoutClass();
  const { fontScale } = useWindowDimensions();

  useEffect(() => {
    void useTeamLibraryStore.getState().load();
  }, []);

  if (tournamentId !== null && fixtureId !== null) {
    return (
      <WizardScreen step="index" nextDisabled>
        <FixtureGate tournamentId={tournamentId} fixtureId={fixtureId} />
      </WizardScreen>
    );
  }

  const update = (patch: Partial<MatchSetupDraft>) => useMatchSetupStore.getState().update(patch);
  const preset = getBuiltinPreset(draft.formatId);
  const issues = rulesIssues(draft.rules);
  const overs = draft.rules.oversPerInnings;
  const typed = customOvers.trim() === '' ? null : Number.parseInt(customOvers, 10);
  const typedError = customOvers.trim() === '' ? null : oversError(Number.isFinite(typed) ? typed : null);
  const teamNames = [draft.teamAId, draft.teamBId].map((id) => teams.find((team) => team.id === id)?.name ?? null);
  const placeholder = teamNames[0] !== null && teamNames[1] !== null ? `${teamNames[0]} v ${teamNames[1]}` : 'Team A v Team B';
  const venueName = draft.venueId === null ? 'No venue' : venues.find((venue) => venue.id === draft.venueId)?.name ?? 'Venue';
  const blockingRules = issues.some((issue) => issue.severity === 'error');
  const nextReason = typedError ?? (blockingRules ? 'Fix the rules marked below' : null);

  const submitInfo = () => {
    if (canLeaveInfo(useMatchSetupStore.getState().draft) && typedError === null) {
      goToStep('teams');
    }
  };
  const pickVenue = (venueId: string | null) => {
    setPicker(null);
    update({ venueId });
  };
  const chooseFormat = (id: string) => {
    const chosen = getBuiltinPreset(id);
    if (chosen === null) {
      update({ formatId: 'custom' });
      return;
    }
    setCustomOvers('');
    update({ formatId: chosen.id, rules: chosen.rules });
  };
  const chooseOvers = (value: number) => {
    const formatId = preset !== null && preset.rules.oversPerInnings === value ? draft.formatId : 'custom';
    update({ formatId, rules: rulesForOvers(value, draft.rules) });
  };

  return (
    <WizardScreen step="index" nextDisabled={!canLeaveInfo(draft) || typedError !== null} nextReason={nextReason}>
      <Inset top="sm">
        <TextField
          {...chain.field('title')}
          label="Title (optional)"
          value={draft.title}
          onChangeText={(title) => update({ title })}
          placeholder={placeholder}
          autoCapitalize="sentences"
          testID="setup-title"
        />
      </Inset>
      <SectionHeader title={formatEdited(draft) ? 'Format · edited' : 'Format'} />
      <Inset>
        <ChipGroup
          options={FORMAT_CHIPS.map((chip) => ({ value: chip.id, label: chip.label, testID: `setup-format-${chip.id}` }))}
          value={preset === null ? 'custom' : `${preset.id}`}
          onChange={chooseFormat}
          columns={choiceColumns('format', layout.width, fontScale)}
          accessibilityLabel="Match format"
          testID="setup-format-group"
        />
      </Inset>
      <SectionHeader title="Overs per innings" />
      <Inset gap="sm">
        <ChipGroup
          options={QUICK_OVERS.map((value) => ({ value: `${value}`, label: `${value}`, accessibilityLabel: plural(value, 'over'), testID: `setup-overs-${value}` }))}
          value={customOvers.trim() === '' ? `${overs}` : null}
          onChange={(key) => {
            setCustomOvers('');
            chooseOvers(Number(key));
          }}
          columns={choiceColumns('overs', layout.width, fontScale)}
          accessibilityLabel="Overs per innings"
          testID="setup-overs-group"
        />
        <TextField
          {...chain.field('overs')}
          label="Other number of overs"
          value={customOvers}
          onChangeText={(text) => {
            setCustomOvers(text);
            const value = Number.parseInt(text, 10);
            if (oversError(Number.isFinite(value) ? value : null) === null) {
              chooseOvers(value);
            }
          }}
          numeric
          maxLength={3}
          placeholder="e.g. 12"
          error={typedError}
          testID="setup-overs-custom"
        />
      </Inset>
      <SectionHeader title="When and where" />
      <Inset bottom="xs">
        <View style={styles.when}>
          <View style={styles.whenField}>
            <DateField
              label="Date"
              value={draft.scheduledDate}
              optional
              onChange={(scheduledDate) => update(scheduledDate === null ? { scheduledDate: null, scheduledTime: null } : { scheduledDate })}
              testID="setup-date"
            />
          </View>
          {draft.scheduledDate !== null ? (
            <View style={styles.whenField}>
              <TimeField label="Start time" value={draft.scheduledTime} optional onChange={(scheduledTime) => update({ scheduledTime })} testID="setup-time" />
            </View>
          ) : null}
        </View>
      </Inset>
      <PickerRow label="Venue" value={venueName} placeholder={draft.venueId === null} onPress={() => setPicker('venue')} testID="setup-venue" />
      <RulesEditor
        rules={draft.rules}
        issues={issues}
        onChange={(rules) => update({ rules })}
        action={preset !== null ? { label: `Reset to ${preset.label}`, onPress: () => update({ rules: preset.rules }), testID: 'setup-rules-reset' } : undefined}
      />

      <ChoiceSheet
        visible={picker === 'venue'}
        title="Venue"
        onClose={() => setPicker(null)}
        testID="sheet-setup-venue"
        choices={[
          { key: 'none', title: 'No venue', kind: 'option', selected: draft.venueId === null, onPress: () => pickVenue(null) },
          ...venues.map((venue) => ({
            key: venue.id,
            title: venue.name,
            subtitle: venue.location ?? undefined,
            kind: 'option' as const,
            selected: draft.venueId === venue.id,
            onPress: () => pickVenue(venue.id),
          })),
          { key: 'new', title: 'Add a venue', icon: 'plus' as const, kind: 'action' as const, onPress: () => setPicker('new_venue') },
        ]}
      />
      {picker === 'new_venue' ? (
        <VenueSheet
          onCreated={(venueId) => {
            setPicker(null);
            update({ venueId });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  when: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  whenField: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
});

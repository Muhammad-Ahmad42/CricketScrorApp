import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { getBuiltinPreset, rulesForOvers } from '@/domain/scoring/presets';
import { ErrorState, SectionHeader, Skeleton, Text, TextField, space } from '@/ui';
import { useMatchSetupStore, useTeamLibraryStore, type MatchSetupDraft } from '@/stores';
import { PickerRow } from '@/features/scoring/components/common/PickerRow';
import { ChoiceSheet } from '@/features/scorecard/components/ChoiceSheet';
import { dateError, timeError } from '@/features/scorecard/sheets/DetailsSheet';
import { ChipRow } from '../components/ChipRow';
import { RulesEditor } from '../components/RulesEditor';
import { rulesIssues } from '../selectors/rules';
import { canLeaveInfo, FORMAT_CHIPS, formatTitle, oversError, QUICK_OVERS } from '../selectors/wizard';
import { VenueSheet } from '../sheets/VenueSheet';
import { WizardScreen } from './WizardScreen';

export interface MatchInfoStepProps {
  readonly tournamentId?: string | null;
  readonly fixtureId?: string | null;
}

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
          setFailed(useMatchSetupStore.getState().error?.message ?? "Couldn't prepare this fixture.");
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
  const date = draft.scheduledDate ?? '';
  const time = draft.scheduledTime ?? '';

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
    <WizardScreen step="index" nextDisabled={!canLeaveInfo(draft) || typedError !== null}>
      <View style={styles.block}>
        <TextField label="Title (optional)" value={draft.title} onChangeText={(title) => update({ title })} placeholder={placeholder} testID="setup-title" />
      </View>
      <SectionHeader title={`Format · ${formatTitle(draft)}`} />
      <ChipRow
        options={FORMAT_CHIPS.map((chip) => ({ key: chip.id, label: chip.label }))}
        selected={preset === null ? 'custom' : `${preset.id}`}
        onSelect={chooseFormat}
        accessibilityLabel="Match format"
        testIDPrefix="setup-format"
      />
      <SectionHeader title="Overs per innings" />
      <ChipRow
        options={QUICK_OVERS.map((value) => ({ key: `${value}`, label: `${value}`, accessibilityLabel: `${value} overs` }))}
        selected={customOvers.trim() === '' ? `${overs}` : null}
        onSelect={(key) => {
          setCustomOvers('');
          chooseOvers(Number(key));
        }}
        accessibilityLabel="Overs per innings"
        testIDPrefix="setup-overs"
      />
      <View style={styles.block}>
        <TextField
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
          placeholder="17"
          error={typedError}
          testID="setup-overs-custom"
        />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Date" value={date} onChangeText={(text) => update({ scheduledDate: text.trim() === '' ? null : text })} placeholder="2026-09-12" error={dateError(date)} testID="setup-date" />
          </View>
          <View style={styles.flex}>
            <TextField label="Time" value={time} onChangeText={(text) => update({ scheduledTime: text.trim() === '' ? null : text })} placeholder="14:00" error={timeError(time)} testID="setup-time" />
          </View>
        </View>
        <PickerRow label="Venue" value={venueName} placeholder={draft.venueId === null} onPress={() => setPicker('venue')} testID="setup-venue" />
      </View>
      <RulesEditor
        rules={draft.rules}
        issues={issues}
        onChange={(rules) => update({ rules })}
        action={preset !== null ? { label: `Reset to ${preset.label}`, onPress: () => update({ rules: preset.rules }), testID: 'setup-rules-reset' } : undefined}
      />
      {issues.length === 0 ? null : (
        <Text variant="footnote" tone="secondary" style={styles.block}>
          Fix the rules marked above to continue.
        </Text>
      )}
      <ChoiceSheet
        visible={picker === 'venue'}
        title="Venue"
        onClose={() => setPicker(null)}
        testID="sheet-setup-venue"
        choices={[
          { key: 'none', title: 'No venue', onPress: () => pickVenue(null) },
          ...venues.map((venue) => ({ key: venue.id, title: venue.name, subtitle: venue.location ?? undefined, onPress: () => pickVenue(venue.id) })),
          { key: 'new', title: 'Add a venue', icon: 'plus' as const, onPress: () => setPicker('new_venue') },
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
  block: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});

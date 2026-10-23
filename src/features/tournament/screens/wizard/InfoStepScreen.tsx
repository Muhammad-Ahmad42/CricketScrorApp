import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { isBlank } from '@/features/shared';
import { Button, ChoiceRow, DateField, Inset, ListRow, Sheet, Text, TextField, space, useFormChain, useLayoutClass } from '@/ui';
import { useTeamLibraryStore, useTournamentWizardStore } from '@/stores';
import type { NewTournamentInput } from '@/services/contracts';
import { showError } from '../../hooks/toast';
import { useVenues } from '../../hooks/useLibrary';
import { infoErrors } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

type InfoField = 'name' | 'season' | 'organizer';

export const INFO_FIELDS: readonly InfoField[] = ['name', 'season', 'organizer'];

function VenuesSheet({
  visible,
  selected,
  onToggle,
  onClose,
}: {
  readonly visible: boolean;
  readonly selected: readonly string[];
  readonly onToggle: (venueId: string) => void;
  readonly onClose: () => void;
}) {
  const window = useWindowDimensions();
  const venues = useVenues();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (isBlank(name)) {
      return;
    }
    setAdding(true);
    const venue = await useTeamLibraryStore.getState().createVenue({ name: name.trim(), location: null });
    setAdding(false);
    if (venue) {
      setName('');
      onToggle(venue.id);
    } else {
      showError(useTeamLibraryStore.getState().error, "Couldn't add this venue.");
    }
  };
  const guard = useDiscardGuard(!isBlank(name), onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title="Venues"
        onClose={guard.requestClose}
        scrollable={false}
        testID="sheet-venues"
        footer={<Button label="Done" onPress={guard.requestClose} fullWidth testID="twiz-btn-venues-done" />}
      >
        <View style={styles.sheetBody}>
          <FlatList
            data={venues}
            keyExtractor={(venue) => venue.id}
            style={{ maxHeight: window.height * 0.35 }}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="list"
            accessibilityLabel="Venues"
            ListEmptyComponent={
              <Text variant="callout" tone="secondary">
                No venues yet
              </Text>
            }
            renderItem={({ item, index }) => (
              <ChoiceRow
                kind="checkbox"
                label={item.name}
                description={item.location ?? undefined}
                selected={selected.includes(item.id)}
                onPress={() => onToggle(item.id)}
                separator={index < venues.length - 1}
                testID={`twiz-row-venue-${index + 1}`}
              />
            )}
          />
          <View style={styles.addVenue}>
            <View style={styles.flex}>
              <TextField
                label="New venue"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => void add()}
                testID="twiz-input-venue-name"
              />
            </View>
            <Button label="Add" variant="secondary" disabled={isBlank(name)} loading={adding} onPress={() => void add()} testID="twiz-btn-venue-add" />
          </View>
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

export function InfoStepScreen() {
  const info = useTournamentWizardStore((state) => state.draft.info);
  const venues = useVenues();
  const layout = useLayoutClass();
  const [attempted, setAttempted] = useState(false);
  const [venuesOpen, setVenuesOpen] = useState(false);
  const chain = useFormChain(INFO_FIELDS);
  const errors = infoErrors(info);
  const shown = attempted ? errors : { name: null, startDate: errors.startDate, endDate: errors.endDate };
  const side = layout.width === 'medium' || layout.width === 'expanded';
  const set = (patch: Partial<NewTournamentInput>) => {
    const current = useTournamentWizardStore.getState().draft.info;
    useTournamentWizardStore.getState().update({ info: { ...current, ...patch } });
  };
  const venueNames = venues.filter((venue) => info.venueIds.includes(venue.id)).map((venue) => venue.name);
  const venueText = venueNames.length === 0 ? 'None' : venueNames.length === 1 ? venueNames[0] : `${venueNames.length} venues`;

  return (
    <WizardFrame
      step="info"
      validate={() => {
        setAttempted(true);
        return errors.name === null && errors.startDate === null && errors.endDate === null;
      }}
    >
      <Inset top="md" bottom="md" gap="md">
        <TextField
          label="Name"
          value={info.name}
          onChangeText={(name) => set({ name })}
          error={shown.name}
          autoCapitalize="words"
          maxLength={80}
          {...chain.field('name')}
          testID="twiz-input-name"
        />
        <View style={side ? styles.pair : styles.stack}>
          <View style={side ? styles.flex : null}>
            <TextField
              label="Season (optional)"
              value={info.season ?? ''}
              onChangeText={(season) => set({ season: season.length === 0 ? null : season })}
              {...chain.field('season')}
              testID="twiz-input-season"
            />
          </View>
          <View style={side ? styles.flex : null}>
            <TextField
              label="Organizer (optional)"
              value={info.organizer ?? ''}
              onChangeText={(organizer) => set({ organizer: organizer.length === 0 ? null : organizer })}
              autoCapitalize="words"
              {...chain.field('organizer')}
              testID="twiz-input-organizer"
            />
          </View>
        </View>
        <View style={side ? styles.pair : styles.stack}>
          <View style={side ? styles.flex : null}>
            <DateField label="Starts" value={info.startDate} onChange={(startDate) => set({ startDate })} optional error={shown.startDate} testID="twiz-input-start-date" />
          </View>
          <View style={side ? styles.flex : null}>
            <DateField
              label="Ends"
              value={info.endDate}
              onChange={(endDate) => set({ endDate })}
              minimumDate={info.startDate}
              optional
              error={shown.endDate}
              testID="twiz-input-end-date"
            />
          </View>
        </View>
      </Inset>
      <ListRow title="Venues" trailing={{ kind: 'value', text: venueText, chevron: true }} onPress={() => setVenuesOpen(true)} testID="twiz-btn-venues" />
      <Inset top="md" bottom="md">
        <TextField
          label="Description (optional)"
          value={info.description ?? ''}
          onChangeText={(description) => set({ description: description.length === 0 ? null : description })}
          multiline
          testID="twiz-input-description"
        />
      </Inset>
      <VenuesSheet
        visible={venuesOpen}
        selected={info.venueIds}
        onClose={() => setVenuesOpen(false)}
        onToggle={(venueId) => {
          const current = useTournamentWizardStore.getState().draft.info.venueIds;
          set({ venueIds: current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId] });
        }}
      />
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.sm },
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  sheetBody: { gap: space.md },
  addVenue: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
});
